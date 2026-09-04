import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { SupportRequestStatus, SupportRequestType } from '@prisma-client/enums';

/**
 * Bandeja de la entrada única de ayuda.
 *
 * Separada de `intake.ts` por la misma razón que `editorialPages` está separada
 * de `publishedPage`: un solo módulo con una bandera «incluir todo» acaba
 * llamándose desde la ruta pública con la bandera en verdadero.
 *
 * Aquí sí hay actor, sí hay permiso y sí hay alcance por entidad jurídica. Una
 * solicitud dirigida a Alianza Índigo no se lee desde un cargo de Fuerza
 * Índigo: son personas morales distintas y quien escribió eligió a una.
 */

export interface RequestRow {
  readonly id: string;
  readonly folio: string;
  readonly requestType: SupportRequestType;
  readonly subject: string;
  readonly contactName: string;
  readonly status: SupportRequestStatus;
  readonly receivedAt: Date;
  readonly legalEntityShortName: string;
  readonly handledByLabel: string | null;
  readonly handledAt: Date | null;
}

export interface RequestDetail extends RequestRow {
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly preferredChannel: 'EMAIL' | 'PHONE';
  readonly narrative: string;
  readonly territoryHint: string | null;
  readonly handlingNote: string | null;
  readonly privacyNoticeVersion: number;
  readonly acceptedAt: Date;
}

/** Estados en los que nadie se ha hecho cargo todavía. */
const SIN_ATENDER: readonly SupportRequestStatus[] = ['RECEIVED', 'TRIAGE'];

/** Entidades que el actor alcanza, o `undefined` si las alcanza todas. */
function alcance(actor: ActorContext): readonly string[] | undefined {
  return actor.legalEntityScope.length === 0 ? undefined : actor.legalEntityScope;
}

/**
 * Ordena lo que hay que mirar antes.
 *
 * No es por novedad. Primero lo que nadie ha atendido; dentro de eso, lo que la
 * propia persona marcó como violencia o urgencia; y después lo más antiguo,
 * porque quien lleva más tiempo esperando respuesta es quien más la necesita.
 * Una bandeja ordenada por novedad entierra justo esos mensajes.
 *
 * El criterio de urgencia usa lo que la persona **declaró**, no una valoración
 * del sistema: clasificar es de la Fase 6 y exige una persona que confirme.
 */
function ordenar(filas: readonly RequestRow[]): RequestRow[] {
  const peso = (fila: RequestRow): number => {
    if (!SIN_ATENDER.includes(fila.status)) return 2;
    return fila.requestType === 'VIOLENCE_OR_URGENCY' ? 0 : 1;
  };

  return [...filas].sort(
    (a, b) => peso(a) - peso(b) || a.receivedAt.getTime() - b.receivedAt.getTime(),
  );
}

export async function requestList(
  actor: ActorContext,
  filter: { status?: SupportRequestStatus | undefined; requestType?: SupportRequestType | undefined } = {},
): Promise<UseCaseResult<RequestRow[]>> {
  const decision = can(actor, 'support.request.read', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = alcance(actor);

  const filas = await db().supportRequest.findMany({
    where: {
      ...(entidades === undefined ? {} : { legalEntityId: { in: [...entidades] } }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.requestType === undefined ? {} : { requestType: filter.requestType }),
    },
    orderBy: [{ receivedAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      folio: true,
      requestType: true,
      subject: true,
      contactName: true,
      status: true,
      receivedAt: true,
      handledAt: true,
      legalEntity: { select: { shortName: true } },
      handledByActor: { select: { label: true } },
    },
  });

  return ok(
    ordenar(
      filas.map((fila) => ({
        id: fila.id,
        folio: fila.folio,
        requestType: fila.requestType,
        subject: fila.subject,
        contactName: fila.contactName,
        status: fila.status,
        receivedAt: fila.receivedAt,
        legalEntityShortName: fila.legalEntity.shortName,
        handledByLabel: fila.handledByActor?.label ?? null,
        handledAt: fila.handledAt,
      })),
    ),
  );
}

/**
 * Abre una solicitud y **deja constancia de que se abrió**.
 *
 * Leer aquí no es consultar un catálogo: es leer lo que alguien contó sobre un
 * conflicto laboral, una discriminación o una urgencia. Que conste quién lo
 * leyó y cuándo es lo que hace responsable el acceso a un dato sensible
 * (PRD §20.4). Por eso esta función escribe en la bitácora aunque «solo lea».
 */
export async function requestDetail(
  actor: ActorContext,
  requestId: string,
): Promise<UseCaseResult<RequestDetail>> {
  const decision = can(actor, 'support.request.read', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = alcance(actor);

  const fila = await db().supportRequest.findFirst({
    where: {
      id: requestId,
      ...(entidades === undefined ? {} : { legalEntityId: { in: [...entidades] } }),
    },
    select: {
      id: true,
      folio: true,
      requestType: true,
      subject: true,
      contactName: true,
      status: true,
      receivedAt: true,
      handledAt: true,
      handlingNote: true,
      contactEmail: true,
      contactPhone: true,
      preferredChannel: true,
      narrative: true,
      territoryHint: true,
      acceptedAt: true,
      legalEntityId: true,
      legalEntity: { select: { shortName: true } },
      handledByActor: { select: { label: true } },
      privacyNoticeVersion: { select: { version: true } },
    },
  });

  // Fuera de alcance e inexistente responden igual: decir «existe pero no es
  // tuyo» confirmaría la existencia de una solicitud de otra entidad.
  if (fila === null) return fail(errors.notFound('solicitud inexistente o fuera del alcance del actor'));

  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SUPPORT_REQUEST_READ,
      objectKind: 'SupportRequest',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      metadata: { folio: fila.folio, requestType: fila.requestType },
    });
  });

  return ok({
    id: fila.id,
    folio: fila.folio,
    requestType: fila.requestType,
    subject: fila.subject,
    contactName: fila.contactName,
    status: fila.status,
    receivedAt: fila.receivedAt,
    legalEntityShortName: fila.legalEntity.shortName,
    handledByLabel: fila.handledByActor?.label ?? null,
    handledAt: fila.handledAt,
    contactEmail: fila.contactEmail,
    contactPhone: fila.contactPhone,
    preferredChannel: fila.preferredChannel,
    narrative: fila.narrative,
    territoryHint: fila.territoryHint,
    handlingNote: fila.handlingNote,
    privacyNoticeVersion: fila.privacyNoticeVersion.version,
    acceptedAt: fila.acceptedAt,
  });
}

export const resolveRequestSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(['ATENDER', 'DESCARTAR']),
  note: z
    .string()
    .trim()
    .min(3, { error: () => 'Escribe qué hiciste con esta solicitud: es lo que leerá quien venga después.' })
    .max(1000),
});

export type ResolveRequestInput = z.infer<typeof resolveRequestSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Marca una solicitud como atendida o descartada, con nota obligatoria.
 *
 * La nota no es burocracia: «atendida» sin decir cómo no le sirve a nadie que
 * retome el asunto dentro de seis meses, y descartar sin motivo escrito es
 * exactamente el acto que después nadie sabe explicar.
 *
 * El relato original no se toca ni aquí ni en ninguna otra ruta, y el motor lo
 * impide: la aplicación no tiene privilegio de actualización sobre esa columna.
 */
export async function resolveRequest(
  actor: ActorContext,
  input: ResolveRequestInput,
): Promise<UseCaseResult<{ requestId: string; status: SupportRequestStatus }>> {
  const parsed = resolveRequestSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'support.request.triage', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = alcance(actor);

  const fila = await db().supportRequest.findFirst({
    where: {
      id: data.requestId,
      ...(entidades === undefined ? {} : { legalEntityId: { in: [...entidades] } }),
    },
    select: { id: true, folio: true, status: true, legalEntityId: true },
  });
  if (fila === null) return fail(errors.notFound('solicitud inexistente o fuera del alcance del actor'));

  if (fila.status !== 'RECEIVED') {
    return fail(
      errors.conflict(
        'Alguien ya se hizo cargo de esta solicitud. Actualiza la página para ver quién.',
        `estado actual ${fila.status}`,
      ),
    );
  }

  const nuevoEstado: SupportRequestStatus = data.decision === 'ATENDER' ? 'HANDLED' : 'CLOSED_NO_ACTION';

  const actualizadas = await transaction(async (tx) => {
    // La condición sobre el estado va en el `where` y no solo en la
    // comprobación previa: dos personas que abran la solicitud a la vez no
    // pueden atenderla las dos, y quien llegue segunda tiene que enterarse.
    const resultado = await tx.supportRequest.updateMany({
      where: { id: fila.id, status: 'RECEIVED' },
      data: {
        status: nuevoEstado,
        handledByActorId: actor.actorId,
        handledAt: new Date(),
        handlingNote: data.note,
      },
    });

    if (resultado.count === 0) return 0;

    await recordAudit(tx, actor, {
      action:
        nuevoEstado === 'HANDLED'
          ? AUDIT_ACTIONS.SUPPORT_REQUEST_HANDLED
          : AUDIT_ACTIONS.SUPPORT_REQUEST_DISCARDED,
      objectKind: 'SupportRequest',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      metadata: { folio: fila.folio, note: data.note },
    });

    return resultado.count;
  });

  if (actualizadas === 0) {
    return fail(
      errors.conflict('Alguien se adelantó y ya se hizo cargo de esta solicitud.', 'carrera al resolver la entrada'),
    );
  }

  return ok({ requestId: fila.id, status: nuevoEstado });
}
