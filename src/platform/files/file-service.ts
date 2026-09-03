import { createHash, createHmac, randomUUID } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import type { FileClassification, FileContextKind } from '@prisma-client/enums';
import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId, safeEquals } from '@/platform/kernel/ids';
import { recordAudit, recordSecurity } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Servicio privado de archivos sobre Vercel Blob (PRD §17.4, ADR-0013).
 *
 * Criterio de aceptación de la Fase 1: **un archivo privado no puede abrirse
 * mediante su URL persistente sin autorización**. Se cumple con tres medidas
 * que actúan juntas:
 *
 *  1. Todo objeto se escribe con acceso privado en el almacén.
 *  2. La ruta lógica es opaca y **no deriva** del nombre original.
 *  3. La descarga pasa siempre por una ruta de la aplicación que **reevalúa la
 *     política** y emite un pase firmado de vigencia corta. No basta con
 *     conocer la URL: hay que poder demostrarlo en el momento de descargar.
 */

/** Vigencia del pase según la clasificación (docs/INTEGRATIONS.md §4). */
const TICKET_TTL_SECONDS: Record<FileClassification, number> = {
  PUBLIC: 86_400,
  INTERNAL: 900,
  RESTRICTED: 300,
  SENSITIVE_PERSONAL: 120,
  CLINICAL: 120,
  LEGAL_PRIVILEGED: 120,
};

/** Clasificaciones que exigen motivo escrito y no admiten vista previa. */
const SENSITIVE: ReadonlySet<FileClassification> = new Set(['SENSITIVE_PERSONAL', 'CLINICAL', 'LEGAL_PRIVILEGED']);

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Tipos admitidos y su firma real en los primeros bytes.
 *
 * Se comprueba el **contenido**, no la extensión ni la cabecera declarada: un
 * ejecutable renombrado a `.pdf` declara `application/pdf` y pasaría cualquier
 * validación que se fíe de lo que dice quien sube el archivo (PRD §20.5).
 */
const MAGIC: Record<string, readonly number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
};

export function detectsAs(mimeType: string, bytes: Uint8Array): boolean {
  const signatures = MAGIC[mimeType];
  if (signatures === undefined) return false;
  return signatures.some((signature) => signature.every((byte, index) => bytes[index] === byte));
}

export interface UploadInput {
  readonly legalEntityId: string;
  readonly classification: FileClassification;
  readonly contextKind: FileContextKind;
  readonly contextId?: string | null;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly ownerPersonId?: string | null;
  readonly retentionPolicyCode?: string | null;
}

export interface UploadedFile {
  readonly fileObjectId: string;
  readonly publicId: string;
  readonly version: number;
  readonly sha256: string;
}

export async function uploadFile(actor: ActorContext, input: UploadInput): Promise<UseCaseResult<UploadedFile>> {
  const decision = can(actor, 'files.file.upload', {
    kind: 'FileObject',
    legalEntityId: input.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (input.content.byteLength === 0) {
    return fail(errors.validation({ archivo: ['El archivo está vacío.'] }));
  }
  if (input.content.byteLength > MAX_BYTES) {
    return fail(
      errors.validation({
        archivo: [`El archivo supera el máximo de ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.`],
      }),
    );
  }
  if (!detectsAs(input.mimeType, input.content)) {
    return fail(
      errors.validation({
        archivo: ['El contenido del archivo no corresponde con su tipo. Vuelve a exportarlo y súbelo de nuevo.'],
      }),
    );
  }

  const sha256 = createHash('sha256').update(input.content).digest('hex');
  const publicId = newPublicId();

  // Ruta opaca: ni el nombre original ni el identificador público aparecen en
  // ella, de modo que adivinarla no sirve de nada aunque se filtrara alguno.
  const blobPathname = `objetos/${new Date().getUTCFullYear()}/${randomUUID()}`;

  // Acceso PRIVADO. No es un detalle de configuración: es lo que impide que la
  // URL del almacén sirva por sí sola, con independencia de lo que haga la
  // aplicación (PRD §17.4).
  const stored = await put(blobPathname, Buffer.from(input.content), {
    access: 'private',
    addRandomSuffix: false,
    token: env().BLOB_READ_WRITE_TOKEN,
    contentType: input.mimeType,
  });

  const retentionPolicy =
    input.retentionPolicyCode === undefined || input.retentionPolicyCode === null
      ? null
      : await db().retentionPolicy.findUnique({ where: { code: input.retentionPolicyCode }, select: { id: true } });

  const result = await transaction(async (tx) => {
    const fileObject = await tx.fileObject.create({
      data: {
        publicId,
        legalEntityId: input.legalEntityId,
        ownerPersonId: input.ownerPersonId ?? null,
        classification: input.classification,
        contextKind: input.contextKind,
        contextId: input.contextId ?? null,
        originalFileName: input.originalFileName.slice(0, 255),
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.content.byteLength),
        retentionPolicyId: retentionPolicy?.id ?? null,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const version = await tx.fileVersion.create({
      data: {
        fileObjectId: fileObject.id,
        version: 1,
        blobPathname: stored.pathname,
        sha256,
        sizeBytes: BigInt(input.content.byteLength),
        uploadedByActorId: actor.actorId,
        scanStatus: 'CLEAN',
        scanDetail: 'Tipo real verificado por firma de contenido',
      },
      select: { id: true },
    });

    await tx.fileObject.update({ where: { id: fileObject.id }, data: { currentVersionId: version.id } });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.FILE_UPLOADED,
      objectKind: 'FileObject',
      objectId: fileObject.id,
      outcome: 'SUCCESS',
      legalEntityId: input.legalEntityId,
      metadata: {
        classification: input.classification,
        contextKind: input.contextKind,
        sizeBytes: input.content.byteLength,
      },
    });

    return { fileObjectId: fileObject.id, publicId, version: 1, sha256 };
  });

  return ok(result);
}

/* -------------------------------------------------------------------------- */
/* Pase de descarga                                                           */
/* -------------------------------------------------------------------------- */

export interface DownloadTicket {
  readonly path: string;
  readonly expiresAt: Date;
}

function sign(payload: string): string {
  return createHmac('sha256', env().FILE_URL_SIGNING_SECRET).update(payload).digest('hex');
}

/**
 * Autoriza una descarga y emite un pase firmado de vigencia corta.
 *
 * El pase acredita que **en ese momento** la política concedió el acceso. Aun
 * así, la ruta de descarga vuelve a evaluar la política al canjearlo: si el
 * nombramiento se revocó en el intervalo, el pase deja de servir.
 */
export async function authorizeDownload(
  actor: ActorContext,
  fileObjectId: string,
): Promise<UseCaseResult<DownloadTicket>> {
  const file = await db().fileObject.findUnique({
    where: { id: fileObjectId },
    select: {
      id: true,
      legalEntityId: true,
      classification: true,
      contextKind: true,
      contextId: true,
      deletedAt: true,
      ownerPersonId: true,
    },
  });

  // Un archivo inexistente y uno fuera de alcance responden lo mismo.
  if (file === null || file.deletedAt !== null) {
    return fail(errors.notFound('el archivo no existe o fue eliminado'));
  }

  const isSensitive = SENSITIVE.has(file.classification);
  const permissionCode = isSensitive ? 'files.file.download_sensitive' : 'files.file.download';

  // La persona propietaria siempre puede descargar lo suyo, sin necesidad de
  // una asignación de expediente.
  const isOwner = file.ownerPersonId !== null && file.ownerPersonId === actor.personId;

  const decision = can(
    actor,
    permissionCode,
    {
      kind: 'FileObject',
      id: file.id,
      legalEntityId: file.legalEntityId,
      compartment: file.contextKind === 'CIAN' ? 'CLINICAL' : file.contextKind === 'CASE' ? 'SOCIAL' : null,
    },
    { hasLiveAssignment: () => isOwner },
  );

  if (!decision.allowed) {
    await transaction((tx) =>
      Promise.all([
        recordSecurity(tx, {
          kind: 'FILE_ACCESS_DENIED',
          severity: isSensitive ? 'CRITICAL' : 'WARNING',
          actorId: actor.actorId === '' ? null : actor.actorId,
          detail: { fileObjectId: file.id, classification: file.classification, reason: decision.reason },
          correlationId: actor.correlationId,
        }),
        recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.FILE_DOWNLOAD_AUTHORIZED,
          objectKind: 'FileObject',
          objectId: file.id,
          outcome: 'DENIED',
          legalEntityId: file.legalEntityId,
          metadata: { reason: decision.reason },
        }),
      ]),
    );
    return fail(errors.notFound(explain(decision.reason!)));
  }

  const ttl = TICKET_TTL_SECONDS[file.classification];
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${file.id}.${actor.actorId}.${expiresAtSeconds}`;
  const signature = sign(payload);

  await transaction((tx) =>
    recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.FILE_DOWNLOAD_AUTHORIZED,
      objectKind: 'FileObject',
      objectId: file.id,
      outcome: 'SUCCESS',
      legalEntityId: file.legalEntityId,
      metadata: { classification: file.classification, ttlSeconds: ttl },
    }),
  );

  return ok({
    path: `/api/v1/files/${file.id}?exp=${expiresAtSeconds}&sig=${signature}`,
    expiresAt,
  });
}

export interface RedeemedFile {
  readonly content: Uint8Array;
  readonly mimeType: string;
  readonly originalFileName: string;
  readonly inlineViewable: boolean;
}

/**
 * Canjea el pase y entrega el contenido.
 *
 * Vuelve a evaluar la política: el pase no sustituye la autorización, la
 * acompaña. Es lo que impide que un enlace copiado siga sirviendo después de
 * revocar un nombramiento.
 */
export async function redeemDownload(
  actor: ActorContext,
  fileObjectId: string,
  expiresAtSeconds: number,
  signature: string,
): Promise<UseCaseResult<RedeemedFile>> {
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds * 1000 <= Date.now()) {
    return fail(errors.notFound('el pase de descarga venció'));
  }

  const expected = sign(`${fileObjectId}.${actor.actorId}.${expiresAtSeconds}`);
  if (!safeEquals(expected, signature)) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'FILE_ACCESS_DENIED',
        severity: 'CRITICAL',
        actorId: actor.actorId === '' ? null : actor.actorId,
        detail: { fileObjectId, reason: 'firma del pase no válida' },
        correlationId: actor.correlationId,
      }),
    );
    return fail(errors.notFound('la firma del pase de descarga no es válida'));
  }

  // Segunda evaluación de política: el permiso pudo revocarse tras emitir el pase.
  const reauthorized = await authorizeDownload(actor, fileObjectId);
  if (!reauthorized.ok) return fail(reauthorized.error);

  const file = await db().fileObject.findUnique({
    where: { id: fileObjectId },
    select: {
      mimeType: true,
      originalFileName: true,
      classification: true,
      currentVersion: { select: { blobPathname: true } },
    },
  });
  if (file === null || file.currentVersion === null) {
    return fail(errors.notFound('el archivo no tiene contenido almacenado'));
  }

  // El objeto es privado: se lee con el token del almacén, nunca por una URL
  // pública. Sin este token, la ruta del objeto no entrega nada.
  const stored = await get(file.currentVersion.blobPathname, {
    access: 'private',
    token: env().BLOB_READ_WRITE_TOKEN,
  });
  if (stored === null) return fail(errors.dependencyUnavailable('almacén de archivos'));

  return ok({
    content: new Uint8Array(await new Response(stored.stream).arrayBuffer()),
    mimeType: file.mimeType,
    originalFileName: file.originalFileName,
    // El material sensible y clínico se descarga, nunca se previsualiza.
    inlineViewable: !SENSITIVE.has(file.classification),
  });
}

/* -------------------------------------------------------------------------- */
/* Eliminación con retención y bloqueo legal                                  */
/* -------------------------------------------------------------------------- */

export async function deleteFile(
  actor: ActorContext,
  fileObjectId: string,
  reason: string,
): Promise<UseCaseResult<{ deleted: boolean }>> {
  const file = await db().fileObject.findUnique({
    where: { id: fileObjectId },
    select: {
      id: true,
      legalEntityId: true,
      deletedAt: true,
      legalHold: { select: { id: true, releasedAt: true } },
      versions: { select: { blobPathname: true } },
    },
  });
  if (file === null) return fail(errors.notFound('el archivo no existe'));
  if (file.deletedAt !== null) return ok({ deleted: false });

  const contextWithReason: ActorContext = { ...actor, reason };
  const decision = can(contextWithReason, 'files.file.delete', {
    kind: 'FileObject',
    id: file.id,
    legalEntityId: file.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // El bloqueo legal manda sobre cualquier permiso.
  if (file.legalHold !== null && file.legalHold.releasedAt === null) {
    return fail(
      errors.ruleViolation(
        'Este archivo está bajo bloqueo legal y no puede eliminarse. Levanta el bloqueo primero.',
        'bloqueo legal activo',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.fileObject.update({
      where: { id: file.id },
      data: { deletedAt: new Date(), updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, contextWithReason, {
      action: AUDIT_ACTIONS.FILE_DELETED,
      objectKind: 'FileObject',
      objectId: file.id,
      outcome: 'SUCCESS',
      legalEntityId: file.legalEntityId,
      reason,
    });
  });

  // El borrado físico ocurre solo tras el borrado lógico y la auditoría: si
  // falla el almacén, el registro ya refleja la intención y el trabajo de
  // retención lo reintenta.
  for (const version of file.versions) {
    try {
      await del(version.blobPathname, { token: env().BLOB_READ_WRITE_TOKEN });
    } catch {
      // Se reintenta desde el trabajo de retención.
    }
  }

  return ok({ deleted: true });
}
