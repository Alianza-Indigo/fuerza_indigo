import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { uploadFile } from '@/platform/files';
import type { IncidentKind, IncidentStatus } from '@prisma-client/enums';

/**
 * Incidencias e impugnaciones electorales (PRD §9.6; F5-ELE-002, F5-ELE-006).
 *
 * **La impugnación del padrón es una incidencia, no un formulario aparte.** Una
 * persona que no aparece en el padrón electoral y otra que denuncia una
 * irregularidad en la jornada plantean lo mismo desde el punto de vista del
 * proceso: un hecho que la Comisión Electoral tiene que resolver, con su
 * evidencia y su resolución escrita. Tener dos mecanismos habría dejado uno de
 * los dos sin trazabilidad.
 *
 * **Resolver exige texto.** Una incidencia que se cierra sin decir por qué es
 * una incidencia que no se resolvió: se archivó.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const openIncidentSchema = z.object({
  electionId: z.uuid(),
  kind: z.enum(['PROCEDURAL', 'ELIGIBILITY', 'TECHNICAL', 'CONDUCT', 'CHALLENGE']),
  description: z.string().trim().min(20).max(20_000),
});

export interface IncidentEvidence {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface OpenIncidentInput extends z.infer<typeof openIncidentSchema> {
  readonly evidence?: IncidentEvidence | null;
}

export async function openIncident(
  actor: ActorContext,
  input: OpenIncidentInput,
): Promise<UseCaseResult<{ incidentId: string }>> {
  const parsed = openIncidentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.incident.manage', { kind: 'ElectionIncident' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienReporta = actor.userId;
  if (quienReporta === null || quienReporta === undefined) {
    return fail(errors.forbidden('Una incidencia la plantea una persona con cuenta.'));
  }

  const data = parsed.data;
  const eleccion = await db().election.findUnique({
    where: { id: data.electionId },
    select: {
      id: true,
      publicId: true,
      status: true,
      territorialUnitId: true,
      unionBody: { select: { legalEntityId: true } },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  if (eleccion.status === 'ANNULLED') return fail(errors.conflict('Ese proceso está anulado.'));

  const evidencia = input.evidence ?? null;
  let evidenciaId: string | null = null;
  if (evidencia !== null) {
    const guardado = await uploadFile(actor, {
      legalEntityId: eleccion.unionBody.legalEntityId,
      classification: 'INTERNAL',
      contextKind: 'GOVERNANCE',
      contextId: eleccion.id,
      originalFileName: evidencia.fileName,
      mimeType: evidencia.mimeType,
      content: evidencia.content,
    });
    if (!guardado.ok) return fail(guardado.error);
    evidenciaId = guardado.data.fileObjectId;
  }

  const abierta = await transaction(async (tx) => {
    const fila = await tx.electionIncident.create({
      data: {
        electionId: eleccion.id,
        reportedById: quienReporta,
        kind: data.kind,
        description: data.description,
        status: 'OPEN',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    if (evidenciaId !== null) {
      await tx.electionIncidentEvidence.create({
        data: { incidentId: fila.id, fileObjectId: evidenciaId },
      });
    }

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ELECTION_INCIDENT_OPENED,
      objectKind: 'ElectionIncident',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      metadata: { eleccion: eleccion.publicId, tipo: data.kind, conEvidencia: evidenciaId !== null },
    });

    return fila;
  });

  return ok({ incidentId: abierta.id });
}

export const resolveIncidentSchema = z.object({
  incidentId: z.uuid(),
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED']),
  resolution: z.string().trim().min(20).max(20_000, {
    error: () => 'Escribe la resolución: una incidencia cerrada sin motivo no se resolvió, se archivó.',
  }),
});

export async function resolveIncident(
  actor: ActorContext,
  input: z.infer<typeof resolveIncidentSchema>,
): Promise<UseCaseResult<{ status: IncidentStatus }>> {
  const parsed = resolveIncidentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.resolution };
  const decision = can(contexto, 'election.incident.manage', { kind: 'ElectionIncident' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienResuelve = actor.userId;
  if (quienResuelve === null || quienResuelve === undefined) {
    return fail(errors.forbidden('Resolver una incidencia es un acto de una persona: exige una cuenta.'));
  }

  const incidencia = await db().electionIncident.findUnique({
    where: { id: data.incidentId },
    select: {
      id: true,
      status: true,
      electionId: true,
      election: { select: { publicId: true, territorialUnitId: true } },
    },
  });
  if (incidencia === null) return fail(errors.notFound('Esa incidencia no existe.'));
  if (incidencia.status === 'RESOLVED' || incidencia.status === 'DISMISSED') {
    return fail(errors.conflict('Esa incidencia ya está resuelta.'));
  }

  const cuenta = await db().user.findUnique({ where: { id: quienResuelve }, select: { personId: true } });
  if (cuenta === null) return fail(errors.notFound('No se encontró a la persona titular de la cuenta.'));

  const esComision = await db().electionCommissionMember.findUnique({
    where: { electionId_personId: { electionId: incidencia.electionId, personId: cuenta.personId } },
    select: { unassignedAt: true },
  });
  if (esComision === null || esComision.unassignedAt !== null) {
    return fail(errors.forbidden('Solo la Comisión Electoral de este proceso resuelve sus incidencias.'));
  }

  await transaction(async (tx) => {
    await tx.electionIncident.update({
      where: { id: incidencia.id },
      data: {
        status: data.status,
        resolution: data.resolution,
        resolvedById: data.status === 'UNDER_REVIEW' ? null : quienResuelve,
        resolvedAt: data.status === 'UNDER_REVIEW' ? null : new Date(),
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.ELECTION_INCIDENT_RESOLVED,
      objectKind: 'ElectionIncident',
      objectId: incidencia.id,
      outcome: 'SUCCESS',
      territorialUnitId: incidencia.election.territorialUnitId,
      reason: data.resolution,
      metadata: { eleccion: incidencia.election.publicId, de: incidencia.status, a: data.status },
    });
  });

  return ok({ status: data.status });
}

export interface IncidentRow {
  readonly id: string;
  readonly kind: IncidentKind;
  readonly description: string;
  readonly status: IncidentStatus;
  readonly reportedAt: Date;
  readonly reportedBy: string;
  readonly resolution: string | null;
  readonly resolvedAt: Date | null;
  readonly evidenceCount: number;
}

export async function incidentList(
  actor: ActorContext,
  electionId: string,
): Promise<UseCaseResult<readonly IncidentRow[]>> {
  const decision = can(actor, 'voting.process.read', { kind: 'ElectionIncident' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().electionIncident.findMany({
    where: { electionId },
    orderBy: { reportedAt: 'desc' },
    select: {
      id: true,
      kind: true,
      description: true,
      status: true,
      reportedAt: true,
      resolution: true,
      resolvedAt: true,
      reportedBy: {
        select: {
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      _count: { select: { evidence: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      kind: fila.kind,
      description: fila.description,
      status: fila.status,
      reportedAt: fila.reportedAt,
      reportedBy: nombreCompleto(fila.reportedBy.person),
      resolution: fila.resolution,
      resolvedAt: fila.resolvedAt,
      evidenceCount: fila._count.evidence,
    })),
  );
}
