import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import { catalogoPublicado } from '@/modules/ecosystem';
import { createPage } from '@/modules/content';

/**
 * El catálogo tal como lo ven las dos pantallas (PRD §12.4; F7-UI-001).
 *
 * Lo que se prueba aquí no es que la consulta devuelva filas, sino las tres
 * cosas que, si fallaran, nadie notaría hasta que fuera tarde: que lo oculto no
 * salga, que una ficha sin dirección real llegue sin acceso, y que la dirección
 * que llega sea siempre una a la que se pueda mandar a una persona.
 */

let base: TestDatabase;
let actorId: string;
let redactora: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('catalogo-ecosistema');
  await base.seed();
  actorId = await actorDeMigracion(base.prisma);

  const entidadId = await entidadPrincipal(base.prisma);
  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  redactora = await crearPersonaConCuenta(base.prisma, { givenName: 'Redactora', familyName: 'De Prensa' });
  await nombrar(base.prisma, {
    userId: redactora.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

describe('lo que el catálogo publica', () => {
  it('trae las fichas publicadas, en el orden que la organización decidió', async () => {
    const fichas = await catalogoPublicado();
    expect(fichas.map((f) => f.code)).toEqual(['CIAN', 'CENI', 'NEUROPLAN', 'ADIA', 'NEXO']);
  });

  it('no trae una ficha oculta, y ocultarla no la borra', async () => {
    await base.prisma.ecosystemLink.update({
      where: { code: 'NEXO' },
      data: { operationalStatus: 'HIDDEN', publishedAt: null, updatedByActorId: actorId },
    });

    const fichas = await catalogoPublicado();
    expect(fichas.map((f) => f.code)).not.toContain('NEXO');

    const sigueExistiendo = await base.prisma.ecosystemLink.findUnique({ where: { code: 'NEXO' } });
    expect(sigueExistiendo).not.toBeNull();
    expect(sigueExistiendo?.summary).not.toBe('');

    await base.prisma.ecosystemLink.update({
      where: { code: 'NEXO' },
      data: { operationalStatus: 'ACTIVE', publishedAt: new Date(), updatedByActorId: actorId },
    });
  });

  it('una ficha sin dirección configurada llega sin acceso: no hay botón que enseñar', async () => {
    const fichas = await catalogoPublicado();
    for (const ficha of fichas) {
      expect(ficha.accesoUrl).toBeNull();
      expect(ficha.summary.length).toBeGreaterThan(20);
    }
  });

  it('la dirección que llega es siempre absoluta y cifrada', async () => {
    await base.prisma.ecosystemLink.update({
      where: { code: 'CIAN' },
      data: { externalUrl: 'https://cian.ejemplo.mx/', updatedByActorId: actorId },
    });

    const fichas = await catalogoPublicado();
    const cian = fichas.find((f) => f.code === 'CIAN');
    expect(cian?.accesoUrl).toBe('https://cian.ejemplo.mx/');
    for (const ficha of fichas) {
      if (ficha.accesoUrl !== null) expect(ficha.accesoUrl.startsWith('https://')).toBe(true);
    }
  });

  it('no lleva ningún dato de la persona: la ficha es la misma para todo el mundo', async () => {
    const fichas = await catalogoPublicado();
    const serializado = JSON.stringify(fichas);
    for (const rastro of ['personId', 'membership', 'userId', 'email', 'token', 'sessionId']) {
      expect(serializado).not.toContain(rastro);
    }
    expect(Object.keys(fichas[0] ?? {}).sort()).toEqual([
      'accesoUrl',
      'audienceText',
      'code',
      'modulo',
      'name',
      'responsable',
      'summary',
    ]);
  });
});

describe('las direcciones que el gestor de contenidos no puede ocupar', () => {
  it('rechaza publicar una página en una dirección que sirve el propio código', async () => {
    const actor = await contextoDe(base.prisma, redactora);

    const resultado = await createPage(actor, {
      slug: 'herramientas',
      kind: 'PAGE',
      title: 'Herramientas',
      summary: 'Una página que nunca se vería.',
      bodyMarkdown: 'Contenido.',
      accessLevel: 'PUBLIC',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('CONFLICT');

    const enLaBase = await base.prisma.contentPage.findUnique({ where: { slug: 'herramientas' } });
    expect(enLaBase).toBeNull();
  });

  it('sí admite una dirección que el código no sirve', async () => {
    const actor = await contextoDe(base.prisma, redactora);

    const resultado = await createPage(actor, {
      slug: 'que-es-fuerza-indigo',
      kind: 'PAGE',
      title: 'Qué es Fuerza Índigo',
      summary: 'Quiénes somos y qué defendemos.',
      bodyMarkdown: 'Contenido.',
      accessLevel: 'PUBLIC',
    });

    expect(resultado.ok).toBe(true);
  });
});
