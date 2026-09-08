import type { EventKind, EventModality, EventRegistrationStatus, EventStatus, EventVisibility } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Calendario de eventos, público y de la persona (PRD §16.3).
 *
 * El público ve los eventos abiertos marcados como públicos. Quien entra con
 * cuenta ve además los que son para agremiados. Los eventos por invitación no
 * aparecen en ningún calendario: solo los ve quien ya tiene una inscripción.
 */

export interface CalendarRow {
  readonly slug: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly modality: EventModality;
  readonly visibility: EventVisibility;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly venue: string | null;
  readonly registrationOpen: boolean;
}

const VISIBLES: EventStatus[] = ['PUBLISHED', 'REGISTRATION_OPEN', 'FULL', 'IN_PROGRESS'];

function toRow(e: {
  slug: string;
  title: string;
  kind: EventKind;
  modality: EventModality;
  visibility: EventVisibility;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  status: EventStatus;
}): CalendarRow {
  return { slug: e.slug, title: e.title, kind: e.kind, modality: e.modality, visibility: e.visibility, startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue, registrationOpen: e.status === 'REGISTRATION_OPEN' };
}

const SELECT = { slug: true, title: true, kind: true, modality: true, visibility: true, startsAt: true, endsAt: true, venue: true, status: true } as const;

/** Los eventos públicos y próximos. No exige sesión. */
export async function publicEventCalendar(): Promise<readonly CalendarRow[]> {
  const eventos = await db().event.findMany({
    where: { visibility: 'PUBLIC', status: { in: VISIBLES }, endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    select: SELECT,
  });
  return eventos.map(toRow);
}

export interface MemberCalendarRow extends CalendarRow {
  readonly eventId: string;
  readonly myStatus: EventRegistrationStatus | null;
  readonly hasCost: boolean;
}

/** Los eventos que una persona con cuenta puede ver: públicos y para agremiados. */
export async function memberEventCalendar(actor: ActorContext): Promise<UseCaseResult<readonly MemberCalendarRow[]>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const personId = actor.personId;

  const eventos = await db().event.findMany({
    where: {
      visibility: { in: ['PUBLIC', 'MEMBERS'] },
      status: { in: VISIBLES },
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: 'asc' },
    select: { ...SELECT, id: true, catalogProductId: true },
  });

  const mias = new Map(
    (
      await db().eventRegistration.findMany({
        where: { personId, eventId: { in: eventos.map((e) => e.id) }, status: { not: 'CANCELLED' } },
        select: { eventId: true, status: true },
      })
    ).map((r) => [r.eventId, r.status]),
  );

  return ok(eventos.map((e) => ({ ...toRow(e), eventId: e.id, myStatus: mias.get(e.id) ?? null, hasCost: e.catalogProductId !== null })));
}

export interface EventDetailView extends CalendarRow {
  readonly eventId: string;
  readonly publicId: string;
  readonly capacity: number | null;
  readonly membersOnly: boolean;
  readonly issuesConstancy: boolean;
  readonly myStatus: EventRegistrationStatus | null;
}

/**
 * El detalle de un evento, respetando su visibilidad.
 *
 * Un evento por invitación solo lo ve quien tiene una inscripción; uno para
 * agremiados, quien entró con cuenta; uno público, cualquiera.
 */
export async function eventDetailBySlug(actor: ActorContext, slug: string): Promise<UseCaseResult<EventDetailView>> {
  const evento = await db().event.findUnique({
    where: { slug },
    select: { ...SELECT, id: true, publicId: true, capacity: true, eligibilityRules: true, issuesConstancy: true },
  });
  if (evento === null || !VISIBLES.includes(evento.status)) return fail(errors.notFound('Ese evento no existe.'));

  const miRegistro = actor.personId === null
    ? null
    : await db().eventRegistration.findUnique({
        where: { eventId_personId: { eventId: evento.id, personId: actor.personId } },
        select: { status: true },
      });
  const myStatus = miRegistro !== null && miRegistro.status !== 'CANCELLED' ? miRegistro.status : null;

  // Control de visibilidad.
  if (evento.visibility === 'MEMBERS' && actor.personId === null) {
    return fail(errors.notFound('Ese evento no existe.'));
  }
  if (evento.visibility === 'INVITATION' && myStatus === null) {
    return fail(errors.notFound('Ese evento no existe.'));
  }

  const membersOnly = typeof evento.eligibilityRules === 'object' && evento.eligibilityRules !== null && !Array.isArray(evento.eligibilityRules)
    ? (evento.eligibilityRules as Record<string, unknown>)['membersOnly'] === true
    : false;

  return ok({
    ...toRow(evento),
    eventId: evento.id,
    publicId: evento.publicId,
    capacity: evento.capacity,
    membersOnly,
    issuesConstancy: evento.issuesConstancy,
    myStatus,
  });
}
