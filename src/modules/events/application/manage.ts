import { z } from 'zod';
import type { EventKind, EventModality, EventStatus, EventVisibility } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Administración de eventos (PRD §16.3).
 *
 * Un evento nace borrador, se publica, abre inscripción y —si hace falta— se
 * cancela. Su identificador público y su slug no cambian: un enlace compartido no
 * cambia de destino (lo impone la base; aquí solo se generan una vez).
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return `${base || 'evento'}-${Math.random().toString(36).slice(2, 8)}`;
}

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    kind: z.enum(['ASSEMBLY_PUBLIC', 'COURSE', 'WORKSHOP', 'DIPLOMA', 'MEETING', 'CAMPAIGN']),
    legalEntityId: z.uuid(),
    territorialUnitId: z.uuid().nullable().default(null),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    modality: z.enum(['IN_PERSON', 'REMOTE', 'HYBRID']),
    venue: z.string().trim().max(300).nullable().default(null),
    capacity: z.number().int().positive().nullable().default(null),
    visibility: z.enum(['PUBLIC', 'MEMBERS', 'INVITATION']).default('MEMBERS'),
    membersOnly: z.boolean().default(false),
    catalogProductId: z.uuid().nullable().default(null),
    issuesConstancy: z.boolean().default(false),
    constancyTemplateId: z.uuid().nullable().default(null),
  })
  .refine((v) => v.endsAt >= v.startsAt, { error: 'El evento no puede terminar antes de empezar.', path: ['endsAt'] })
  .refine((v) => !v.issuesConstancy || v.constancyTemplateId !== null, {
    error: 'Un evento que emite constancia tiene que nombrar su plantilla.',
    path: ['constancyTemplateId'],
  });
export type CreateEventInput = z.input<typeof createEventSchema>;

export async function createEvent(
  actor: ActorContext,
  input: CreateEventInput,
): Promise<UseCaseResult<{ eventId: string; slug: string }>> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: data.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const creado = await transaction(async (tx) => {
    const evento = await tx.event.create({
      data: {
        publicId: newPublicId(),
        slug: slugify(data.title),
        title: data.title,
        kind: data.kind,
        legalEntityId: data.legalEntityId,
        territorialUnitId: data.territorialUnitId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        modality: data.modality,
        venue: data.venue,
        capacity: data.capacity,
        eligibilityRules: { membersOnly: data.membersOnly },
        visibility: data.visibility,
        catalogProductId: data.catalogProductId,
        issuesConstancy: data.issuesConstancy,
        constancyTemplateId: data.constancyTemplateId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, slug: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_CREATED,
      objectKind: 'Event',
      objectId: evento.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: { title: data.title, kind: data.kind },
    });
    return evento;
  });

  return ok({ eventId: creado.id, slug: creado.slug });
}

const TRANSICIONES: Record<'publish' | 'open' | 'cancel', { desde: EventStatus[]; hacia: EventStatus; accion: typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS] }> = {
  publish: { desde: ['DRAFT'], hacia: 'PUBLISHED', accion: AUDIT_ACTIONS.EVENT_PUBLISHED },
  open: { desde: ['PUBLISHED'], hacia: 'REGISTRATION_OPEN', accion: AUDIT_ACTIONS.EVENT_REGISTRATION_OPENED },
  cancel: { desde: ['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'FULL', 'IN_PROGRESS'], hacia: 'CANCELLED', accion: AUDIT_ACTIONS.EVENT_CANCELLED },
};

async function transicion(
  actor: ActorContext,
  eventId: string,
  paso: 'publish' | 'open' | 'cancel',
): Promise<UseCaseResult<{ status: EventStatus }>> {
  const t = TRANSICIONES[paso];
  const evento = await db().event.findUnique({ where: { id: eventId }, select: { id: true, status: true, legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: evento.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (!t.desde.includes(evento.status)) {
    return fail(errors.conflict(`Un evento en estado ${evento.status} no admite ese cambio.`));
  }

  await transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status: t.hacia, updatedByActorId: actor.actorId } });
    await recordAudit(tx, actor, {
      action: t.accion,
      objectKind: 'Event',
      objectId: eventId,
      outcome: 'SUCCESS',
      legalEntityId: evento.legalEntityId,
    });
  });
  return ok({ status: t.hacia });
}

export const eventIdSchema = z.object({ eventId: z.uuid() });

export function publishEvent(actor: ActorContext, input: { eventId: string }): Promise<UseCaseResult<{ status: EventStatus }>> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(fail(errors.validation(detalles(parsed.error))));
  return transicion(actor, parsed.data.eventId, 'publish');
}

export function openEventRegistration(actor: ActorContext, input: { eventId: string }): Promise<UseCaseResult<{ status: EventStatus }>> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(fail(errors.validation(detalles(parsed.error))));
  return transicion(actor, parsed.data.eventId, 'open');
}

export function cancelEvent(actor: ActorContext, input: { eventId: string }): Promise<UseCaseResult<{ status: EventStatus }>> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(fail(errors.validation(detalles(parsed.error))));
  return transicion(actor, parsed.data.eventId, 'cancel');
}

export interface EventRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: EventKind;
  readonly modality: EventModality;
  readonly visibility: EventVisibility;
  readonly status: EventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number | null;
  readonly registeredCount: number;
  readonly waitlistCount: number;
}

export interface EventDetailForStaff extends EventRow {
  readonly venue: string | null;
  readonly issuesConstancy: boolean;
  readonly membersOnly: boolean;
}

/** Un evento por su id, para quien lo gestiona. */
export async function eventDetailForStaff(actor: ActorContext, eventId: string): Promise<UseCaseResult<EventDetailForStaff>> {
  const e = await db().event.findUnique({
    where: { id: eventId },
    select: {
      id: true, slug: true, title: true, kind: true, modality: true, visibility: true, status: true,
      startsAt: true, endsAt: true, capacity: true, venue: true, issuesConstancy: true, eligibilityRules: true,
      legalEntityId: true,
    },
  });
  if (e === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: e.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const conteos = await db().eventRegistration.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } });
  let registeredCount = 0;
  let waitlistCount = 0;
  for (const c of conteos) {
    if (c.status === 'REGISTERED' || c.status === 'CONFIRMED' || c.status === 'ATTENDED') registeredCount += c._count._all;
    else if (c.status === 'WAITLISTED') waitlistCount += c._count._all;
  }
  const membersOnly = typeof e.eligibilityRules === 'object' && e.eligibilityRules !== null && !Array.isArray(e.eligibilityRules)
    ? (e.eligibilityRules as Record<string, unknown>)['membersOnly'] === true : false;

  return ok({
    id: e.id, slug: e.slug, title: e.title, kind: e.kind, modality: e.modality, visibility: e.visibility, status: e.status,
    startsAt: e.startsAt, endsAt: e.endsAt, capacity: e.capacity, venue: e.venue, issuesConstancy: e.issuesConstancy,
    membersOnly, registeredCount, waitlistCount,
  });
}

/** Los eventos que la persona gestiona, con cuántos van inscritos. */
export async function eventList(actor: ActorContext): Promise<UseCaseResult<readonly EventRow[]>> {
  const decision = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const scope = [...actor.legalEntityScope];
  const eventos = await db().event.findMany({
    where: scope.length > 0 ? { legalEntityId: { in: scope } } : {},
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      modality: true,
      visibility: true,
      status: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
    },
  });

  const conteos = await db().eventRegistration.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: eventos.map((e) => e.id) } },
    _count: { _all: true },
  });
  const ocupados = new Map<string, number>();
  const espera = new Map<string, number>();
  for (const c of conteos) {
    if (c.status === 'REGISTERED' || c.status === 'CONFIRMED' || c.status === 'ATTENDED') {
      ocupados.set(c.eventId, (ocupados.get(c.eventId) ?? 0) + c._count._all);
    } else if (c.status === 'WAITLISTED') {
      espera.set(c.eventId, (espera.get(c.eventId) ?? 0) + c._count._all);
    }
  }

  return ok(
    eventos.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      kind: e.kind,
      modality: e.modality,
      visibility: e.visibility,
      status: e.status,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      capacity: e.capacity,
      registeredCount: ocupados.get(e.id) ?? 0,
      waitlistCount: espera.get(e.id) ?? 0,
    })),
  );
}
