import { createHash } from 'node:crypto';
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
import type { SignatureKind } from '@prisma-client/enums';

/**
 * Firma de un documento institucional (PRD §9.5; F5-ASA-006).
 *
 * **Se firma un contenido, no una fila.** La evidencia guarda la huella del
 * archivo tal como estaba al firmarse. Si alguien sustituyera el archivo, la
 * huella dejaría de corresponder y la firma quedaría, visiblemente, huérfana:
 * firmar una cosa y conservar otra sería peor que no firmar.
 *
 * **Se firma desde un cargo, cuando lo hay.** Quien firma «como Secretaría
 * General» declara el periodo de cargo con el que lo hace, y el caso de uso
 * comprueba que ese periodo esté vigente el día de la firma y que sea suyo.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const signDocumentSchema = z.object({
  documentId: z.uuid(),
  signerOfficeTermId: z.uuid().nullable().default(null),
  signatureKind: z.enum(['HANDWRITTEN_SCANNED', 'ELECTRONIC_SIMPLE', 'CERTIFIED_COPY']),
  /** Archivo con la firma autógrafa escaneada, cuando la modalidad lo exige. */
  fileObjectId: z.uuid().nullable().default(null),
});

export type SignDocumentInput = z.infer<typeof signDocumentSchema>;

export async function signDocument(
  actor: ActorContext,
  input: SignDocumentInput,
): Promise<UseCaseResult<{ signatureId: string; documentSha256: string }>> {
  const parsed = signDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const decision = can(actor, 'documents.document.issue', { kind: 'SignatureRecord' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const firmante = actor.userId;
  if (firmante === null || firmante === undefined) {
    return fail(errors.forbidden('Firmar es un acto personal: exige una cuenta.'));
  }

  const cuenta = await db().user.findUnique({
    where: { id: firmante },
    select: { personId: true, person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true } } },
  });
  if (cuenta === null) return fail(errors.notFound('No se encontró a la persona titular de la cuenta.'));

  const documento = await db().generatedDocument.findUnique({
    where: { id: data.documentId },
    select: {
      id: true,
      status: true,
      folio: true,
      legalEntityId: true,
      renderedFile: {
        select: { id: true, currentVersion: { select: { sha256: true } } },
      },
    },
  });
  if (documento === null) return fail(errors.notFound('Ese documento no existe.'));
  if (documento.status !== 'ISSUED') {
    return fail(errors.conflict('Solo se firma un documento vigente. Este está cancelado o superado.'));
  }
  const huella = documento.renderedFile.currentVersion?.sha256 ?? null;
  if (huella === null) {
    return fail(errors.conflict('El documento no tiene una versión de archivo con huella. No se puede firmar lo que no se puede identificar.'));
  }

  if (data.signatureKind === 'HANDWRITTEN_SCANNED' && data.fileObjectId === null) {
    return fail(
      errors.validation({
        fileObjectId: ['Una firma autógrafa escaneada necesita el archivo escaneado. Sin él no hay firma, hay una casilla.'],
      }),
    );
  }

  if (data.signerOfficeTermId !== null) {
    const cargo = await db().officeTerm.findUnique({
      where: { id: data.signerOfficeTermId },
      select: { id: true, personId: true, startsOn: true, endsOn: true, endedEarlyOn: true, officeDefinition: { select: { name: true } } },
    });
    if (cargo === null) return fail(errors.notFound('Ese periodo de cargo no existe.'));
    if (cargo.personId !== cuenta.personId) {
      return fail(errors.forbidden('Ese cargo no es tuyo. Nadie firma desde el cargo de otra persona.'));
    }
    const hoy = new Date();
    if (cargo.endedEarlyOn !== null || cargo.endsOn < hoy || cargo.startsOn > hoy) {
      return fail(
        errors.conflict(`El periodo de «${cargo.officeDefinition.name}» no está vigente hoy. Un cargo vencido no firma.`),
      );
    }
  }

  const yaFirmo = await db().signatureRecord.findFirst({
    where: { documentId: documento.id, signerPersonId: cuenta.personId, revokedAt: null },
    select: { id: true },
  });
  if (yaFirmo !== null) return fail(errors.conflict('Ya firmaste este documento.'));

  const firmadoEl = new Date();
  const evidencia = {
    documentSha256: huella,
    fileObjectId: documento.renderedFile.id,
    correlationId: actor.correlationId,
    firmadoEl: firmadoEl.toISOString(),
    firmante: nombreCompleto(cuenta.person),
    /**
     * Huella de la propia evidencia, para que la fila no pueda editarse sin que
     * se note: cambiar cualquier campo de arriba deja de producir este valor.
     */
    selloDeEvidencia: createHash('sha256')
      .update(`${huella}|${documento.renderedFile.id}|${firmadoEl.toISOString()}|${cuenta.personId}`)
      .digest('hex'),
  };

  const registrada = await transaction(async (tx) => {
    const fila = await tx.signatureRecord.create({
      data: {
        documentId: documento.id,
        signerPersonId: cuenta.personId,
        signerOfficeTermId: data.signerOfficeTermId,
        signatureKind: data.signatureKind,
        signedAt: firmadoEl,
        evidence: evidencia,
        fileObjectId: data.fileObjectId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DOCUMENT_SIGNED,
      objectKind: 'SignatureRecord',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: documento.legalEntityId,
      metadata: { folio: documento.folio, modalidad: data.signatureKind, documentSha256: huella },
    });

    return fila;
  });

  return ok({ signatureId: registrada.id, documentSha256: huella });
}

export interface SignatureRow {
  readonly id: string;
  readonly signerName: string;
  readonly officeName: string | null;
  readonly signatureKind: SignatureKind;
  readonly signedAt: Date;
  readonly revokedAt: Date | null;
  /** Si la huella firmada sigue siendo la del archivo que hoy tiene el documento. */
  readonly stillMatches: boolean;
}

export async function documentSignatures(
  actor: ActorContext,
  documentId: string,
): Promise<UseCaseResult<readonly SignatureRow[]>> {
  const decision = can(actor, 'documents.document.read', { kind: 'SignatureRecord' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const documento = await db().generatedDocument.findUnique({
    where: { id: documentId },
    select: { renderedFile: { select: { currentVersion: { select: { sha256: true } } } } },
  });
  if (documento === null) return fail(errors.notFound('Ese documento no existe.'));
  const huellaActual = documento.renderedFile.currentVersion?.sha256 ?? null;

  const filas = await db().signatureRecord.findMany({
    where: { documentId },
    orderBy: { signedAt: 'asc' },
    select: {
      id: true,
      signatureKind: true,
      signedAt: true,
      revokedAt: true,
      evidence: true,
      signerPerson: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
      signerOfficeTerm: { select: { officeDefinition: { select: { name: true } } } },
    },
  });

  return ok(
    filas.map((fila) => {
      const evidencia = fila.evidence;
      const firmada =
        typeof evidencia === 'object' && evidencia !== null && !Array.isArray(evidencia)
          ? (evidencia as Record<string, unknown>)['documentSha256']
          : null;
      return {
        id: fila.id,
        signerName: nombreCompleto(fila.signerPerson),
        officeName: fila.signerOfficeTerm?.officeDefinition.name ?? null,
        signatureKind: fila.signatureKind,
        signedAt: fila.signedAt,
        revokedAt: fila.revokedAt,
        stillMatches: typeof firmada === 'string' && huellaActual !== null && firmada === huellaActual,
      };
    }),
  );
}
