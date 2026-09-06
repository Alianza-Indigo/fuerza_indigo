import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { uploadFile } from '@/platform/files';
import type { ObligationKind, ObligationStatus } from '@prisma-client/enums';

/**
 * Obligaciones ante la autoridad laboral (PRD §9.7; F5-CUM-001, F5-CUM-002).
 *
 * **Una obligación nace de un acto, no de un calendario.** `triggerEventRef`
 * guarda cuál: la asamblea que cambió la dirigencia, la reforma estatutaria, el
 * cierre del ejercicio. Sin esa referencia, quien la revise dentro de dos años
 * no sabrá por qué existía ni si se cumplió lo que correspondía.
 *
 * **Presentar exige el acuse.** Marcar una obligación como presentada sin el
 * documento de la autoridad convierte el registro en una lista de buenas
 * intenciones. La evidencia se adjunta en el mismo acto.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const openObligationSchema = z.object({
  legalEntityId: z.uuid(),
  kind: z.enum(['MEMBER_REGISTRY_UPDATE', 'LEADERSHIP_CHANGE', 'STATUTE_AMENDMENT', 'FINANCIAL_REPORT', 'OTHER']),
  triggerEventRef: z.string().trim().min(5).max(200, {
    error: () => 'Di qué acto la origina: la asamblea, la reforma, el ejercicio que cierra.',
  }),
  dueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-01-01.' }),
});

export type OpenObligationInput = z.infer<typeof openObligationSchema>;

export async function openObligation(
  actor: ActorContext,
  input: OpenObligationInput,
): Promise<UseCaseResult<{ obligationId: string }>> {
  const parsed = openObligationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'compliance.obligation.manage', { kind: 'ComplianceObligation' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { id: true, shortName: true },
  });
  if (entidad === null) return fail(errors.notFound('Esa entidad jurídica no existe.'));

  const abierta = await transaction(async (tx) => {
    const fila = await tx.complianceObligation.create({
      data: {
        legalEntityId: entidad.id,
        kind: data.kind,
        triggerEventRef: data.triggerEventRef,
        dueAt: new Date(`${data.dueOn}T23:59:59.999Z`),
        status: 'PENDING',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.OBLIGATION_OPENED,
      objectKind: 'ComplianceObligation',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: entidad.id,
      metadata: { tipo: data.kind, origen: data.triggerEventRef, vence: data.dueOn },
    });

    return fila;
  });

  return ok({ obligationId: abierta.id });
}

export const advanceObligationSchema = z.object({
  obligationId: z.uuid(),
  status: z.enum(['PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'OBSERVED', 'CLOSED']),
  authorityReference: z.string().trim().max(120).nullable().default(null),
  note: z.string().trim().min(10).max(2000),
});

export interface ObligationEvidence {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface AdvanceObligationInput extends z.infer<typeof advanceObligationSchema> {
  readonly evidence?: ObligationEvidence | null;
}

export async function advanceObligation(
  actor: ActorContext,
  input: AdvanceObligationInput,
): Promise<UseCaseResult<{ status: ObligationStatus }>> {
  const parsed = advanceObligationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'compliance.obligation.manage', { kind: 'ComplianceObligation' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const obligacion = await db().complianceObligation.findUnique({
    where: { id: data.obligationId },
    select: { id: true, status: true, kind: true, legalEntityId: true, triggerEventRef: true },
  });
  if (obligacion === null) return fail(errors.notFound('Esa obligación no existe.'));
  if (obligacion.status === 'CLOSED') return fail(errors.conflict('Esa obligación ya está cerrada.'));

  const evidencia = input.evidence ?? null;
  if (data.status === 'SUBMITTED' && evidencia === null) {
    return fail(
      errors.validation({
        evidence: ['Dar por presentada una obligación exige el acuse de la autoridad. Sin él, es una intención.'],
      }),
    );
  }

  let evidenciaId: string | null = null;
  if (evidencia !== null) {
    const guardado = await uploadFile(actor, {
      legalEntityId: obligacion.legalEntityId,
      classification: 'INTERNAL',
      contextKind: 'GOVERNANCE',
      contextId: obligacion.id,
      originalFileName: evidencia.fileName,
      mimeType: evidencia.mimeType,
      content: evidencia.content,
    });
    if (!guardado.ok) return fail(guardado.error);
    evidenciaId = guardado.data.fileObjectId;
  }

  await transaction(async (tx) => {
    await tx.complianceObligation.update({
      where: { id: obligacion.id },
      data: {
        status: data.status,
        authorityReference: data.authorityReference,
        ...(data.status === 'SUBMITTED' ? { submittedAt: new Date() } : {}),
        updatedByActorId: actor.actorId,
      },
    });

    if (evidenciaId !== null) {
      await tx.complianceObligationDocument.create({
        data: { obligationId: obligacion.id, fileObjectId: evidenciaId },
      });
    }

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.OBLIGATION_ADVANCED,
      objectKind: 'ComplianceObligation',
      objectId: obligacion.id,
      outcome: 'SUCCESS',
      legalEntityId: obligacion.legalEntityId,
      reason: data.note,
      metadata: {
        de: obligacion.status,
        a: data.status,
        referenciaDeAutoridad: data.authorityReference,
        conAcuse: evidenciaId !== null,
      },
    });
  });

  return ok({ status: data.status });
}

export interface ObligationRow {
  readonly id: string;
  readonly kind: ObligationKind;
  readonly status: ObligationStatus;
  readonly triggerEventRef: string;
  readonly dueAt: Date;
  readonly submittedAt: Date | null;
  readonly authorityReference: string | null;
  readonly legalEntity: string;
  readonly documentCount: number;
  readonly overdue: boolean;
}

export async function obligationList(actor: ActorContext): Promise<UseCaseResult<readonly ObligationRow[]>> {
  const decision = can(actor, 'compliance.obligation.read', { kind: 'ComplianceObligation' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().complianceObligation.findMany({
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      kind: true,
      status: true,
      triggerEventRef: true,
      dueAt: true,
      submittedAt: true,
      authorityReference: true,
      legalEntity: { select: { shortName: true } },
      _count: { select: { documents: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      kind: fila.kind,
      status: fila.status,
      triggerEventRef: fila.triggerEventRef,
      dueAt: fila.dueAt,
      submittedAt: fila.submittedAt,
      authorityReference: fila.authorityReference,
      legalEntity: fila.legalEntity.shortName,
      documentCount: fila._count.documents,
      overdue: fila.dueAt < ahora && fila.status !== 'CLOSED' && fila.status !== 'ACKNOWLEDGED',
    })),
  );
}
