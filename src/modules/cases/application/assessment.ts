import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { CasePriority, CaseStatus } from '@prisma-client/enums';
import type { Prisma } from '@prisma-client/client';
import { compartimentoDe } from '../domain/access';
import { estaAsignada } from './assignment';

/**
 * Valoración humana del expediente (PRD §10.2).
 *
 * Se escribe **al lado** del relato original, nunca encima. El relato es lo que
 * la persona contó y el motor impide alterarlo; la valoración es lo que la
 * organización concluye, y tiene que poder cambiar sin que cambie aquello sobre
 * lo que se concluyó.
 *
 * La primera valoración marca además el instante de primera respuesta, que es
 * el insumo del único indicador que el PRD contrata sobre tiempos. Se escribe
 * una sola vez: si se reescribiera en cada valoración, el indicador mediría la
 * última vez que alguien tocó el expediente, que no es lo mismo ni de lejos.
 */

export const assessCaseSchema = z.object({
  caseId: z.uuid(),
  humanAssessment: z.string().trim().min(30, {
    error: () => 'Escribe la valoración: qué se entiende que pasa y qué se propone hacer.',
  }).max(50_000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const satisfies readonly CasePriority[]),
  status: z.enum([
    'OPEN',
    'IN_PROGRESS',
    'WAITING_ON_PERSON',
    'WAITING_ON_THIRD_PARTY',
  ] as const satisfies readonly CaseStatus[]),
  /** Cuándo hay que haber hecho algo. Nulo cuando no hay plazo real. */
  dueAt: z.string().trim().min(10).max(40).nullable().default(null),
});

export type AssessCaseInput = z.input<typeof assessCaseSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function assessCase(
  actor: ActorContext,
  input: AssessCaseInput,
): Promise<UseCaseResult<{ folio: string; primeraRespuesta: boolean }>> {
  const parsed = assessCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      folio: true,
      domain: true,
      legalEntityId: true,
      status: true,
      priority: true,
      firstResponseAt: true,
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de valorarlo otra vez.'));
  }

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(
    actor,
    'cases.case.update',
    {
      kind: 'Case',
      id: expediente.id,
      legalEntityId: expediente.legalEntityId,
      compartment: compartimentoDe(expediente.domain),
    },
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const esPrimeraRespuesta = expediente.firstResponseAt === null;
  const plazo = data.dueAt === null ? null : new Date(data.dueAt);
  if (plazo !== null && Number.isNaN(plazo.getTime())) {
    return fail(errors.validation({ dueAt: ['Esa fecha no se entiende.'] }));
  }

  await transaction(async (tx) => {
    await tx.case.update({
      where: { id: expediente.id },
      data: {
        humanAssessment: data.humanAssessment,
        priority: data.priority,
        status: data.status,
        dueAt: plazo,
        ...(esPrimeraRespuesta ? { firstResponseAt: ahora } : {}),
        updatedByActorId: actor.actorId,
      },
    });

    const asientos: Prisma.CaseEventCreateManyInput[] = [
      {
        caseId: expediente.id,
        kind: 'STATUS_CHANGED',
        actorId: actor.actorId,
        summary: `Valorado. Estado: ${data.status}.`,
        payload: { anterior: expediente.status, nuevo: data.status },
      },
    ];
    if (expediente.priority !== data.priority) {
      asientos.push({
        caseId: expediente.id,
        kind: 'PRIORITY_CHANGED',
        actorId: actor.actorId,
        summary: `Prioridad: ${data.priority}.`,
        payload: { anterior: expediente.priority, nueva: data.priority },
      });
    }
    await tx.caseEvent.createMany({ data: asientos });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_ASSESSED,
      objectKind: 'Case',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: {
        folio: expediente.folio,
        prioridad: data.priority,
        estado: data.status,
        primeraRespuesta: esPrimeraRespuesta,
      },
    });
  });

  return ok({ folio: expediente.folio, primeraRespuesta: esPrimeraRespuesta });
}
