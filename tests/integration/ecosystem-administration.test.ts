import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import { uploadFile } from '@/platform/files/file-service';
import {
  adjuntarLogotipo,
  cambiarVisibilidad,
  catalogoCompleto,
  catalogoPublicado,
  editarFicha,
  logotipoPublicado,
} from '@/modules/ecosystem';

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
let secretaria: PersonaDePrueba;
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

  // Sabe subir archivos y **no** administra el catálogo. Sin ella, la
  // comprobación de facultad de la carga del logotipo pasaría por lo que hace
  // la puerta de archivos y no por lo que hace este módulo.
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Preside' });
  await nombrar(base.prisma, {
    userId: secretaria.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
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

describe('el logotipo de la ficha', () => {
  // Un PNG mínimo válido: cabecera, un píxel y su final. Sirve porque la carga
  // comprueba que el contenido corresponda con el tipo declarado, y una cadena
  // cualquiera con nombre .png no pasaría.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('quien administra puede cargarlo, y sale por la ruta pública', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await adjuntarLogotipo(actor, {
      linkId: fichaId,
      originalFileName: 'cian.png',
      mimeType: 'image/png',
      content: new Uint8Array(PNG),
    });
    expect(resultado.ok).toBe(true);

    const servido = await logotipoPublicado('CIAN');
    expect(servido).not.toBeNull();
    expect(servido?.mimeType).toBe('image/png');
    expect(Buffer.from(servido!.content)).toEqual(PNG);
  });

  it('quien sabe subir archivos pero no administra el catálogo tampoco puede cargarlo', async () => {
    // La secretaría **sí** tiene `files.file.upload`. Si esta prueba usara a
    // quien no puede subir nada, la puerta de archivos la detendría antes y
    // esta comprobación pasaría sin ejercitar la facultad del catálogo.
    const actor = await contextoDe(base.prisma, secretaria);

    const resultado = await adjuntarLogotipo(actor, {
      linkId: fichaId,
      originalFileName: 'otro.png',
      mimeType: 'image/png',
      content: new Uint8Array(PNG),
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');

    const ficha = await base.prisma.ecosystemLink.findUniqueOrThrow({
      where: { id: fichaId },
      select: { logoFileId: true },
    });
    expect(ficha.logoFileId).not.toBeNull();
  });

  it('rechaza un SVG, que es un documento que puede llevar guiones dentro', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await adjuntarLogotipo(actor, {
      linkId: fichaId,
      originalFileName: 'logo.svg',
      mimeType: 'image/svg+xml',
      content: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('VALIDATION');
  });

  it('un logotipo es una imagen, y solo una imagen', async () => {
    // Un PDF de verdad, con su cabecera: la puerta de archivos lo admitiría sin
    // problema, porque para ella es un formato válido. Lo que lo detiene es la
    // lista de formatos de este módulo, y sin esta prueba esa lista no la
    // ejercería nadie.
    const actor = await contextoDe(base.prisma, comunicacion);

    const resultado = await adjuntarLogotipo(actor, {
      linkId: fichaId,
      originalFileName: 'folleto.pdf',
      mimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\n%%EOF\n'),
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.details?.['logotipo']).toBeDefined();
  });

  it('una ficha retirada de la vista se lleva su logotipo con ella', async () => {
    const actor = await contextoDe(base.prisma, comunicacion);

    await adjuntarLogotipo(actor, {
      linkId: fichaId,
      originalFileName: 'cian.png',
      mimeType: 'image/png',
      content: new Uint8Array(PNG),
    });
    expect(await logotipoPublicado('CIAN')).not.toBeNull();

    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: false });
    expect(await logotipoPublicado('CIAN')).toBeNull();

    await cambiarVisibilidad(actor, { linkId: fichaId, publicar: true });
    expect(await logotipoPublicado('CIAN')).not.toBeNull();
  });

  it('la ruta no entrega un archivo que no sea el logotipo de una ficha', async () => {
    // No hay forma de pedir «el archivo tal»: la función recibe el código de la
    // ficha. Un código que no existe no entrega nada, y tampoco dice por qué.
    expect(await logotipoPublicado('NO_EXISTE')).toBeNull();
    expect(await logotipoPublicado('')).toBeNull();

    // Y si alguien apuntara la columna a un archivo que no es público, se
    // detiene igual: la clasificación se comprueba **al servir**.
    //
    // El archivo se crea aquí en vez de buscar uno que quizá exista: una
    // comprobación dentro de un `if` que a veces no se cumple es una prueba que
    // a veces no prueba nada, y no se nota.
    const actor = await contextoDe(base.prisma, comunicacion);
    const interno = await uploadFile(actor, {
      legalEntityId: actor.legalEntityScope[0]!,
      classification: 'INTERNAL',
      contextKind: 'CONTENT',
      originalFileName: 'interno.png',
      mimeType: 'image/png',
      content: new Uint8Array(PNG),
    });
    expect(interno.ok).toBe(true);
    if (!interno.ok) return;

    const original = await base.prisma.ecosystemLink.findUniqueOrThrow({
      where: { code: 'CIAN' },
      select: { logoFileId: true },
    });

    await base.prisma.$executeRawUnsafe(
      `UPDATE "ecosystem_link" SET "logoFileId" = '${interno.data.fileObjectId}' WHERE code = 'CIAN'`,
    );
    expect(await logotipoPublicado('CIAN')).toBeNull();

    await base.prisma.$executeRawUnsafe(
      `UPDATE "ecosystem_link" SET "logoFileId" = '${original.logoFileId}' WHERE code = 'CIAN'`,
    );
  });
});
