import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import {
  confirmEventRegistrationFromPayment,
  createEvent,
  openEventRegistration,
  publishEvent,
  registerForEvent,
  startEventCheckout,
} from '@/modules/events';
import { systemContext } from '@/platform/kernel/actor-context';

/**
 * Cobro de eventos (PRD §16.3, §11; bloque F).
 *
 * La garantía: una inscripción de pago **no se confirma hasta que el pago se
 * confirma**. Se prueba el manejador que confirma —el mismo que corre desde el
 * webhook— sin la pasarela: un pago que no está en SUCCEEDED no confirma nada.
 */

let base: TestDatabase;
let entidadId: string;
let actorMigracion: string;
let organiza: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('eventos_pago');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorMigracion = await actorDeMigracion(base.prisma);
  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien' });
  const org = await crearPersonaConCuenta(base.prisma, { givenName: 'Organiza' });
  await nombrar(base.prisma, { userId: org.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: entidadId });
  organiza = await contextoDe(base.prisma, org);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

function uid(): string {
  return Math.random().toString(36).slice(2, 20);
}

async function eventoAbierto(): Promise<string> {
  const inicio = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const creado = await createEvent(organiza, {
    title: `Curso ${uid().slice(0, 5)}`, kind: 'COURSE', legalEntityId: entidadId,
    startsAt: inicio.toISOString(), endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
    modality: 'IN_PERSON', visibility: 'MEMBERS',
  });
  if (!creado.ok) throw new Error('no se creó');
  await publishEvent(organiza, { eventId: creado.data.eventId });
  await openEventRegistration(organiza, { eventId: creado.data.eventId });
  return creado.data.eventId;
}

async function pagoDe(personId: string): Promise<string> {
  const cuenta = await base.prisma.billingAccount.create({
    data: { holderKind: 'PERSON', personId, legalEntityId: entidadId, billingEmail: `${uid()}@ejemplo.invalid` },
    select: { id: true },
  });
  const pago = await base.prisma.payment.create({
    data: {
      publicId: uid().slice(0, 20),
      billingAccountId: cuenta.id,
      legalEntityId: entidadId,
      amountMinor: 15000n,
      currency: 'MXN',
      stripeAccountKey: 'FUERZA',
      method: 'STRIPE_CHECKOUT',
      idempotencyKey: uid(),
      status: 'REQUIRES_PAYMENT',
      createdByActorId: actorMigracion,
    },
    select: { id: true },
  });
  return pago.id;
}

const sistema = () => systemContext({ actorId: actorMigracion, jobType: 'domain-events', correlationId: uid() });

describe('una inscripción de pago se confirma solo cuando el pago se confirma', () => {
  it('con el pago aún sin confirmar, la inscripción no se confirma', async () => {
    const eventId = await eventoAbierto();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Paga' });
    const ctx = await contextoDe(base.prisma, p);
    await registerForEvent(ctx, { eventId });
    const paymentId = await pagoDe(p.personId);
    await base.prisma.eventRegistration.update({ where: { eventId_personId: { eventId, personId: p.personId } }, data: { paymentId } });

    const r = await confirmEventRegistrationFromPayment(sistema(), paymentId);
    expect(r.confirmed).toBe(false);
    const reg = await base.prisma.eventRegistration.findFirst({ where: { eventId, personId: p.personId }, select: { status: true } });
    expect(reg?.status).toBe('REGISTERED');
  });

  it('con el pago confirmado, la inscripción pasa a CONFIRMED; repetir no cambia nada', async () => {
    const eventId = await eventoAbierto();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Confirma' });
    const ctx = await contextoDe(base.prisma, p);
    await registerForEvent(ctx, { eventId });
    const paymentId = await pagoDe(p.personId);
    await base.prisma.eventRegistration.update({ where: { eventId_personId: { eventId, personId: p.personId } }, data: { paymentId } });
    await base.prisma.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED' } });

    const r = await confirmEventRegistrationFromPayment(sistema(), paymentId);
    expect(r.confirmed).toBe(true);
    const reg = await base.prisma.eventRegistration.findFirst({ where: { eventId, personId: p.personId }, select: { status: true } });
    expect(reg?.status).toBe('CONFIRMED');

    const otra = await confirmEventRegistrationFromPayment(sistema(), paymentId);
    expect(otra.confirmed).toBe(false);
  });

  it('un pago que no corresponde a ninguna inscripción no confirma nada', async () => {
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Ajena' });
    const paymentId = await pagoDe(p.personId);
    await base.prisma.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED' } });
    const r = await confirmEventRegistrationFromPayment(sistema(), paymentId);
    expect(r.confirmed).toBe(false);
  });
});

describe('el inicio del cobro se protege', () => {
  it('un evento sin costo no se paga', async () => {
    const eventId = await eventoAbierto();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Gratis' });
    const ctx = await contextoDe(base.prisma, p);
    await registerForEvent(ctx, { eventId });
    const r = await startEventCheckout(ctx, { eventId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CONFLICT');
  });

  it('no se paga un evento al que no te has inscrito', async () => {
    const eventId = await eventoAbierto();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'SinInscribir' });
    const ctx = await contextoDe(base.prisma, p);
    const r = await startEventCheckout(ctx, { eventId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CONFLICT');
  });
});
