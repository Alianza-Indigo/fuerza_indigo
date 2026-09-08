import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { territorialIndicators } from '@/modules/dashboards';
import { UMBRAL_DE_PRIVACIDAD } from '@/platform/privacy/threshold';
import { createEvent, openEventRegistration, publishEvent, registerAttendance, registerForEvent } from '@/modules/events';

/**
 * Indicadores territoriales con umbral de privacidad (PRD §24 Fase 9 criterio 3).
 *
 * Se prueba contra la base real, con el método de romper: una cuenta de personas
 * por debajo del umbral se suprime entera; al alcanzarlo, se publica; y el número
 * de eventos —que no señala a nadie— se publica siempre.
 */

let base: TestDatabase;
let entidadId: string;
let organiza: ActorContext;
let contador = 0;

beforeAll(async () => {
  base = await createTestDatabase('indicadores_territoriales');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const org = await crearPersonaConCuenta(base.prisma, { givenName: 'Organiza', familyName: 'Territorio' });
  await nombrar(base.prisma, { userId: org.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  organiza = await contextoDe(base.prisma, org);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

/** Crea una unidad territorial suelta para el caso. */
async function crearUnidad(): Promise<string> {
  contador += 1;
  const autor = await actorDeMigracion(base.prisma);
  const publicId = newPublicId();
  await base.prisma.territorialUnit.create({
    data: {
      publicId,
      code: `SECC-${contador}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Sección de prueba ${contador}`,
      type: 'SECTION',
      path: `/mx/prueba-${contador}-${Math.random().toString(36).slice(2, 6)}`,
      depth: 1,
      countryCode: 'MX',
      createdOn: new Date(),
      createdByActorId: autor,
      updatedByActorId: autor,
    },
  });
  return publicId;
}

/** Un evento en una unidad, con `n` personas que asistieron. */
async function eventoConAsistentes(unitPublicId: string, n: number): Promise<void> {
  const unidad = await base.prisma.territorialUnit.findUniqueOrThrow({ where: { publicId: unitPublicId }, select: { id: true } });
  const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const creado = await createEvent(organiza, {
    title: `Taller ${Math.random().toString(36).slice(2, 7)}`,
    kind: 'WORKSHOP',
    legalEntityId: entidadId,
    territorialUnitId: unidad.id,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
    modality: 'IN_PERSON',
    visibility: 'MEMBERS',
  });
  if (!creado.ok) throw new Error(creado.error.message);
  await publishEvent(organiza, { eventId: creado.data.eventId });
  await openEventRegistration(organiza, { eventId: creado.data.eventId });

  for (let i = 0; i < n; i += 1) {
    const p = await crearPersonaConCuenta(base.prisma, { givenName: `Asiste${i}` });
    const ctx = await contextoDe(base.prisma, p);
    const r = await registerForEvent(ctx, { eventId: creado.data.eventId });
    if (!r.ok) throw new Error('no se inscribió');
    const reg = await base.prisma.eventRegistration.findFirstOrThrow({
      where: { eventId: creado.data.eventId, personId: p.personId },
      select: { id: true },
    });
    await registerAttendance(organiza, { registrationId: reg.id, attended: true });
  }
}

function rango() {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - 365 * 24 * 3600 * 1000);
  const f = (d: Date): string => d.toISOString().slice(0, 10);
  return { desde: f(desde), hasta: f(hoy) };
}

describe('indicadores territoriales', () => {
  it('LA GARANTÍA: una cuenta de personas por debajo del umbral se suprime entera', async () => {
    const unidad = await crearUnidad();
    await eventoConAsistentes(unidad, UMBRAL_DE_PRIVACIDAD - 2); // por debajo del umbral

    const ind = await territorialIndicators(organiza, { unitPublicId: unidad, ...rango() });
    expect(ind.ok).toBe(true);
    if (!ind.ok) return;
    expect(ind.data.asistentes.publicable).toBe(false);
    expect(ind.data.celdasSuprimidas).toBeGreaterThanOrEqual(1);
    // El número de eventos, en cambio, no señala a nadie: se publica en crudo.
    expect(ind.data.eventosRealizados).toBe(1);
  });

  it('al alcanzar el umbral, la cuenta se publica', async () => {
    const unidad = await crearUnidad();
    await eventoConAsistentes(unidad, UMBRAL_DE_PRIVACIDAD); // en el umbral

    const ind = await territorialIndicators(organiza, { unitPublicId: unidad, ...rango() });
    expect(ind.ok).toBe(true);
    if (!ind.ok) return;
    expect(ind.data.asistentes.publicable).toBe(true);
    if (ind.data.asistentes.publicable) expect(ind.data.asistentes.valor).toBe(UMBRAL_DE_PRIVACIDAD);
  });

  it('quien no puede leer unidades territoriales no ve los indicadores', async () => {
    const unidad = await crearUnidad();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'SinCargo' });
    const ctx = await contextoDe(base.prisma, p);
    const ind = await territorialIndicators(ctx, { unitPublicId: unidad, ...rango() });
    expect(ind.ok).toBe(false);
    if (!ind.ok) expect(ind.error.code).toBe('FORBIDDEN');
  });
});
