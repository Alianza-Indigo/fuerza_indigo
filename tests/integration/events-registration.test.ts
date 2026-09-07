import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearMembresia, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import {
  cancelOwnRegistration,
  createEvent,
  openEventRegistration,
  publishEvent,
  registerForEvent,
} from '@/modules/events';

/**
 * Inscripción a eventos: aforo, elegibilidad y lista de espera (PRD §16.3; bloque E).
 *
 * Se prueba contra la base real: que el aforo lleno mande a lista de espera, que
 * al cancelar suba la primera de la lista, que un evento solo para agremiados
 * rechace a quien no lo es, y que nadie se inscriba dos veces.
 */

let base: TestDatabase;
let entidadId: string;
let organiza: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('eventos_inscripcion');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien' });
  const org = await crearPersonaConCuenta(base.prisma, { givenName: 'Organiza' });
  await nombrar(base.prisma, { userId: org.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: entidadId });
  organiza = await contextoDe(base.prisma, org);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function eventoAbierto(overrides: { capacity?: number | null; membersOnly?: boolean } = {}): Promise<string> {
  const inicio = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const creado = await createEvent(organiza, {
    title: `Taller ${Math.random().toString(36).slice(2, 7)}`,
    kind: 'WORKSHOP',
    legalEntityId: entidadId,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
    modality: 'IN_PERSON',
    capacity: overrides.capacity ?? null,
    visibility: 'MEMBERS',
    membersOnly: overrides.membersOnly ?? false,
  });
  if (!creado.ok) throw new Error('no se creó el evento');
  await publishEvent(organiza, { eventId: creado.data.eventId });
  await openEventRegistration(organiza, { eventId: creado.data.eventId });
  return creado.data.eventId;
}

async function persona(nombre: string): Promise<ActorContext> {
  const p = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  return contextoDe(base.prisma, p);
}

describe('aforo y lista de espera', () => {
  it('con el cupo lleno, la siguiente entra en lista de espera; al cancelar, sube', async () => {
    const eventId = await eventoAbierto({ capacity: 1 });
    const ana = await persona('Ana');
    const beto = await persona('Beto');

    const rAna = await registerForEvent(ana, { eventId });
    expect(rAna.ok && rAna.data.status).toBe('REGISTERED');
    const rBeto = await registerForEvent(beto, { eventId });
    expect(rBeto.ok && rBeto.data.status).toBe('WAITLISTED');

    const cancel = await cancelOwnRegistration(ana, { eventId });
    expect(cancel.ok && cancel.data.promoted).toBe(true);

    const betoAhora = await base.prisma.eventRegistration.findFirst({ where: { eventId, person: { givenName: 'Beto' } }, select: { status: true } });
    expect(betoAhora?.status).toBe('REGISTERED');
  });

  it('sin aforo declarado, todas quedan inscritas', async () => {
    const eventId = await eventoAbierto({ capacity: null });
    for (const nombre of ['Ce', 'De', 'Efe']) {
      const p = await persona(nombre);
      const r = await registerForEvent(p, { eventId });
      expect(r.ok && r.data.status).toBe('REGISTERED');
    }
  });
});

describe('elegibilidad y unicidad', () => {
  it('un evento solo para agremiados rechaza a quien no lo es y admite a quien sí', async () => {
    const eventId = await eventoAbierto({ membersOnly: true });
    const externa = await persona('Externa');
    const rExterna = await registerForEvent(externa, { eventId });
    expect(rExterna.ok).toBe(false);
    if (!rExterna.ok) expect(rExterna.error.code).toBe('RULE_VIOLATION');

    const agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Agremiada' });
    await crearMembresia(base.prisma, { personId: agremiada.personId, legalEntityId: entidadId, typeCode: 'AGREMIADO', status: 'ACTIVE' });
    const ctx = await contextoDe(base.prisma, agremiada);
    const rOk = await registerForEvent(ctx, { eventId });
    expect(rOk.ok && rOk.data.status).toBe('REGISTERED');
  });

  it('nadie se inscribe dos veces al mismo evento', async () => {
    const eventId = await eventoAbierto();
    const p = await persona('Repetida');
    await registerForEvent(p, { eventId });
    const otra = await registerForEvent(p, { eventId });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });

  it('no se inscribe a un evento sin la inscripción abierta', async () => {
    const inicio = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const creado = await createEvent(organiza, {
      title: 'Borrador', kind: 'MEETING', legalEntityId: entidadId,
      startsAt: inicio.toISOString(), endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
      modality: 'REMOTE', visibility: 'MEMBERS',
    });
    if (!creado.ok) throw new Error('no se creó');
    const p = await persona('Temprana');
    const r = await registerForEvent(p, { eventId: creado.data.eventId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CONFLICT');
  });
});
