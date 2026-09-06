import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import { cambiarVisibilidad, catalogoCompleto, catalogoPublicado, editarFicha } from '@/modules/ecosystem';

/**
 * Administrar el catálogo (PRD §12.1; F7-UI-002).
 *
 * Lo que se prueba aquí es lo que puede hacer daño. Cambiar una dirección de
 * acceso es lo único de esta pantalla que decide **a dónde** se manda a alguien
 * que confía en el sitio, y por eso hay tres cosas que tienen que sostenerse:
 * que solo pueda hacerlo quien debe, que quede registrado quién fue con el
 * valor anterior y el nuevo, y que una dirección que no sirve no llegue a
 * guardarse.
 */

let base: TestDatabase;
let comunicacion: PersonaDePrueba;
let finanzas: PersonaDePrueba;
let fichaId: string;

beforeAll(async () => {
  base = await createTestDatabase('admin-ecosistema');
  await base.seed();

  const entidadId = await entidadPrincipal(base.prisma);
  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  comunicacion = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Comunica' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Cobra' });

  await nombrar(base.prisma, {
    userId: comunicacion.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
  await nombrar(base.prisma, {
    userId: finanzas.userId,
    roleCode: 'FINANCE',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });

  const cian = await base.prisma.ecosystemLink.findUniqueOrThrow({
    where: { code: 'CIAN' },
    select: { id: true },
  });
  fichaId = cian.id;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function fichaActual() {
  return base.prisma.ecosystemLink.findUniqueOrThrow({
    where: { id: fichaId },
    select: { name: true, summary: true, externalUrl: true, operationalStatus: true, sortOrder: true },
  });
}

const FICHA_BASE = {
  name: 'CIAN',
  summary: 'Centro Integral de Atención Neurodivergente, con su propia operación y su propia plataforma.',
  audienceText: 'Personas neurodivergentes y sus familias.',
  accentToken: 'CIAN' as const,
  sortOrder: '10',
};

describe('quién administra el catálogo', () => {
  it('quien mantiene el sitio público puede editar una ficha', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await editarFicha(actor, {
      ...FICHA_BASE,
      linkId: fichaId,
      externalUrl: 'https://cian.ejemplo.mx/',
    });

    expect(resultado.ok).toBe(true);
    expect((await fichaActual()).externalUrl).toBe('https://cian.ejemplo.mx/');
  });

  it('quien lleva las finanzas no puede, y la ficha no cambia', async () => {
    const antes = await fichaActual();
    const actor = await contextoDe(base.prisma, finanzas);

    const resultado = await editarFicha(actor, {
      ...FICHA_BASE,
      linkId: fichaId,
      externalUrl: 'https://otra-cualquiera.mx/',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
    expect(await fichaActual()).toEqual(antes);
  });

  it('quien no administra tampoco ve el catálogo completo', async () => {
    const actor = await contextoDe(base.prisma, finanzas);
    const resultado = await catalogoCompleto(actor);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('quien administra ve también lo que el público no ve', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: false });

    const publico = await catalogoPublicado();
    expect(publico.map((f) => f.code)).not.toContain('CIAN');

    const completo = await catalogoCompleto(actor);
    expect(completo.ok).toBe(true);
    if (completo.ok) {
      const cian = completo.data.find((f) => f.code === 'CIAN');
      expect(cian?.publicada).toBe(false);
      expect(cian?.summary).not.toBe('');
    }

    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: true });
  });
});

describe('la dirección de acceso', () => {
  it('deja rastro de quién la cambió, con el valor anterior y el nuevo', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    await editarFicha(actor, { ...FICHA_BASE, linkId: fichaId, externalUrl: 'https://antes.mx/' });
    await editarFicha(actor, { ...FICHA_BASE, linkId: fichaId, externalUrl: 'https://despues.mx/' });

    const asientos = await base.prisma.auditEvent.findMany({
      where: { action: 'ecosystem.link.url_changed', objectId: fichaId },
      orderBy: { occurredAt: 'desc' },
      take: 1,
      select: { metadata: true, actorId: true, occurredAt: true },
    });

    expect(asientos).toHaveLength(1);
    const metadata = asientos[0]!.metadata as Record<string, unknown>;
    expect(metadata['anterior']).toBe('https://antes.mx/');
    expect(metadata['nueva']).toBe('https://despues.mx/');
    expect(asientos[0]!.actorId).toBe(actor.actorId);
    expect(asientos[0]!.occurredAt).toBeInstanceOf(Date);
  });

  it('no deja rastro de cambio de dirección cuando solo se corrige el texto', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);
    const antes = await base.prisma.auditEvent.count({
      where: { action: 'ecosystem.link.url_changed', objectId: fichaId },
    });

    await editarFicha(actor, {
      ...FICHA_BASE,
      linkId: fichaId,
      summary: 'Centro Integral de Atención Neurodivergente. Corrección de una errata del resumen.',
      externalUrl: 'https://despues.mx/',
    });

    const despues = await base.prisma.auditEvent.count({
      where: { action: 'ecosystem.link.url_changed', objectId: fichaId },
    });
    expect(despues).toBe(antes);
  });

  it('vaciarla retira el acceso en vez de guardar una cadena vacía', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await editarFicha(actor, { ...FICHA_BASE, linkId: fichaId, externalUrl: '   ' });

    expect(resultado.ok).toBe(true);
    expect((await fichaActual()).externalUrl).toBeNull();

    const publico = await catalogoPublicado();
    expect(publico.find((f) => f.code === 'CIAN')?.accesoUrl).toBeNull();
  });

  it('rechaza una dirección sin cifrar antes de tocar la base', async () => {
    const antes = await fichaActual();
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await editarFicha(actor, {
      ...FICHA_BASE,
      linkId: fichaId,
      externalUrl: 'http://cian.ejemplo.mx',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('VALIDATION');
    expect(await fichaActual()).toEqual(antes);
  });

  it('rechaza un esquema que ejecutaría código en la sesión de quien pulsa', async () => {
    const antes = await fichaActual();
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await editarFicha(actor, {
      ...FICHA_BASE,
      linkId: fichaId,
      externalUrl: 'javascript:alert(1)',
    });

    expect(resultado.ok).toBe(false);
    expect(await fichaActual()).toEqual(antes);
  });
});

describe('retirar de la vista', () => {
  it('no borra la ficha: su texto y su orden siguen ahí', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    await editarFicha(actor, { ...FICHA_BASE, linkId: fichaId, externalUrl: '', sortOrder: '7' });
    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: false });

    const ficha = await fichaActual();
    expect(ficha.operationalStatus).toBe('HIDDEN');
    expect(ficha.summary.length).toBeGreaterThan(20);
    expect(ficha.sortOrder).toBe(7);

    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: true });
    expect((await fichaActual()).operationalStatus).toBe('ACTIVE');
  });

  it('publicar sin dirección se permite: la ficha cuenta qué es aunque no lleve a ningún lado', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    await editarFicha(actor, { ...FICHA_BASE, linkId: fichaId, externalUrl: '' });
    const resultado = await cambiarVisibilidad(actor, { linkId: fichaId, publicar: true });

    expect(resultado.ok).toBe(true);
    const publico = await catalogoPublicado();
    const cian = publico.find((f) => f.code === 'CIAN');
    expect(cian).toBeDefined();
    expect(cian?.accesoUrl).toBeNull();
  });
});
