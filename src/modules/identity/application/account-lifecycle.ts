import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import { withReason, type ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Cierre y reapertura de una cuenta de acceso (PRD §4.3, defecto `D-F4-003`).
 *
 * El permiso `identity.user.disable` estaba declarado desde la Fase 1 y no lo
 * tenía nadie, no lo ejercía ningún caso de uso y no había pantalla desde la que
 * usarlo. El efecto práctico: una cuenta invitada por error, o la de alguien que
 * dejó la organización, no se podía cerrar desde ninguna parte.
 *
 * Lo ejerce la misma cartera que invita. Quien abre la puerta la cierra: separar
 * las dos facultades dejaría a quien invita sin poder deshacer su propio error.
 *
 * **Cerrar no es borrar.** La fila permanece con su historial, sus
 * nombramientos revocados y su auditoría. Lo que se acaba es el acceso: estado
 * `DISABLED`, sesiones revocadas y `sessionVersion` incrementado, que invalida
 * cualquier testigo emitido aunque no se haya recorrido su fila.
 */

export const disableAccountSchema = z.object({
  userId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(15, { error: () => 'Escribe por qué se cierra esta cuenta. Mínimo quince caracteres.' })
    .max(400),
});

export type DisableAccountInput = z.infer<typeof disableAccountSchema>;

export const reenableAccountSchema = z.object({
  userId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(15, { error: () => 'Escribe por qué se reabre esta cuenta. Mínimo quince caracteres.' })
    .max(400),
});

export type ReenableAccountInput = z.infer<typeof reenableAccountSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface AccountChange {
  readonly userId: string;
  readonly status: 'ACTIVE' | 'DISABLED' | 'INVITED';
  readonly revokedSessions: number;
  readonly revokedAssignments: number;
}

export async function disableAccount(
  actor: ActorContext,
  input: DisableAccountInput,
): Promise<UseCaseResult<AccountChange>> {
  const parsed = disableAccountSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const { userId, reason } = parsed.data;
  const conMotivo = withReason(actor, reason);

  const decision = can(conMotivo, 'identity.user.disable', { kind: 'User', id: userId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const cuenta = await db().user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });
  if (cuenta === null) return fail(errors.notFound('cuenta inexistente'));

  // Cerrar la propia cuenta deja a la organización con una persona menos con
  // facultades y a esa persona fuera, sin que nadie lo haya decidido.
  if (actor.userId === userId) {
    return fail(
      errors.ruleViolation(
        'No puedes cerrar tu propia cuenta. Pídeselo a otra persona con la misma facultad.',
        'intento de autocierre',
      ),
    );
  }

  if (cuenta.status === 'DISABLED') {
    return fail(errors.conflict('Esa cuenta ya está cerrada.', 'la cuenta ya está deshabilitada'));
  }

  const resultado = await transaction(async (tx) => {
    const ahora = new Date();
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DISABLED',
        sessionVersion: { increment: 1 },
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    const sesiones = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: ahora, revokedReason: 'ADMIN_ACTION' },
    });

    const nombramientos = await tx.roleAssignment.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: ahora, revokeReason: `Cierre de cuenta: ${reason}` },
    });

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.USER_DISABLED,
      objectKind: 'User',
      objectId: userId,
      outcome: 'SUCCESS',
      reason,
      metadata: { sesionesRevocadas: sesiones.count, nombramientosRevocados: nombramientos.count },
    });

    return { sesiones: sesiones.count, nombramientos: nombramientos.count };
  });

  return ok({
    userId,
    status: 'DISABLED',
    revokedSessions: resultado.sesiones,
    revokedAssignments: resultado.nombramientos,
  });
}

/**
 * Reabre una cuenta cerrada.
 *
 * **No devuelve los nombramientos.** Se revocaron al cerrar y volver a
 * otorgarlos es un acto institucional aparte, con su motivo y su fecha: un
 * cargo que reaparece solo porque alguien reabrió una cuenta es un cargo que
 * nadie confirió.
 */
export async function reenableAccount(
  actor: ActorContext,
  input: ReenableAccountInput,
): Promise<UseCaseResult<AccountChange>> {
  const parsed = reenableAccountSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const { userId, reason } = parsed.data;
  const conMotivo = withReason(actor, reason);

  const decision = can(conMotivo, 'identity.user.disable', { kind: 'User', id: userId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const cuenta = await db().user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, emailVerifiedAt: true, person: { select: { mergedIntoPersonId: true } } },
  });
  if (cuenta === null) return fail(errors.notFound('cuenta inexistente'));
  if (cuenta.status !== 'DISABLED') {
    return fail(errors.conflict('Esa cuenta no está cerrada.', 'la cuenta no está deshabilitada'));
  }
  if (cuenta.person.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'El registro de esa cuenta quedó fusionado con otro. Reabrirla devolvería a la misma persona dos identidades.',
        'la persona de la cuenta está fusionada',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        // Quien nunca activó su invitación vuelve a estar invitada, no activa:
        // reabrir no es lo mismo que dar por buena una contraseña que nadie eligió.
        status: cuenta.emailVerifiedAt === null ? 'INVITED' : 'ACTIVE',
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.USER_REENABLED,
      objectKind: 'User',
      objectId: userId,
      outcome: 'SUCCESS',
      reason,
    });
  });

  return {
    ok: true,
    data: {
      userId,
      status: cuenta.emailVerifiedAt === null ? 'INVITED' : 'ACTIVE',
      revokedSessions: 0,
      revokedAssignments: 0,
    },
  };
}
