import { z } from 'zod';
import type { EventRegistrationStatus, MembershipCategory } from '@prisma-client/enums';
import type { Tx } from '@/platform/db/unit-of-work';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { meetsEligibility, parseEligibility } from '../domain/eligibility';

/**
 * Inscripción a un evento (PRD §16.3).
 *
 * Inscribirse es un acto de la propia persona, no una facultad institucional: se
 * ancla a `actor.personId`. El evento tiene que estar con inscripción abierta, la
 * persona tiene que ser elegible, y si el aforo está lleno la inscripción entra en
 * **lista de espera** —un estado, no otra tabla (ADR-0154)—. Al cancelar, sube la
 * primera de la lista. Todo bajo cerrojo del evento, para que dos inscripciones a
 * la vez no rebasen el aforo.
 */

const OCUPAN: EventRegistrationStatus[] = ['REGISTERED', 'CONFIRMED', 'ATTENDED'];

async function membresiaActiva(personId: string): Promise<{ activeMembership: boolean; membershipCategory: MembershipCategory | null }> {
  const m = await db().membership.findFirst({
    where: { personId, status: 'ACTIVE' },
    select: { category: true },
  });
  return { activeMembership: m !== null, membershipCategory: m?.category ?? null };
}

async function ocupadas(tx: Tx, eventId: string): Promise<number> {
  return tx.eventRegistration.count({ where: { eventId, status: { in: OCUPAN } } });
}

export const registerForEventSchema = z.object({ eventId: z.uuid() });

export async function registerForEvent(
  actor: ActorContext,
  input: { eventId: string },
): Promise<UseCaseResult<{ status: EventRegistrationStatus }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const parsed = registerForEventSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ eventId: ['Identificador de evento inválido.'] }));
  const eventId = parsed.data.eventId;
  const personId = actor.personId;

  const evento = await db().event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, capacity: true, eligibilityRules: true, legalEntityId: true },
  });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));
  if (evento.status !== 'REGISTRATION_OPEN') {
    return fail(errors.conflict('Este evento no tiene la inscripción abierta.'));
  }

  const elegibilidad = meetsEligibility(parseEligibility(evento.eligibilityRules), await membresiaActiva(personId));
  if (!elegibilidad.ok) return fail(errors.ruleViolation(elegibilidad.reason ?? 'No cumples los requisitos de este evento.'));

  const resultado = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evento:${eventId}`}))`;

    const existente = await tx.eventRegistration.findUnique({
      where: { eventId_personId: { eventId, personId } },
      select: { id: true, status: true },
    });
    if (existente !== null && existente.status !== 'CANCELLED') {
      return { conflicto: 'Ya estás inscrito en este evento.' as const };
    }

    const hay = evento.capacity === null || (await ocupadas(tx, eventId)) < evento.capacity;
    const status: EventRegistrationStatus = hay ? 'REGISTERED' : 'WAITLISTED';

    const registro = existente
      ? await tx.eventRegistration.update({ where: { id: existente.id }, data: { status }, select: { id: true } })
      : await tx.eventRegistration.create({ data: { eventId, personId, status, createdByActorId: actor.actorId }, select: { id: true } });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_REGISTRATION_CREATED,
      objectKind: 'EventRegistration',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: evento.legalEntityId,
      onBehalfOfPersonId: personId,
      metadata: { eventId, status },
    });
    return { status };
  });

  if ('conflicto' in resultado) return fail(errors.conflict(resultado.conflicto));
  return ok({ status: resultado.status });
}

export async function cancelOwnRegistration(
  actor: ActorContext,
  input: { eventId: string },
): Promise<UseCaseResult<{ cancelled: boolean; promoted: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const parsed = registerForEventSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ eventId: ['Identificador de evento inválido.'] }));
  const eventId = parsed.data.eventId;
  const personId = actor.personId;

  const evento = await db().event.findUnique({ where: { id: eventId }, select: { capacity: true, legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const resultado = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evento:${eventId}`}))`;

    const propio = await tx.eventRegistration.findUnique({
      where: { eventId_personId: { eventId, personId } },
      select: { id: true, status: true },
    });
    if (propio === null || propio.status === 'CANCELLED') return { cancelled: false, promoted: false };

    const liberaLugar = OCUPAN.includes(propio.status);
    await tx.eventRegistration.update({ where: { id: propio.id }, data: { status: 'CANCELLED' } });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_REGISTRATION_CANCELLED,
      objectKind: 'EventRegistration',
      objectId: propio.id,
      outcome: 'SUCCESS',
      legalEntityId: evento.legalEntityId,
      onBehalfOfPersonId: personId,
    });

    // Al liberarse un lugar, sube la primera de la lista de espera.
    let promoted = false;
    if (liberaLugar) {
      const hayLugar = evento.capacity === null || (await ocupadas(tx, eventId)) < evento.capacity;
      if (hayLugar) {
        const siguiente = await tx.eventRegistration.findFirst({
          where: { eventId, status: 'WAITLISTED' },
          orderBy: { registeredAt: 'asc' },
          select: { id: true, personId: true },
        });
        if (siguiente !== null) {
          await tx.eventRegistration.update({ where: { id: siguiente.id }, data: { status: 'REGISTERED' } });
          await recordAudit(tx, actor, {
            action: AUDIT_ACTIONS.EVENT_WAITLIST_PROMOTED,
            objectKind: 'EventRegistration',
            objectId: siguiente.id,
            outcome: 'SUCCESS',
            legalEntityId: evento.legalEntityId,
            onBehalfOfPersonId: siguiente.personId,
          });
          promoted = true;
        }
      }
    }
    return { cancelled: true, promoted };
  });

  return ok(resultado);
}

export interface MyRegistrationRow {
  readonly eventId: string;
  readonly slug: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly status: EventRegistrationStatus;
}

export async function myEventRegistrations(actor: ActorContext): Promise<UseCaseResult<readonly MyRegistrationRow[]>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const filas = await db().eventRegistration.findMany({
    where: { personId: actor.personId, status: { not: 'CANCELLED' } },
    orderBy: { event: { startsAt: 'asc' } },
    select: { status: true, event: { select: { id: true, slug: true, title: true, startsAt: true } } },
  });
  return ok(
    filas.map((f) => ({ eventId: f.event.id, slug: f.event.slug, title: f.event.title, startsAt: f.event.startsAt, status: f.status })),
  );
}

export interface RegistrationRow {
  readonly personName: string;
  readonly status: EventRegistrationStatus;
  readonly registeredAt: Date;
  readonly attended: boolean;
}

/** Las inscripciones de un evento, para quien lo gestiona. */
export async function eventRegistrations(actor: ActorContext, eventId: string): Promise<UseCaseResult<readonly RegistrationRow[]>> {
  const evento = await db().event.findUnique({ where: { id: eventId }, select: { legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.registration.read', { kind: 'EventRegistration', legalEntityId: evento.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().eventRegistration.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { registeredAt: 'asc' }],
    select: {
      status: true,
      registeredAt: true,
      attendanceAt: true,
      person: { select: { givenName: true, familyName: true } },
    },
  });
  return ok(
    filas.map((f) => ({
      personName: `${f.person.givenName} ${f.person.familyName}`,
      status: f.status,
      registeredAt: f.registeredAt,
      attended: f.attendanceAt !== null,
    })),
  );
}
