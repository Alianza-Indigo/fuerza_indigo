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
import type { CaseDocumentKind, FileClassification } from '@prisma-client/enums';
import { CLASIFICACION_MINIMA, SE_ENSENAN_A_LA_PERSONA } from '../domain/documents';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Documentos del expediente (PRD §10.2, §10.3).
 *
 * **La clasificación no se teclea al gusto.** Cada clase de documento tiene una
 * clasificación mínima —una identificación es dato personal sensible, un
 * escrito judicial es privilegiado— y el archivo se rechaza si llega por
 * debajo. Dejarlo a criterio de quien sube produce identificaciones marcadas
 * como «interno» y, con ellas, pases de descarga largos y una auditoría que no
 * sabe que se abrió algo delicado.
 *
 * **Que la persona lo vea es una decisión, no un descuido.** Por omisión no:
 * un documento de trabajo interno no se le enseña por el hecho de estar en su
 * expediente. Y hay clases que **nunca** se marcan visibles, porque enseñarlas
 * sería enseñar el trabajo del equipo, no el asunto de la persona.
 *
 * **La descarga no pasa por aquí.** La autoriza el servicio de archivos, que es
 * la única puerta, y vuelve a evaluar la política al canjear el pase. Este
 * módulo dice qué papel juega el documento dentro del caso; quién lo abre lo
 * decide la puerta.
 */

/**
 * Con qué reserva se puede guardar un documento cuya clase no la fija.
 *
 * `PUBLIC` no está, y no es un olvido: nada de un expediente es público. Una
 * lista que lo incluyera pondría la opción en el desplegable, y una opción en
 * un desplegable acaba elegida.
 */
const CLASIFICACIONES_ELEGIBLES = ['INTERNAL', 'RESTRICTED', 'SENSITIVE_PERSONAL', 'LEGAL_PRIVILEGED'] as const;

const CLASES = [
  'EVIDENCE',
  'IDENTIFICATION',
  'LEGAL_FILING',
  'MEDICAL_OR_CLINICAL',
  'CORRESPONDENCE',
  'INTERNAL_WORKING',
  'OTHER',
] as const;

export const attachDocumentSchema = z.object({
  caseId: z.uuid(),
  kind: z.enum(CLASES satisfies readonly CaseDocumentKind[], {
    error: () => 'Elige qué clase de documento es.',
  }),
  description: z
    .string()
    .trim()
    .min(5, { error: () => 'Describe qué es: al menos cinco caracteres.' })
    .max(400),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  content: z.instanceof(Uint8Array),
  /**
   * Clasificación, **solo** para las clases que no la fijan. Una prueba puede
   * ser un recibo o una fotografía de lesiones, y forzar una sola marca para
   * las dos obligaría a proteger de más o de menos.
   */
  classification: z
    .enum(CLASIFICACIONES_ELEGIBLES satisfies readonly FileClassification[])
    .nullable()
    .default(null),
  visibleToPerson: z.boolean().default(false),
});

export type AttachDocumentInput = z.input<typeof attachDocumentSchema>;

export const removeDocumentSchema = z.object({
  documentId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se retira: quitar un documento de un expediente es un acto.',
  }),
});

export type RemoveDocumentInput = z.infer<typeof removeDocumentSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function attachDocument(
  actor: ActorContext,
  input: AttachDocumentInput,
): Promise<UseCaseResult<{ documentId: string }>> {
  const parsed = attachDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de agregarle documentos.'));
  }

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(actor, 'cases.document.manage', recursoDelExpediente(expediente), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (data.visibleToPerson && !SE_ENSENAN_A_LA_PERSONA.includes(data.kind)) {
    return fail(
      errors.ruleViolation(
        'Esa clase de documento no se le enseña a la persona: es trabajo del equipo, no el asunto de quien pidió ayuda.',
      ),
    );
  }

  // La clase fija la clasificación cuando puede; cuando no, la elige quien
  // sube, entre las que un expediente admite. Nada de un caso es público.
  const minima = CLASIFICACION_MINIMA[data.kind];
  const clasificacion = minima ?? data.classification;
  if (clasificacion === null) {
    return fail(
      errors.validation({
        classification: ['Esa clase no fija la clasificación: elige con qué reserva se guarda.'],
      }),
    );
  }

  // El archivo se guarda **desde aquí**, como archivo de este expediente. Si se
  // aceptara uno ya subido, podría venir sin contexto de caso, y entonces la
  // puerta de descarga no sabría de qué expediente es: lo trataría como archivo
  // suelto, sin compartimento ni asignación que comprobar.
  const subido = await uploadFile(actor, {
    legalEntityId: expediente.legalEntityId,
    classification: clasificacion,
    contextKind: 'CASE',
    contextId: expediente.id,
    originalFileName: data.originalFileName,
    mimeType: data.mimeType,
    content: data.content,
  });
  if (!subido.ok) return subido;

  const agregado = await transaction(async (tx) => {
    const fila = await tx.caseDocument.create({
      data: {
        caseId: expediente.id,
        fileObjectId: subido.data.fileObjectId,
        kind: data.kind,
        description: data.description,
        visibleToPerson: data.visibleToPerson,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'DOCUMENT_ADDED',
        actorId: actor.actorId,
        summary: `Documento agregado: ${data.description}`,
        payload: {
          documento: fila.id,
          clase: data.kind,
          clasificacion: clasificacion,
          visibleParaLaPersona: data.visibleToPerson,
        },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_DOCUMENT_ADDED,
      objectKind: 'CaseDocument',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: {
        folio: expediente.folio,
        clase: data.kind,
        clasificacion: clasificacion,
        archivo: data.originalFileName,
      },
    });

    return fila;
  });

  return ok({ documentId: agregado.id });
}

export async function removeDocument(
  actor: ActorContext,
  input: RemoveDocumentInput,
): Promise<UseCaseResult<{ documentId: string }>> {
  const parsed = removeDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const documento = await db().caseDocument.findUnique({
    where: { id: data.documentId },
    select: {
      id: true,
      description: true,
      removedAt: true,
      case: { select: { ...CAMPOS_PARA_DECIDIR, folio: true } },
    },
  });
  if (documento === null) return fail(errors.notFound('Ese documento no existe.'));
  if (documento.removedAt !== null) {
    return fail(errors.conflict('Ese documento ya se retiró del expediente.'));
  }

  const asignada = await estaAsignada(actor, documento.case.id);
  const decision = can(actor, 'cases.document.manage', recursoDelExpediente(documento.case), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  await transaction(async (tx) => {
    // Se retira del expediente; el archivo sigue existiendo con su retención.
    // Borrarlo aquí destruiría prueba que puede hacer falta después, y hacerlo
    // desde la pantalla de un caso sería la forma discreta de destruirla.
    await tx.caseDocument.update({
      where: { id: documento.id },
      data: {
        removedAt: new Date(),
        removeReason: data.reason,
        visibleToPerson: false,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_DOCUMENT_REMOVED,
      objectKind: 'CaseDocument',
      objectId: documento.id,
      outcome: 'SUCCESS',
      legalEntityId: documento.case.legalEntityId,
      reason: data.reason,
      metadata: { folio: documento.case.folio, descripcion: documento.description },
    });
  });

  return ok({ documentId: documento.id });
}
