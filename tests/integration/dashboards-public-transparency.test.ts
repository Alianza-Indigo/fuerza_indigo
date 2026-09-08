import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { transparenciaPublica } from '@/modules/dashboards';
import { UMBRAL_DE_PRIVACIDAD } from '@/platform/privacy/threshold';
import { createEvent, openEventRegistration, publishEvent, registerAttendance, registerForEvent } from '@/modules/events';

/**
 * Transparencia pública: agregados con umbral, nunca datos de personas
 * (PRD §24 Fase 9).
 *
 * Se prueba contra la base real, con el método de romper: una cuenta de
 * participación por debajo del umbral se suprime; al alcanzarlo, se publica.
 */

let base: TestDatabase;
let entidadId: string;
let organiza: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('transparencia_publica');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const org = await crearPersonaConCuenta(base.prisma, { givenName: 'Organiza', familyName: 'Transparencia' });
  await nombrar(base.prisma, { userId: org.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  organiza = await contextoDe(base.prisma, org);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

async function eventoConAsistentes(n: number): Promise<void> {
  const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const creado = await createEvent(organiza, {
    title: `Taller ${Math.random().toString(36).slice(2, 7)}`,
    kind: 'WORKSHOP',
    legalEntityId: entidadId,
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

describe('transparencia pública', () => {
  it('LA GARANTÍA: una cuenta de participación por debajo del umbral se suprime', async () => {
    await eventoConAsistentes(UMBRAL_DE_PRIVACIDAD - 2); // por debajo del umbral

    const t = await transparenciaPublica();
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.data.personasFormadas.publicable).toBe(false);
    // Los hechos institucionales, en cambio, se publican en crudo.
    expect(typeof t.data.agremiadosActivos).toBe('number');
    expect(typeof t.data.eventosRealizados).toBe('number');
    expect(t.data.eventosRealizados).toBeGreaterThanOrEqual(1);
  });

  it('al alcanzar el umbral, la cuenta se publica', async () => {
    await eventoConAsistentes(2); // ahora hay 3 + 2 = 5 en total

    const t = await transparenciaPublica();
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.data.personasFormadas.publicable).toBe(true);
    if (t.data.personasFormadas.publicable) {
      expect(t.data.personasFormadas.valor).toBeGreaterThanOrEqual(UMBRAL_DE_PRIVACIDAD);
    }
  });
});
