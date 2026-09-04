import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPage,
  createRedirect,
  deleteRedirect,
  listRedirects,
  publishPage,
  publishedLegalDocuments,
  resolveRedirect,
  reviewPage,
  submitForReview,
} from '@/modules/content';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Redirecciones y páginas legales por entidad (F2-CMS-003).
 *
 * Las dos cosas responden a la misma promesa: una dirección que alguien ya
 * escribió en un volante tiene que seguir llevando a donde debe, y un texto
 * legal tiene que decir de qué persona moral es.
 */

let base: TestDatabase;
let redactora: PersonaDePrueba;
let revisora: PersonaDePrueba;
let redactoraDeAlianza: PersonaDePrueba;
let revisoraDeAlianza: PersonaDePrueba;
let sinFacultades: PersonaDePrueba;
let fuerzaId: string;
let alianzaId: string;

beforeAll(async () => {
  base = await createTestDatabase('redirects');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  redactora = await crearPersonaConCuenta(base.prisma, { givenName: 'Redactora', familyName: 'De Prensa' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'Ejecutiva' });
  redactoraDeAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Redactora', familyName: 'De Alianza' });
  revisoraDeAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'De Alianza' });
  sinFacultades = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });

  await nombrar(base.prisma, {
    userId: redactora.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: revisora.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  // La otra entidad necesita su propio equipo: quien redacta para Fuerza Índigo
  // no puede escribir el texto legal de Alianza Índigo, y que no pueda es parte
  // de lo que estas pruebas comprueban.
  await nombrar(base.prisma, {
    userId: redactoraDeAlianza.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
  await nombrar(base.prisma, {
    userId: revisoraDeAlianza.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

beforeEach(async () => {
  await base.prisma.contentRedirect.deleteMany({});
});

/** Crea una página y la deja publicada, pasando por revisión como manda el ciclo. */
async function paginaPublicada(slug: string, legalEntityId?: string): Promise<string> {
  const deAlianza = legalEntityId === alianzaId;
  const autora = await contextoDe(base.prisma, deAlianza ? redactoraDeAlianza : redactora);
  const creada = await createPage(autora, {
    slug,
    kind: 'LEGAL',
    title: `Documento en ${slug}`,
    summary: 'Un texto legal de prueba con la extensión suficiente.',
    bodyMarkdown: `# Documento\n\nContenido de ${slug}.`,
    accessLevel: 'PUBLIC',
    ...(legalEntityId === undefined ? {} : { legalEntityId }),
  });
  if (!creada.ok) throw new Error(`no se pudo crear ${slug}: ${creada.error.message}`);

  const enviada = await submitForReview(autora, creada.data.pageId);
  if (!enviada.ok) throw new Error(enviada.error.message);

  const quienRevisa = await contextoDe(base.prisma, deAlianza ? revisoraDeAlianza : revisora, {
    reason: 'revisión de prueba',
  });
  const revisada = await reviewPage(quienRevisa, { pageId: creada.data.pageId, decision: 'APROBAR' });
  if (!revisada.ok) throw new Error(revisada.error.message);

  const publicada = await publishPage(quienRevisa, { pageId: creada.data.pageId });
  if (!publicada.ok) throw new Error(publicada.error.message);

  return creada.data.pageId;
}

describe('redirecciones', () => {
  it('lleva una dirección vieja a una página del gestor y cuenta el uso', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const pageId = await paginaPublicada('comunicado-nuevo');

    const creada = await createRedirect(actor, { fromSlug: 'comunicado-viejo', toPageId: pageId });
    expect(creada.ok).toBe(true);

    const destino = await resolveRedirect('comunicado-viejo');
    expect(destino).toEqual({ path: '/comunicado-nuevo', permanent: true });

    const listado = await listRedirects(actor);
    expect(listado.ok).toBe(true);
    if (listado.ok) expect(listado.data[0]?.hitCount).toBe(1);
  });

  it('un destino sin publicar no es destino', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const creada = await createPage(actor, {
      slug: 'todavia-borrador',
      kind: 'PAGE',
      title: 'Todavía en borrador',
      summary: 'Un borrador que nadie ha publicado, con resumen suficiente.',
      bodyMarkdown: 'Contenido.',
      accessLevel: 'PUBLIC',
      legalEntityId: fuerzaId,
    });
    if (!creada.ok) throw new Error(creada.error.message);

    await createRedirect(actor, { fromSlug: 'apunta-a-borrador', toPageId: creada.data.pageId });

    // Mandar ahí produciría un 404 detrás de una redirección, que es peor que
    // el 404 directo: la persona daría dos saltos para llegar a lo mismo.
    expect(await resolveRedirect('apunta-a-borrador')).toBeNull();
  });

  it('no deja crear una redirección desde una dirección que ocupa una página publicada', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    await paginaPublicada('esta-si-existe');

    const resultado = await createRedirect(actor, { fromSlug: 'esta-si-existe', toPath: '/noticias' });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('CONFLICT');
  });

  it('exige exactamente un destino: ni los dos ni ninguno', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const pageId = await paginaPublicada('destino-doble');

    const conLosDos = await createRedirect(actor, { fromSlug: 'con-los-dos', toPageId: pageId, toPath: '/noticias' });
    expect(conLosDos.ok).toBe(false);

    const sinNinguno = await createRedirect(actor, { fromSlug: 'sin-ninguno' });
    expect(sinNinguno.ok).toBe(false);
  });

  it('no admite dos redirecciones desde la misma dirección', async () => {
    const actor = await contextoDe(base.prisma, redactora);

    expect((await createRedirect(actor, { fromSlug: 'una-sola', toPath: '/noticias' })).ok).toBe(true);
    const segunda = await createRedirect(actor, { fromSlug: 'una-sola', toPath: '/buscar' });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('la redirección sobrevive al archivo de la página que la originó', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    await createRedirect(actor, { fromSlug: 'ruta-fija', toPath: '/noticias', permanent: false });

    expect(await resolveRedirect('ruta-fija')).toEqual({ path: '/noticias', permanent: false });
  });

  it('sin facultades no se crea, no se lista y no se borra', async () => {
    const ajena = await contextoDe(base.prisma, sinFacultades);

    expect((await createRedirect(ajena, { fromSlug: 'no-deberia', toPath: '/noticias' })).ok).toBe(false);
    expect((await listRedirects(ajena)).ok).toBe(false);
    expect((await deleteRedirect(ajena, { redirectId: '00000000-0000-7000-8000-000000000000' })).ok).toBe(false);
  });

  it('borrar una redirección deja la dirección vieja sin destino', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    await createRedirect(actor, { fromSlug: 'temporal', toPath: '/buscar' });

    const listado = await listRedirects(actor);
    if (!listado.ok || listado.data[0] === undefined) throw new Error('debía haber una');

    expect((await deleteRedirect(actor, { redirectId: listado.data[0].id })).ok).toBe(true);
    expect(await resolveRedirect('temporal')).toBeNull();
  });
});

describe('páginas legales por entidad', () => {
  it('quien redacta para una entidad no escribe el texto legal de la otra', async () => {
    const deFuerza = await contextoDe(base.prisma, redactora);
    const resultado = await createPage(deFuerza, {
      slug: 'legales/privacidad/alianza-indigo',
      kind: 'LEGAL',
      title: 'Aviso de privacidad de la otra entidad',
      summary: 'Un texto que este nombramiento no debería poder escribir.',
      bodyMarkdown: 'Contenido.',
      accessLevel: 'PUBLIC',
      legalEntityId: alianzaId,
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('devuelve una versión por entidad y las distingue', async () => {
    await paginaPublicada('legales/terminos/fuerza-indigo', fuerzaId);
    await paginaPublicada('legales/terminos/alianza-indigo', alianzaId);

    const versiones = await publishedLegalDocuments('terminos');
    expect(versiones).toHaveLength(2);
    expect(versiones.map((v) => v.legalEntityCode).sort()).toEqual(['ALIANZA_INDIGO', 'FUERZA_INDIGO']);
  });

  it('un texto común a las dos entidades se devuelve sin entidad', async () => {
    await paginaPublicada('legales/derechos-datos');

    const versiones = await publishedLegalDocuments('derechos-datos');
    expect(versiones).toHaveLength(1);
    expect(versiones[0]?.legalEntityCode).toBeNull();
  });

  it('una dirección que promete entidad y no la trae se descarta', async () => {
    // `legales/<documento>/<entidad>` sin entidad asignada mostraría un texto
    // de una sola entidad como si fuera común a las dos, que dice otra cosa.
    await paginaPublicada('legales/privacidad/fuerza-indigo');

    expect(await publishedLegalDocuments('privacidad')).toHaveLength(0);
  });

  it('un documento sin nada publicado devuelve la lista vacía, no un error', async () => {
    expect(await publishedLegalDocuments('inexistente')).toEqual([]);
  });

  it('una dirección malformada no llega a la base', async () => {
    expect(await publishedLegalDocuments('../../etc/passwd')).toEqual([]);
    expect(await publishedLegalDocuments('CON MAYÚSCULAS')).toEqual([]);
  });
});
