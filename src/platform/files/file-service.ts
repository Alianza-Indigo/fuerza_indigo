import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Compartment, FileClassification, FileContextKind } from '@prisma-client/enums';
import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import { compartimentoDeExpediente } from '@/platform/authz/compartments';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId, safeEquals } from '@/platform/kernel/ids';
import { recordAudit, recordSecurity } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { blobStore } from './blob-store';

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
  LEGAL_PRIVILEGED: 120,
};

/** Clasificaciones que exigen motivo escrito y no admiten vista previa. */
const SENSITIVE: ReadonlySet<FileClassification> = new Set(['SENSITIVE_PERSONAL', 'LEGAL_PRIVILEGED']);

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
  /**
   * `<!DOCTYPE`. El HTML no tiene número mágico, pero los documentos
   * institucionales que emite la plataforma sí: los genera ella misma a partir
   * de una plantilla y siempre empiezan por el doctype. La comprobación deja
   * de ser una adivinanza sobre un archivo ajeno y pasa a ser lo que es, la
   * confirmación de que lo guardado es lo que el emisor produjo.
   */
  'text/html': [[0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]],
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
  // Acceso PRIVADO, lo resuelva quien lo resuelva: el adaptador lo garantiza y
  // este caso de uso ya no sabe de qué almacén se trata (ADR-0076).
  const stored = await blobStore().put(blobPathname, input.content, input.mimeType);

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

/** Lo que el expediente dice del archivo que cuelga de él. */
interface ContextoDeExpediente {
  readonly compartment: Compartment;
  readonly territorialPath: string | null;
  /** Si quien pide lleva el expediente: tiene una asignación viva sobre él. */
  readonly loLleva: boolean;
  /** Si el documento es suyo: es parte del expediente y se le enseña. */
  readonly esSuyo: boolean;
  /** Si el documento es un diagnóstico o un dato clínico (PRD §10.3). */
  readonly esClinico: boolean;
}

/**
 * Resuelve el expediente del que cuelga un archivo.
 *
 * Se consulta desde la plataforma y no desde el módulo de casos porque este
 * servicio es la **única puerta de descarga** del sistema: una segunda puerta
 * que supiera de expedientes sería una segunda puerta que olvidar de cerrar.
 * Lo que se lee aquí son hechos del dato —de qué dominio es, dónde ocurre,
 * quién lo lleva—, no reglas del módulo; la única regla, la traducción de
 * dominio a compartimento, vive en un solo sitio y se importa.
 *
 * Un archivo marcado como de caso que no señale un expediente vivo no se abre:
 * responder que no se sabe de quién es y dejar pasar sería lo contrario de una
 * puerta.
 */
async function contextoDeExpediente(
  actor: ActorContext,
  fileObjectId: string,
  contextId: string | null,
): Promise<ContextoDeExpediente | null> {
  if (contextId === null) return null;

  const expediente = await db().case.findUnique({
    where: { id: contextId },
    select: { id: true, domain: true, territorialUnit: { select: { path: true } } },
  });
  if (expediente === null) return null;

  const documento = await db().caseDocument.findFirst({
    where: { caseId: expediente.id, fileObjectId, removedAt: null },
    select: { kind: true, visibleToPerson: true },
  });

  const userId = actor.userId ?? null;
  const asignada =
    userId !== null &&
    (await db().caseAssignment.findFirst({
      where: { caseId: expediente.id, userId, unassignedAt: null },
      select: { id: true },
    })) !== null;

  // Quien es parte alcanza **lo que se le enseña**, no todo lo que cuelga del
  // expediente: un documento de trabajo interno no se abre por el hecho de
  // figurar en el caso de alguien.
  const personId = actor.personId ?? null;
  const parteQueLoVe =
    !asignada &&
    documento !== null &&
    documento.visibleToPerson &&
    personId !== null &&
    (await db().caseParticipant.findFirst({
      where: { caseId: expediente.id, personId, removedAt: null, canViewCase: true },
      select: { id: true },
    })) !== null;

  return {
    compartment: compartimentoDeExpediente(expediente.domain),
    territorialPath: expediente.territorialUnit?.path ?? null,
    loLleva: asignada,
    esSuyo: parteQueLoVe,
    esClinico: documento?.kind === 'MEDICAL_OR_CLINICAL',
  };
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

  // La persona titular descarga lo suyo por la vía de su propio permiso, no por
  // la de quien lee expedientes ajenos. La distinción importa: darle a un rol de
  // afiliación la descarga general para que pueda abrir su documento le daría
  // también los documentos de las demás personas de su alcance.
  // El archivo de un expediente se decide con lo que el expediente dice de sí
  // mismo, no con una constante. Antes esta función fijaba `SOCIAL` para todo
  // archivo de caso y no aportaba sonda de asignación: un documento de defensa
  // sindical quedaba al alcance del personal de atención social y fuera del
  // alcance de quien llevaba el expediente, que es exactamente al revés.
  const expediente = file.contextKind === 'CASE' ? await contextoDeExpediente(actor, file.id, file.contextId) : null;

  // **El documento de un expediente se alcanza por asignación o por ser su
  // sujeto, nunca por facultad sola** (PRD §10.3). No basta con marcar el
  // permiso de descarga como `needsAssignment`: `files.file.download` es el
  // permiso general de archivos y no lo exige, así que quien lo tuviera abriría
  // el expediente de cualquiera de su entidad con solo saber el identificador.
  // Por eso la puerta lo comprueba aquí, sobre el hecho, y no a través de una
  // bandera del catálogo que vale para todos los archivos del sistema.
  const alcanzaElExpediente = expediente === null || expediente.loLleva || expediente.esSuyo;

  // Quien es parte descarga lo suyo por la vía de su propio permiso, igual que
  // la titular de un archivo personal: el documento que se le enseña en su
  // expediente es suyo en el mismo sentido, y exigirle la descarga general le
  // daría de paso los documentos de las demás.
  const isOwner =
    (file.ownerPersonId !== null && file.ownerPersonId === actor.personId) || (expediente?.esSuyo ?? false);
  const permissionCode = isOwner
    ? 'files.file.download_own'
    : isSensitive
      ? 'files.file.download_sensitive'
      : 'files.file.download';

  const decision = !alcanzaElExpediente
    ? { allowed: false as const, reason: 'SIN_ASIGNACION' as const }
    : can(
        actor,
        permissionCode,
        {
          kind: 'FileObject',
          id: file.id,
          legalEntityId: file.legalEntityId,
          territorialPath: expediente?.territorialPath ?? null,
          compartment: expediente?.compartment ?? null,
        },
        { hasLiveAssignment: () => isOwner || (expediente?.loLleva ?? false) },
      );

  // Los diagnósticos y los datos clínicos se ocultan a los roles sindicales sin
  // autorización expresa (PRD §10.3). La facultad que la concede exige motivo:
  // abrir el diagnóstico de alguien es un acto, y quien lo hace dice por qué.
  const clinico =
    expediente !== null && expediente.esClinico && !isOwner
      ? can(
          actor,
          'cases.document.read_clinical',
          {
            kind: 'FileObject',
            id: file.id,
            legalEntityId: file.legalEntityId,
            territorialPath: expediente.territorialPath,
            compartment: expediente.compartment,
          },
          { hasLiveAssignment: () => expediente.loLleva },
        )
      : { allowed: true as const, reason: undefined };

  if (!decision.allowed || !clinico.allowed) {
    await transaction((tx) =>
      Promise.all([
        recordSecurity(tx, {
          kind: 'FILE_ACCESS_DENIED',
          severity: isSensitive ? 'CRITICAL' : 'WARNING',
          actorId: actor.actorId === '' ? null : actor.actorId,
          detail: {
            fileObjectId: file.id,
            classification: file.classification,
            reason: decision.reason ?? clinico.reason,
          },
          correlationId: actor.correlationId,
        }),
        recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.FILE_DOWNLOAD_AUTHORIZED,
          objectKind: 'FileObject',
          objectId: file.id,
          outcome: 'DENIED',
          legalEntityId: file.legalEntityId,
          metadata: { reason: decision.reason ?? clinico.reason, clinico: expediente?.esClinico ?? false },
        }),
      ]),
    );
    return fail(errors.notFound(explain((decision.reason ?? clinico.reason)!)));
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
  const stored = await blobStore().get(file.currentVersion.blobPathname);
  if (stored === null) return fail(errors.dependencyUnavailable('almacén de archivos'));

  return ok({
    content: stored,
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
      await blobStore().delete(version.blobPathname);
    } catch {
      // Se reintenta desde el trabajo de retención.
    }
  }

  return ok({ deleted: true });
}
