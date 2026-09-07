import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Lo que el motor garantiza sobre eventos, constancias y preferencias (PRD §16.3,
 * Fase 9 bloque A).
 *
 * Ningún caso de uso se prueba aquí. Se prueba que las promesas del esquema **no
 * dependan de que el código las respete**: que una constancia no se pueda revocar
 * si nunca se emitió, que un evento que dice emitir constancias nombre su
 * plantilla, que un identificador público no cambie, y —la garantía que gobierna
 * la fase— que un aviso obligatorio no se pueda suprimir por preferencia.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;
let personaId: string;

beforeAll(async () => {
  base = await createTestDatabase('eventos');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona' });
  personaId = persona.personId;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

function unico(prefijo: string): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 10)}`;
}

async function evento(overrides: Record<string, unknown> = {}) {
  const inicio = new Date();
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
  return base.prisma.event.create({
    data: {
      publicId: newPublicId(),
      slug: unico('evento'),
      title: 'Taller de prueba',
      kind: 'COURSE',
      legalEntityId: entidadId,
      startsAt: inicio,
      endsAt: fin,
      modality: 'IN_PERSON',
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, slug: true },
  });
}

async function inscripcion(eventId: string, personId: string, overrides: Record<string, unknown> = {}) {
  return base.prisma.eventRegistration.create({
    data: { eventId, personId, createdByActorId: actorId, ...overrides },
    select: { id: true },
  });
}

async function preferencia(overrides: Record<string, unknown> = {}) {
  return base.prisma.notificationPreference.create({
    data: {
      personId: personaId,
      category: 'PROMOTIONAL',
      channel: 'EMAIL',
      createdByActorId: actorId,
      ...overrides,
    },
    select: { id: true },
  });
}

describe('un evento que emite constancia nombra su plantilla', () => {
  it('decir que emite constancia sin plantilla se rechaza', async () => {
    await expect(evento({ issuesConstancy: true })).rejects.toThrow(/event_constancia_con_plantilla/);
  });
  it('sin emitir constancia, no hace falta plantilla', async () => {
    const e = await evento({ issuesConstancy: false });
    expect(e.id).toBeDefined();
  });
});

describe('un aforo es nulo o positivo, y las fechas son coherentes', () => {
  it('un aforo de cero se rechaza', async () => {
    await expect(evento({ capacity: 0 })).rejects.toThrow(/event_aforo_positivo/);
  });
  it('un evento que termina antes de empezar se rechaza', async () => {
    const inicio = new Date();
    await expect(evento({ startsAt: inicio, endsAt: new Date(inicio.getTime() - 1000) })).rejects.toThrow(
      /event_fechas_coherentes/,
    );
  });
});

describe('el identificador público y el slug de un evento no cambian', () => {
  it('la aplicación no puede reescribir el slug', async () => {
    const e = await evento();
    await expect(base.prisma.event.update({ where: { id: e.id }, data: { slug: unico('otro') } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('una inscripción es única por persona y evento', () => {
  it('inscribirse dos veces al mismo evento se rechaza', async () => {
    const e = await evento();
    await inscripcion(e.id, personaId);
    await expect(inscripcion(e.id, personaId)).rejects.toThrow();
  });
  it('la inscripción no cambia de evento ni de persona', async () => {
    const e = await evento();
    const otro = await evento();
    const r = await inscripcion(e.id, personaId);
    await expect(
      base.prisma.eventRegistration.update({ where: { id: r.id }, data: { eventId: otro.id } }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('una constancia no se revoca si nunca se emitió, y la evaluación va en rango', () => {
  it('revocar sin documento de constancia se rechaza', async () => {
    const e = await evento();
    await expect(
      inscripcion(e.id, personaId, { constancyRevokedAt: new Date() }),
    ).rejects.toThrow(/registro_revocacion_con_constancia/);
  });
  it('una evaluación fuera de 0..100 se rechaza', async () => {
    const e = await evento();
    await expect(inscripcion(e.id, personaId, { evaluationScore: 150 })).rejects.toThrow(
      /registro_evaluacion_en_rango/,
    );
  });
});

describe('un aviso obligatorio no se suprime por preferencia (la garantía de la fase)', () => {
  it('suprimir una categoría obligatoria se rechaza', async () => {
    await expect(preferencia({ category: 'GOVERNANCE_MANDATORY', suppressed: true })).rejects.toThrow(
      /preferencia_obligatoria_no_se_suprime/,
    );
  });
  it('una categoría promocional sí se puede suprimir', async () => {
    const p = await preferencia({ category: 'PROMOTIONAL', suppressed: true });
    expect(p.id).toBeDefined();
  });
});
