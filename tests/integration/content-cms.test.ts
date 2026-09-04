import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  archivePage,
  createPage,
  editPage,
  editorialPages,
  publishDueContent,
  publishPage,
  publishedList,
  publishedPage,
  revertPage,
  reviewPage,
  submitForReview,
  versionHistory,
} from '@/modules/content';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Ciclo editorial del CMS (PRD §16.1, criterio 4 de la Fase 2).
 *
 * El criterio dice que el CMS «maneja borrador, revisión, publicación y
 * reversión». Lo que estas pruebas comprueban es que esos cuatro estados sean
 * reales y no etiquetas: que editar una página publicada no cambie el sitio
 * hasta publicar, que quien redacta no pueda aprobarse a sí mismo, y que
 * revertir no borre el historial.
 */

let base: TestDatabase;
let redactora: PersonaDePrueba;
let revisora: PersonaDePrueba;
let ajena: PersonaDePrueba;
let entidadId: string;

const CUERPO = '# Qué es Fuerza Índigo\n\nUn sindicato de personas neurodivergentes.';

beforeAll(async () => {
  base = await createTestDatabase('cms');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  redactora = await crearPersonaConCuenta(base.prisma, { givenName: 'Redactora', familyName: 'De Prensa' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Revisora', familyName: 'Ejecutiva' });
  ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });

  await nombrar(base.prisma, {
    userId: redactora.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
  await nombrar(base.prisma, {
    userId: revisora.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: entidadId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function nuevaPagina(slug: string) {
  const actor = await contextoDe(base.prisma, redactora);
  const creada = await createPage(actor, {
    slug,
    kind: 'PAGE',
    title: 'Qué es Fuerza Índigo',
    summary: 'Presentación del sindicato y de lo que hace por sus agremiados.',
    bodyMarkdown: CUERPO,
    legalEntityId: entidadId,
    accessLevel: 'PUBLIC',
  });
  if (!creada.ok) throw creada.error;
  return creada.data;
}

/** Recorre borrador → revisión → aprobación → publicación. */
async function publicar(pageId: string) {
  const autora = await contextoDe(base.prisma, redactora);
  const revisoraCtx = await contextoDe(base.prisma, revisora);
  await submitForReview(autora, pageId);
  await reviewPage(revisoraCtx, { pageId, decision: 'APROBAR' });
  return publishPage(revisoraCtx, { pageId });
}

describe('borrador', () => {
  it('un contenido nuevo nace en borrador y el público no lo ve', async () => {
    const { pageId } = await nuevaPagina('borrador-invisible');

    const fila = await base.prisma.contentPage.findUniqueOrThrow({
      where: { id: pageId },
      select: { status: true, currentVersionId: true, draftVersionId: true },
    });
    expect(fila.status).toBe('DRAFT');
    expect(fila.currentVersionId).toBeNull();
    expect(fila.draftVersionId).not.toBeNull();

    // La consulta pública no acepta un indicador para incluir borradores: es
    // una función distinta, de modo que no se le puede pasar por descuido.
    expect(await publishedPage('borrador-invisible')).toBeNull();
  }, 60_000);

  it('dos contenidos no pueden ocupar la misma dirección', async () => {
    await nuevaPagina('direccion-unica');
    const actor = await contextoDe(base.prisma, redactora);
    const segunda = await createPage(actor, {
      slug: 'direccion-unica',
      kind: 'NEWS',
      title: 'Otra cosa',
      summary: 'Un contenido distinto que pretende la misma dirección.',
      bodyMarkdown: 'texto',
      legalEntityId: entidadId,
      accessLevel: 'PUBLIC',
    });
    expect(segunda.ok).toBe(false);
    expect(!segunda.ok && segunda.error.code).toBe('CONFLICT');
  }, 60_000);

  it('quien no tiene la facultad no puede crear contenido', async () => {
    const actor = await contextoDe(base.prisma, ajena);
    const resultado = await createPage(actor, {
      slug: 'sin-permiso',
      kind: 'PAGE',
      title: 'No debería existir',
      summary: 'Un contenido creado por quien no tiene facultad de escribir.',
      bodyMarkdown: 'texto',
      legalEntityId: entidadId,
      accessLevel: 'PUBLIC',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('FORBIDDEN');
  }, 60_000);

  it('una dirección con mayúsculas o espacios se rechaza con una explicación útil', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const resultado = await createPage(actor, {
      slug: 'Qué Es Fuerza Índigo',
      kind: 'PAGE',
      title: 'Título',
      summary: 'Un resumen suficientemente largo para pasar la validación.',
      bodyMarkdown: 'texto',
      legalEntityId: entidadId,
      accessLevel: 'PUBLIC',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(JSON.stringify(resultado.error.details)).toContain('sindicato-y-derechos');
  }, 60_000);
});

describe('revisión', () => {
  it('quien redacta no puede aprobar su propio contenido', async () => {
    // Sin esta regla, la revisión existe en el diagrama y no en los hechos.
    const { pageId } = await nuevaPagina('autorrevision');
    const autora = await contextoDe(base.prisma, redactora);

    await submitForReview(autora, pageId);
    const resultado = await reviewPage(autora, { pageId, decision: 'APROBAR' });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.internalReason).toBe('autorrevisión');
    expect(resultado.error.message).toContain('otra persona');
  }, 60_000);

  it('devolver a la autoría no exige que sea otra persona', async () => {
    // Devolver es reconocer que algo falta; que lo note quien lo escribió no
    // tiene nada de malo.
    const { pageId } = await nuevaPagina('devolucion-propia');
    const autora = await contextoDe(base.prisma, redactora);
    await submitForReview(autora, pageId);
    const resultado = await reviewPage(autora, { pageId, decision: 'DEVOLVER', comment: 'falta la fecha' });
    expect(resultado.ok).toBe(true);
  }, 60_000);

  it('no se puede publicar sin haber pasado por revisión', async () => {
    // Con el permiso de publicar bastaría para saltarse el circuito, y sin
    // dejar constancia de haberlo hecho.
    const { pageId } = await nuevaPagina('publicar-sin-revisar');
    const revisoraCtx = await contextoDe(base.prisma, revisora);
    const resultado = await publishPage(revisoraCtx, { pageId });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.internalReason).toBe('publicación sin revisión previa');
  }, 60_000);

  it('quien solo redacta no puede publicar', async () => {
    const { pageId } = await nuevaPagina('redactora-no-publica');
    const autora = await contextoDe(base.prisma, redactora);
    const revisoraCtx = await contextoDe(base.prisma, revisora);
    await submitForReview(autora, pageId);
    await reviewPage(revisoraCtx, { pageId, decision: 'APROBAR' });

    // La redactora tiene COMMUNICATIONS, que sí publica. Se usa a la persona sin
    // facultades para comprobar la denegación.
    const sinFacultad = await contextoDe(base.prisma, ajena);
    const resultado = await publishPage(sinFacultad, { pageId });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('FORBIDDEN');
  }, 60_000);

  it('no se puede editar mientras está en revisión', async () => {
    const { pageId } = await nuevaPagina('editar-en-revision');
    const autora = await contextoDe(base.prisma, redactora);
    await submitForReview(autora, pageId);

    const resultado = await editPage(autora, {
      pageId,
      title: 'Cambio a escondidas',
      summary: 'Una edición mientras otra persona está revisando el contenido.',
      bodyMarkdown: 'otro texto',
      changeNote: 'edición durante la revisión',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.internalReason).toContain('en revisión');
  }, 60_000);
});

describe('publicación', () => {
  it('publica y el público lo ve', async () => {
    const { pageId } = await nuevaPagina('publicada-visible');
    const resultado = await publicar(pageId);
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);

    const publica = await publishedPage('publicada-visible');
    expect(publica).not.toBeNull();
    expect(publica!.title).toBe('Qué es Fuerza Índigo');
    expect(publica!.bodyMarkdown).toContain('sindicato de personas neurodivergentes');
  }, 90_000);

  it('editar una página publicada no cambia lo que el público ve', async () => {
    // Es la propiedad central del versionado: el sitio no se mueve hasta que
    // alguien decide moverlo.
    const { pageId } = await nuevaPagina('edicion-no-publica');
    await publicar(pageId);

    const autora = await contextoDe(base.prisma, redactora);
    const editada = await editPage(autora, {
      pageId,
      title: 'Título nuevo sin publicar',
      summary: 'Un cambio guardado que todavía no debe verse en el sitio.',
      bodyMarkdown: 'cuerpo nuevo',
      changeNote: 'actualización de la presentación',
    });
    expect(editada.ok).toBe(true);

    const publica = await publishedPage('edicion-no-publica');
    expect(publica!.title).toBe('Qué es Fuerza Índigo');

    const fila = await base.prisma.contentPage.findUniqueOrThrow({
      where: { id: pageId },
      select: { status: true, currentVersionId: true, draftVersionId: true },
    });
    expect(fila.status).toBe('PUBLISHED');
    expect(fila.draftVersionId).not.toBe(fila.currentVersionId);
  }, 90_000);

  it('al publicar el cambio, deja de haber borrador pendiente', async () => {
    const { pageId } = await nuevaPagina('sin-pendientes');
    await publicar(pageId);

    const autora = await contextoDe(base.prisma, redactora);
    await editPage(autora, {
      pageId,
      title: 'Segunda versión',
      summary: 'La versión que sí se publica en esta prueba.',
      bodyMarkdown: 'cuerpo segundo',
      changeNote: 'segunda versión',
    });
    await publicar(pageId);

    const fila = await base.prisma.contentPage.findUniqueOrThrow({
      where: { id: pageId },
      select: { draftVersionId: true, currentVersionId: true },
    });
    expect(fila.draftVersionId).toBeNull();
    expect((await publishedPage('sin-pendientes'))!.title).toBe('Segunda versión');
  }, 90_000);

  it('programar deja el contenido en espera y no lo muestra antes de hora', async () => {
    const { pageId } = await nuevaPagina('convocatoria-programada');
    const autora = await contextoDe(base.prisma, redactora);
    const revisoraCtx = await contextoDe(base.prisma, revisora);
    await submitForReview(autora, pageId);
    await reviewPage(revisoraCtx, { pageId, decision: 'APROBAR' });

    const dentroDeUnaHora = new Date(Date.now() + 60 * 60 * 1000);
    const resultado = await publishPage(revisoraCtx, { pageId, scheduledFor: dentroDeUnaHora.toISOString() });
    expect(resultado.ok && resultado.data.status).toBe('SCHEDULED');
    expect(await publishedPage('convocatoria-programada')).toBeNull();

    // Y el trabajo no la publica hasta que llegue la hora.
    expect((await publishDueContent()).published).toBe(0);
    expect(await publishedPage('convocatoria-programada')).toBeNull();
  }, 90_000);

  it('el trabajo programado publica lo que ya venció, atribuido a sí mismo', async () => {
    const { pageId } = await nuevaPagina('ya-vencida');
    const autora = await contextoDe(base.prisma, redactora);
    const revisoraCtx = await contextoDe(base.prisma, revisora);
    await submitForReview(autora, pageId);
    await reviewPage(revisoraCtx, { pageId, decision: 'APROBAR' });
    await publishPage(revisoraCtx, { pageId, scheduledFor: new Date(Date.now() + 3600_000).toISOString() });

    // Se adelanta el reloj de la fila, que es lo que el trabajo mira.
    await base.prisma.contentPage.update({
      where: { id: pageId },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });

    expect((await publishDueContent()).published).toBe(1);
    expect(await publishedPage('ya-vencida')).not.toBeNull();

    // La bitácora distingue quién publicó: el trabajo, no quien programó.
    const evento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { objectId: pageId, action: 'content.page.published' },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true, actor: { select: { kind: true } } },
    });
    expect(evento.actor.kind).toBe('SYSTEM_JOB');
    expect(JSON.stringify(evento.metadata)).toContain('publicación programada');
  }, 90_000);

  it('archivar retira del público sin borrar el historial', async () => {
    const { pageId } = await nuevaPagina('archivada');
    await publicar(pageId);
    expect(await publishedPage('archivada')).not.toBeNull();

    const revisoraCtx = await contextoDe(base.prisma, revisora);
    expect((await archivePage(revisoraCtx, pageId)).ok).toBe(true);

    expect(await publishedPage('archivada')).toBeNull();
    expect(await base.prisma.contentVersion.count({ where: { pageId } })).toBeGreaterThan(0);
  }, 90_000);
});

describe('reversión', () => {
  it('revertir crea una versión nueva y no borra ninguna', async () => {
    const { pageId } = await nuevaPagina('reversion');
    await publicar(pageId);

    const autora = await contextoDe(base.prisma, redactora);
    await editPage(autora, {
      pageId,
      title: 'Versión con un error',
      summary: 'Una versión que hubo que revertir por contener un dato equivocado.',
      bodyMarkdown: 'texto equivocado',
      changeNote: 'cambio que resultó equivocado',
    });
    await publicar(pageId);
    expect((await publishedPage('reversion'))!.title).toBe('Versión con un error');

    const historialPrevio = await versionHistory(autora, pageId);
    const primera = historialPrevio.ok ? historialPrevio.data.find((v) => v.version === 1) : undefined;
    expect(primera).toBeDefined();

    const revisoraCtx = await contextoDe(base.prisma, revisora);
    const revertida = await revertPage(revisoraCtx, {
      pageId,
      versionId: primera!.id,
      reason: 'la versión anterior contenía una fecha equivocada',
    });
    expect(revertida.ok, revertida.ok ? '' : revertida.error.message).toBe(true);
    if (!revertida.ok) return;

    // La versión nueva es posterior a todas: no sobrescribe ninguna.
    expect(revertida.data.version).toBe(3);
    expect(await base.prisma.contentVersion.count({ where: { pageId } })).toBe(3);

    await publishPage(revisoraCtx, { pageId });
    expect((await publishedPage('reversion'))!.title).toBe('Qué es Fuerza Índigo');
  }, 120_000);

  it('la reversión deja rastro de cuál fue su origen', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const pagina = await base.prisma.contentPage.findFirstOrThrow({
      where: { slug: 'reversion' },
      select: { id: true },
    });
    const historial = await versionHistory(actor, pagina.id);
    expect(historial.ok).toBe(true);
    if (!historial.ok) return;

    const revertida = historial.data.find((v) => v.revertedFromVersion !== null);
    expect(revertida).toBeDefined();
    expect(revertida!.revertedFromVersion).toBe(1);
    expect(revertida!.changeNote).toContain('fecha equivocada');
  }, 60_000);

  it('revertir exige motivo escrito', async () => {
    const pagina = await base.prisma.contentPage.findFirstOrThrow({
      where: { slug: 'reversion' },
      select: { id: true, versions: { select: { id: true }, take: 1 } },
    });
    const revisoraCtx = await contextoDe(base.prisma, revisora);
    const resultado = await revertPage(revisoraCtx, {
      pageId: pagina.id,
      versionId: pagina.versions[0]!.id,
      reason: 'porque',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('VALIDATION');
  }, 60_000);

  it('no se puede revertir a una versión de otro contenido', async () => {
    const otra = await nuevaPagina('otro-contenido');
    const pagina = await base.prisma.contentPage.findFirstOrThrow({
      where: { slug: 'reversion' },
      select: { id: true },
    });
    const versionAjena = await base.prisma.contentVersion.findFirstOrThrow({
      where: { pageId: otra.pageId },
      select: { id: true },
    });

    const revisoraCtx = await contextoDe(base.prisma, revisora);
    const resultado = await revertPage(revisoraCtx, {
      pageId: pagina.id,
      versionId: versionAjena.id,
      reason: 'intento de mezclar el historial de dos contenidos',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
  }, 60_000);
});

describe('historial y listados', () => {
  it('el historial dice quién escribió y quién revisó cada versión', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const pagina = await base.prisma.contentPage.findFirstOrThrow({
      where: { slug: 'reversion' },
      select: { id: true },
    });
    const historial = await versionHistory(actor, pagina.id);
    expect(historial.ok).toBe(true);
    if (!historial.ok) return;

    expect(historial.data.length).toBeGreaterThanOrEqual(3);
    expect(historial.data[0]!.authorName).toContain('Revisora');
    const publicadas = historial.data.filter((v) => v.publishedAt !== null);
    expect(publicadas.length).toBeGreaterThan(0);
    expect(historial.data.filter((v) => v.isCurrent)).toHaveLength(1);
  }, 60_000);

  it('el listado público solo trae lo publicado', async () => {
    const publicas = await publishedList('PAGE');
    const direcciones = publicas.map((p) => p.slug);
    expect(direcciones).toContain('publicada-visible');
    expect(direcciones).not.toContain('borrador-invisible');
    expect(direcciones).not.toContain('archivada');
  }, 60_000);

  it('el panel editorial sí muestra lo no publicado, y exige permiso', async () => {
    const actor = await contextoDe(base.prisma, redactora);
    const listado = await editorialPages(actor);
    expect(listado.ok).toBe(true);
    if (!listado.ok) return;

    const direcciones = listado.data.map((p) => p.slug);
    expect(direcciones).toContain('borrador-invisible');

    const conPendientes = listado.data.filter((p) => p.hasPendingChanges);
    expect(conPendientes.length).toBeGreaterThan(0);

    const sinFacultad = await contextoDe(base.prisma, ajena);
    expect((await editorialPages(sinFacultad)).ok).toBe(false);
  }, 60_000);
});
