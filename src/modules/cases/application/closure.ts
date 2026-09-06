import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { CaseOutcome } from '@prisma-client/enums';
import { EXIGEN_CANALIZACION_ACEPTADA, RESULTADOS_QUE_ADMITEN_REAPERTURA } from '../domain/closure';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Cierre con resultado y reapertura controlada (PRD §10.2).
 *
 * **Cerrar es decir cómo acabó, no dejar de mirar.** El resultado es un dato
 * del catálogo y el motivo se escribe: la base exige los dos, porque un
 * expediente cerrado sin decir qué pasó no se distingue de uno abandonado, y
 * en tres años nadie podrá decir si a esa persona se le resolvió algo.
 *
 * **Un cierre no puede contradecir lo que consta.** No se cierra por
 * canalización lo que ninguna área receptora aceptó, ni se cierra con tareas
 * abiertas o con un riesgo que nadie recogió: sería declarar terminado un
 * asunto que el propio expediente dice que sigue.
 *
 * **Reabrir es un acto acotado.** No devuelve el expediente a su estado
 * anterior: lo reabre contando **cuántas veces** ha ocurrido y por qué. Y no
 * todo cierre admite reapertura: lo que se cerró porque no era competencia de
 * la organización no se reabre, se abre donde toca.
 */

const RESULTADOS = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'REFERRED',
  'WITHDRAWN_BY_PERSON',
  'NOT_COMPETENT',
  'NO_CONTACT',
] as const;

export const closeCaseSchema = z.object({
  caseId: z.uuid(),
  outcome: z.enum(RESULTADOS satisfies readonly CaseOutcome[], {
    error: () => 'Elige cómo acabó el asunto.',
  }),
  reason: z.string().trim().min(20, {
    error: () =>
      'Escribe qué pasó, con lo que haga falta para entenderlo dentro de tres años: al menos veinte caracteres.',
  }),
});

export type CloseCaseInput = z.infer<typeof closeCaseSchema>;

export const reopenCaseSchema = z.object({
  caseId: z.uuid(),
  reason: z.string().trim().min(20, {
    error: () => 'Escribe por qué se reabre: al menos veinte caracteres.',
  }),
});

export type ReopenCaseInput = z.infer<typeof reopenCaseSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function closeCase(
  actor: ActorContext,
  input: CloseCaseInput,
): Promise<UseCaseResult<{ folio: string; outcome: CaseOutcome }>> {
  const parsed = closeCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: {
      ...CAMPOS_PARA_DECIDIR,
      folio: true,
      status: true,
      _count: {
        select: {
          tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } } },
          emergencyFlags: { where: { closedAt: null } },
        },
      },
      referralsOut: { select: { status: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente ya está cerrado.'));
  }

  const asignada = await estaAsignada(actor, expediente.id);
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.case.close', recursoDelExpediente(expediente), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Un cierre no puede contradecir lo que el propio expediente dice.
  if (expediente._count.emergencyFlags > 0) {
    return fail(
      errors.ruleViolation(
        'Hay una marca de riesgo sin cerrar. Ciérrala diciendo qué se hizo antes de dar por terminado el asunto.',
      ),
    );
  }
  if (expediente._count.tasks > 0) {
    return fail(
      errors.ruleViolation(
        `Quedan ${expediente._count.tasks} tarea(s) sin terminar. Termínalas o cancélalas con su motivo: un expediente cerrado con trabajo pendiente dice que alguien lo dejó a medias.`,
      ),
    );
  }
  if (EXIGEN_CANALIZACION_ACEPTADA.includes(data.outcome)) {
    const aceptada = expediente.referralsOut.some(
      (canalizacion) => canalizacion.status === 'ACCEPTED' || canalizacion.status === 'CLOSED',
    );
    if (!aceptada) {
      return fail(
        errors.ruleViolation(
          'Ninguna área receptora aceptó una canalización de este expediente. Cerrarlo como canalizado diría que alguien se hizo cargo cuando nadie lo hizo.',
        ),
      );
    }
  }

  const cerrado = await transaction(async (tx) => {
    const fila = await tx.case.update({
      where: { id: expediente.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closeOutcome: data.outcome,
        closeReason: data.reason,
        updatedByActorId: actor.actorId,
      },
      select: { folio: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'CLOSED',
        actorId: actor.actorId,
        summary: `Expediente cerrado: ${data.outcome}.`,
        payload: { resultado: data.outcome, motivo: data.reason },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_CLOSED,
      objectKind: 'Case',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      reason: data.reason,
      metadata: { folio: fila.folio, resultado: data.outcome },
    });

    return fila;
  });

  return ok({ folio: cerrado.folio, outcome: data.outcome });
}

export async function reopenCase(
  actor: ActorContext,
  input: ReopenCaseInput,
): Promise<UseCaseResult<{ folio: string; veces: number }>> {
  const parsed = reopenCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true, closeOutcome: true, reopenCount: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status !== 'CLOSED') {
    return fail(errors.conflict('Ese expediente no está cerrado.'));
  }

  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.case.reopen', recursoDelExpediente(expediente));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Lo que se cerró porque no era de esta organización no se reabre aquí.
  if (expediente.closeOutcome !== null && !RESULTADOS_QUE_ADMITEN_REAPERTURA.includes(expediente.closeOutcome)) {
    return fail(
      errors.ruleViolation(
        'Este expediente se cerró porque el asunto no era competencia de la organización. Reabrirlo no lo vuelve competencia suya: ábrelo donde corresponda, o canalízalo.',
      ),
    );
  }

  const reabierto = await transaction(async (tx) => {
    const fila = await tx.case.update({
      where: { id: expediente.id },
      data: {
        status: 'IN_PROGRESS',
        // El cierre anterior se deshace porque la base exige que estado y
        // cierre no se contradigan. Lo que **no** se pierde es que ocurrió: la
        // cuenta sube y la bitácora guarda con qué resultado se había cerrado.
        closedAt: null,
        closeOutcome: null,
        closeReason: null,
        reopenCount: { increment: 1 },
        updatedByActorId: actor.actorId,
      },
      select: { folio: true, reopenCount: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'REOPENED',
        actorId: actor.actorId,
        summary: `Expediente reabierto por ${fila.reopenCount}.ª vez.`,
        payload: {
          motivo: data.reason,
          resultadoAnterior: expediente.closeOutcome,
          vecesReabierto: fila.reopenCount,
        },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_REOPENED,
      objectKind: 'Case',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      reason: data.reason,
      metadata: {
        folio: fila.folio,
        resultadoAnterior: expediente.closeOutcome,
        vecesReabierto: fila.reopenCount,
      },
    });

    return fila;
  });

  return ok({ folio: reabierto.folio, veces: reabierto.reopenCount });
}
