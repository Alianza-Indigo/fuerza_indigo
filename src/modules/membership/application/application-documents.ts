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

/**
 * Documentación de la solicitud, con revisión **documento por documento**
 * (PRD §8.1, pasos 6 y 10; F4-AFI-007).
 *
 * Que la revisión sea por documento y no por solicitud no es un detalle de
 * interfaz: es lo que permite decir «tu comprobante de actividad no se lee, el
 * resto está bien» en vez de devolver el trámite entero. Sin eso, una foto
 * borrosa obliga a rehacerlo todo.
 *
 * Los archivos se clasifican como datos personales sensibles y viven en el
 * almacén privado: una constancia laboral dice dónde trabaja alguien, y una
 * identificación dice mucho más.
 */

const TIPOS = ['IDENTITY', 'WORK_PROOF', 'CERTIFICATE', 'REFERENCE', 'STATEMENT', 'CLARIFICATION', 'OTHER'] as const;

export const attachApplicationDocumentSchema = z.object({
  applicationId: z.uuid(),
  documentKind: z.enum(TIPOS, { error: () => 'Di qué es este documento.' }),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
});

export type AttachApplicationDocumentInput = z.infer<typeof attachApplicationDocumentSchema> & {
  readonly content: Uint8Array;
};

export const reviewApplicationDocumentSchema = z
  .object({
    documentId: z.uuid(),
    decision: z.enum(['ACCEPTED', 'REJECTED']),
    reviewNote: z.string().trim().max(1000).nullable().default(null),
  })
  .superRefine((valor, ctx) => {
    if (valor.decision !== 'REJECTED') return;
    if ((valor.reviewNote ?? '').trim().length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['reviewNote'],
        message: 'Si rechazas un documento, di qué le falta. Quien lo mandó tiene que saber qué corregir.',
      });
    }
  });

export type ReviewApplicationDocumentInput = z.input<typeof reviewApplicationDocumentSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Estados en los que todavía se puede añadir documentación. */
const ADMITEN_DOCUMENTOS = [
  'DRAFT',
  'SUBMITTED',
  'DOCUMENTATION_PENDING',
  'UNDER_REVIEW',
  'CLARIFICATION_REQUIRED',
] as const;

export async function attachApplicationDocument(
  actor: ActorContext,
  input: AttachApplicationDocumentInput,
): Promise<UseCaseResult<{ documentId: string; fileObjectId: string }>> {
  const parsed = attachApplicationDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const solicitud = await db().membershipApplication.findUnique({
    where: { id: parsed.data.applicationId },
    select: { id: true, status: true, personId: true, legalEntityId: true, folio: true },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const propia = solicitud.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.application.read_own' : 'membership.application.create',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (!(ADMITEN_DOCUMENTOS as readonly string[]).includes(solicitud.status)) {
    return fail(
      errors.conflict(
        'Esa solicitud ya está resuelta y no admite más documentos.',
        `estado que no admite documentos: ${solicitud.status}`,
      ),
    );
  }

  const subido = await uploadFile(actor, {
    legalEntityId: solicitud.legalEntityId,
    classification: 'SENSITIVE_PERSONAL',
    contextKind: 'APPLICATION',
    contextId: solicitud.id,
    originalFileName: parsed.data.originalFileName,
    mimeType: parsed.data.mimeType,
    content: input.content,
    ownerPersonId: solicitud.personId,
  });
  if (!subido.ok) return fail(subido.error);

  const creado = await transaction(async (tx) => {
    const documento = await tx.applicationDocument.create({
      data: {
        applicationId: solicitud.id,
        fileObjectId: subido.data.fileObjectId,
        documentKind: parsed.data.documentKind,
      },
      select: { id: true },
    });

    // Añadir documentación a una solicitud que estaba esperándola la devuelve a
    // la cola de revisión: si no, se quedaría esperando para siempre algo que ya
    // llegó.
    if (solicitud.status === 'DOCUMENTATION_PENDING') {
      await tx.membershipApplication.update({
        where: { id: solicitud.id },
        data: { status: 'UNDER_REVIEW', updatedByActorId: actor.actorId },
      });
    }

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_DOCUMENT_ADDED,
      objectKind: 'ApplicationDocument',
      objectId: documento.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      metadata: { folio: solicitud.folio, tipo: parsed.data.documentKind },
    });

    return documento;
  });

  return ok({ documentId: creado.id, fileObjectId: subido.data.fileObjectId });
}

export async function reviewApplicationDocument(
  actor: ActorContext,
  input: ReviewApplicationDocumentInput,
): Promise<UseCaseResult<{ documentId: string; status: string }>> {
  const parsed = reviewApplicationDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const documento = await db().applicationDocument.findUnique({
    where: { id: parsed.data.documentId },
    select: {
      id: true,
      status: true,
      application: { select: { id: true, legalEntityId: true, personId: true, folio: true, status: true } },
    },
  });
  if (documento === null) return fail(errors.notFound('documento inexistente'));

  const decision = can(actor, 'membership.application.review', {
    kind: 'ApplicationDocument',
    id: documento.id,
    legalEntityId: documento.application.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (actor.userId === null) {
    return fail(errors.forbidden('revisar un documento exige una persona con cuenta detrás'));
  }
  if (documento.status !== 'SUBMITTED') {
    return fail(
      errors.conflict('Ese documento ya se revisó.', `documento en estado ${documento.status}`),
    );
  }

  const revisado = await transaction(async (tx) => {
    const actualizado = await tx.applicationDocument.update({
      where: { id: documento.id },
      data: {
        status: parsed.data.decision,
        reviewNote: parsed.data.reviewNote,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_DOCUMENT_REVIEWED,
      objectKind: 'ApplicationDocument',
      objectId: documento.id,
      outcome: 'SUCCESS',
      legalEntityId: documento.application.legalEntityId,
      onBehalfOfPersonId: documento.application.personId,
      metadata: { folio: documento.application.folio, decision: parsed.data.decision },
    });

    return actualizado;
  });

  return ok({ documentId: revisado.id, status: revisado.status });
}
