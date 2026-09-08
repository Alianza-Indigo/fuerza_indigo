import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { uploadFile } from '@/platform/files/file-service';

/**
 * Materiales de un evento (PRD §16.3, Fase 9).
 *
 * Un material es un archivo —una lectura, una presentación, una guía— y se sirve
 * por el servicio de archivos, que reevalúa la política al descargar. Un material
 * **reservado** solo se sirve a quien está inscrito; esa puerta vive en el
 * servicio de archivos, sobre el contexto `EVENT` del archivo, no en esta capa.
 * Aquí se sube, se lista para quien gestiona, y se lista para quien mira el
 * evento —a quien no está inscrito no se le muestra siquiera el material
 * reservado—.
 */

const TIPOS_DE_MATERIAL = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const addEventMaterialSchema = z.object({
  eventId: z.uuid(),
  title: z.string().trim().min(3).max(200),
  membersOnly: z.boolean().default(true),
  originalFileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(TIPOS_DE_MATERIAL),
});
export type AddEventMaterialInput = z.input<typeof addEventMaterialSchema> & { content: Uint8Array };

export async function addEventMaterial(
  actor: ActorContext,
  input: AddEventMaterialInput,
): Promise<UseCaseResult<{ materialId: string }>> {
  const parsed = addEventMaterialSchema.safeParse(input);
  if (!parsed.success) {
    const salida: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(salida));
  }
  const data = parsed.data;
  if (!(input.content instanceof Uint8Array) || input.content.byteLength === 0) {
    return fail(errors.validation({ content: ['El material no puede estar vacío.'] }));
  }

  const evento = await db().event.findUnique({ where: { id: data.eventId }, select: { id: true, legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: evento.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // El archivo cuelga del contexto de eventos con la clasificación que el
  // material dicta: un material reservado es interno y su pase dura poco; uno
  // abierto es público. La puerta de descarga añade la comprobación de
  // inscripción sobre el material reservado.
  const archivo = await uploadFile(actor, {
    legalEntityId: evento.legalEntityId,
    classification: data.membersOnly ? 'INTERNAL' : 'PUBLIC',
    contextKind: 'EVENT',
    contextId: evento.id,
    originalFileName: data.originalFileName,
    mimeType: data.mimeType,
    content: input.content,
  });
  if (!archivo.ok) return fail(archivo.error);

  const creado = await transaction(async (tx) => {
    // El ordinal siguiente, bajo cerrojo del evento: dos materiales subidos a la
    // vez no reclaman el mismo y mueren contra el único de la base.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evento-material:${evento.id}`}))`;
    const ultimo = await tx.eventMaterial.findFirst({
      where: { eventId: evento.id },
      orderBy: { ordinal: 'desc' },
      select: { ordinal: true },
    });
    const material = await tx.eventMaterial.create({
      data: {
        eventId: evento.id,
        title: data.title,
        fileObjectId: archivo.data.fileObjectId,
        ordinal: (ultimo?.ordinal ?? -1) + 1,
        membersOnly: data.membersOnly,
        createdByActorId: actor.actorId,
      },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_MATERIAL_ADDED,
      objectKind: 'EventMaterial',
      objectId: material.id,
      outcome: 'SUCCESS',
      legalEntityId: evento.legalEntityId,
      metadata: { eventId: evento.id, membersOnly: data.membersOnly },
    });
    return material;
  });

  return ok({ materialId: creado.id });
}

export interface MaterialRow {
  readonly id: string;
  readonly title: string;
  readonly fileObjectId: string;
  readonly membersOnly: boolean;
  readonly ordinal: number;
}

function fila(m: { id: string; title: string; fileObjectId: string; membersOnly: boolean; ordinal: number }): MaterialRow {
  return { id: m.id, title: m.title, fileObjectId: m.fileObjectId, membersOnly: m.membersOnly, ordinal: m.ordinal };
}

/** Todos los materiales de un evento, para quien lo gestiona. */
export async function listEventMaterials(actor: ActorContext, eventId: string): Promise<UseCaseResult<readonly MaterialRow[]>> {
  const evento = await db().event.findUnique({ where: { id: eventId }, select: { legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: evento.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().eventMaterial.findMany({
    where: { eventId },
    orderBy: { ordinal: 'asc' },
    select: { id: true, title: true, fileObjectId: true, membersOnly: true, ordinal: true },
  });
  return ok(filas.map(fila));
}

/**
 * Los materiales que un espectador del evento puede ver.
 *
 * A quien no está inscrito no se le muestra el material reservado —ni el enlace—.
 * La descarga tiene su propia puerta en el servicio de archivos; este filtro es
 * el de la vista, para no ofrecer lo que no se va a servir.
 */
export async function eventMaterialsForViewer(
  actor: ActorContext,
  eventId: string,
): Promise<UseCaseResult<readonly MaterialRow[]>> {
  const evento = await db().event.findUnique({ where: { id: eventId }, select: { id: true, legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  let inscrito = false;
  if (actor.personId !== null) {
    const registro = await db().eventRegistration.findFirst({
      where: { eventId, personId: actor.personId, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    inscrito = registro !== null;
  }
  const gestiona = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: evento.legalEntityId }).allowed;
  const alcanzaReservado = inscrito || gestiona;

  const filas = await db().eventMaterial.findMany({
    where: alcanzaReservado ? { eventId } : { eventId, membersOnly: false },
    orderBy: { ordinal: 'asc' },
    select: { id: true, title: true, fileObjectId: true, membersOnly: true, ordinal: true },
  });
  return ok(filas.map(fila));
}
