import { z } from 'zod';
import type { RoleCode } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, effectiveGrantedPermissions, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit, recordSecurity } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Otorgamiento y revocación de roles (PRD §4.3, docs/PERMISSIONS.md §7).
 *
 * Criterio de aceptación de la Fase 1: **un administrador ordinario no puede
 * asignarse permisos superiores**. Se garantiza con dos comprobaciones que no
 * pueden omitirse:
 *
 *  1. Nadie otorga un permiso que no posee (regla de no elevación).
 *  2. Nadie se otorga un rol a sí mismo, aunque tuviera los permisos.
 *
 * La segunda no es redundante: sin ella, alguien con `access.role.assign` podría
 * concentrar en su propia cuenta todos los roles cuyos permisos ya ostenta a
 * través de nombramientos distintos, saltándose el control institucional de
 * quién nombra a quién.
 */

export const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleCode: z.string().min(2),
  legalEntityId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
  territorialUnitIds: z.array(z.uuid()).default([]),
  includesDescendants: z.boolean().default(true),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe el motivo del nombramiento: al menos diez caracteres.',
  }),
  endsAt: z.iso.datetime().optional(),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export async function assignRole(
  actor: ActorContext,
  input: AssignRoleInput,
): Promise<UseCaseResult<{ assignmentId: string }>> {
  const parsed = assignRoleSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const data = parsed.data;
  const contextWithReason: ActorContext = { ...actor, reason: data.reason };

  const decision = can(contextWithReason, 'access.role.assign', {
    kind: 'RoleAssignment',
    legalEntityId: data.legalEntityId ?? null,
    organizationId: data.organizationId ?? null,
  });
  if (!decision.allowed) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'WARNING',
        actorId: actor.actorId === '' ? null : actor.actorId,
        detail: { permission: 'access.role.assign', reason: decision.reason },
        correlationId: actor.correlationId,
      }),
    );
    return fail(errors.forbidden(explain(decision.reason!)));
  }

  // --- Control 1: nadie se nombra a sí mismo ------------------------------
  if (actor.userId !== null && data.userId === actor.userId) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'CRITICAL',
        actorId: actor.actorId,
        detail: { permission: 'access.role.assign', reason: 'autonombramiento' },
        correlationId: actor.correlationId,
      }),
    );
    return fail(
      errors.ruleViolation(
        'No puedes otorgarte un rol a ti misma o a ti mismo. Los nombramientos los realiza otra persona con facultades para ello.',
        'intento de autonombramiento',
      ),
    );
  }

  const role = await db().role.findUnique({
    where: { code: data.roleCode as RoleCode },
    select: { id: true, code: true, permissions: { select: { permission: { select: { code: true } } } } },
  });
  if (role === null) return fail(errors.notFound('el rol solicitado no existe en el catálogo'));

  // --- Control 2: nadie otorga lo que no posee ---------------------------
  // Sin excepción por tipo de actor. La versión anterior eximía al Superadmin
  // raíz; la exención era inalcanzable —`access.role.assign` no figura en su
  // lista cerrada— pero habría abierto una vía de elevación en el instante en
  // que alguien añadiera ese permiso a la lista, sin que ninguna prueba lo
  // advirtiera. Una excepción que hoy no se ejecuta sigue siendo una excepción.
  const mine = effectiveGrantedPermissions(actor);
  const granting = role.permissions.map((link) => link.permission.code);
  const excess = granting.filter((code) => !mine.has(code));

  if (excess.length > 0) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'CRITICAL',
        actorId: actor.actorId,
        detail: { permission: 'access.role.assign', reason: 'elevación de privilegios', excess },
        correlationId: actor.correlationId,
      }),
    );
    return fail(
      errors.forbidden(
        `intento de otorgar permisos que el actor no posee: ${excess.join(', ')}`,
        'No puedes otorgar un rol que incluye permisos que tú no tienes.',
      ),
    );
  }

  const target = await db().user.findUnique({ where: { id: data.userId }, select: { id: true, status: true } });
  if (target === null) return fail(errors.notFound('la cuenta destinataria no existe'));
  if (target.status === 'DISABLED') {
    return fail(errors.ruleViolation('La cuenta está deshabilitada. Habilítala antes de otorgarle un rol.'));
  }

  if (actor.userId === null) {
    return fail(
      errors.ruleViolation(
        'El nombramiento debe registrarlo una persona identificada.',
        'el Superadmin raíz no puede figurar como quien otorga un nombramiento (PRD §4.4)',
      ),
    );
  }

  const assignmentId = await transaction(async (tx) => {
    const created = await tx.roleAssignment.create({
      data: {
        userId: data.userId,
        roleId: role.id,
        legalEntityId: data.legalEntityId ?? null,
        organizationId: data.organizationId ?? null,
        grantedById: actor.userId!,
        grantReason: data.reason,
        endsAt: data.endsAt === undefined ? null : new Date(data.endsAt),
        territorialScopes: {
          create: data.territorialUnitIds.map((territorialUnitId) => ({
            territorialUnitId,
            includesDescendants: data.includesDescendants,
          })),
        },
      },
      select: { id: true },
    });

    await recordAudit(tx, contextWithReason, {
      action: AUDIT_ACTIONS.ROLE_GRANTED,
      objectKind: 'RoleAssignment',
      objectId: created.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId ?? null,
      reason: data.reason,
      metadata: { role: role.code, targetUserId: data.userId, endsAt: data.endsAt ?? null },
    });

    await recordSecurity(tx, {
      kind: 'PRIVILEGE_GRANTED',
      severity: 'WARNING',
      actorId: actor.actorId,
      detail: { role: role.code, targetUserId: data.userId },
      correlationId: actor.correlationId,
    });

    return created.id;
  });

  return ok({ assignmentId });
}

/* -------------------------------------------------------------------------- */
/* Revocación                                                                 */
/* -------------------------------------------------------------------------- */

export const revokeRoleSchema = z.object({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe el motivo de la revocación: al menos diez caracteres.' }),
});

export async function revokeRole(
  actor: ActorContext,
  input: z.infer<typeof revokeRoleSchema>,
): Promise<UseCaseResult<{ revoked: boolean }>> {
  const parsed = revokeRoleSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const assignment = await db().roleAssignment.findUnique({
    where: { id: parsed.data.assignmentId },
    select: { id: true, userId: true, legalEntityId: true, revokedAt: true, role: { select: { code: true } } },
  });
  if (assignment === null) return fail(errors.notFound('el nombramiento no existe'));

  const contextWithReason: ActorContext = { ...actor, reason: parsed.data.reason };
  const decision = can(contextWithReason, 'access.role.revoke', {
    kind: 'RoleAssignment',
    id: assignment.id,
    legalEntityId: assignment.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (assignment.revokedAt !== null) return ok({ revoked: false });

  await transaction(async (tx) => {
    await tx.roleAssignment.update({
      where: { id: assignment.id },
      data: {
        revokedAt: new Date(),
        revokedById: actor.userId,
        revokeReason: parsed.data.reason,
      },
    });

    await recordAudit(tx, contextWithReason, {
      action: AUDIT_ACTIONS.ROLE_REVOKED,
      objectKind: 'RoleAssignment',
      objectId: assignment.id,
      outcome: 'SUCCESS',
      legalEntityId: assignment.legalEntityId,
      reason: parsed.data.reason,
      metadata: { role: assignment.role.code, targetUserId: assignment.userId },
    });

    await recordSecurity(tx, {
      kind: 'PRIVILEGE_REVOKED',
      severity: 'WARNING',
      actorId: actor.actorId === '' ? null : actor.actorId,
      detail: { role: assignment.role.code, targetUserId: assignment.userId },
      correlationId: actor.correlationId,
    });
  });

  return ok({ revoked: true });
}

/**
 * Revocación automática de nombramientos vencidos (PRD §4.3).
 *
 * Lo ejecuta el trabajo programado `role-expiry`. El acceso ya deja de conceder
 * en el momento del vencimiento —el motor solo considera asignaciones vigentes—;
 * este trabajo materializa la revocación para que quede constancia explícita y
 * el historial refleje el hecho institucional, no solo su efecto.
 */
export async function expireDueRoleAssignments(actor: ActorContext): Promise<UseCaseResult<{ revoked: number }>> {
  const decision = can(actor, 'access.role.revoke', { kind: 'RoleAssignment' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const now = new Date();
  const due = await db().roleAssignment.findMany({
    where: { revokedAt: null, endsAt: { not: null, lte: now } },
    select: { id: true, userId: true, legalEntityId: true, role: { select: { code: true } } },
    take: 200,
  });

  if (due.length === 0) return ok({ revoked: 0 });

  await transaction(async (tx) => {
    for (const assignment of due) {
      await tx.roleAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: now, revokeReason: 'Término del periodo del nombramiento' },
      });
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.ROLE_EXPIRED,
        objectKind: 'RoleAssignment',
        objectId: assignment.id,
        outcome: 'SUCCESS',
        legalEntityId: assignment.legalEntityId,
        reason: 'Término del periodo del nombramiento',
        metadata: { role: assignment.role.code, targetUserId: assignment.userId },
      });
    }
  });

  return ok({ revoked: due.length });
}
