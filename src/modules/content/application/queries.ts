import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { ContentKind } from '@prisma-client/enums';

/**
 * Lectura de contenidos.
 *
 * Hay dos caminos distintos y no deben confundirse. `publishedPage` es la puerta
 * del sitio público: **solo** devuelve lo publicado, sin actor y sin permisos, y
 * por eso no puede filtrar de más por descuido. `editorialPages` es la del
 * panel: devuelve borradores y archivados, y exige permiso.
 *
 * Tenerlas separadas evita el error clásico de este tipo de módulo, que es una
 * sola consulta con una bandera `incluirBorradores` que alguien acaba pasando en
 * verdadero desde la ruta pública.
 */

export interface PublishedPage {
  readonly slug: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly bodyMarkdown: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly publishedAt: Date | null;
  readonly territorialUnitName: string | null;
}

/** Una página publicada, por su dirección. No existe si no está publicada. */
export async function publishedPage(slug: string): Promise<PublishedPage | null> {
  const pagina = await db().contentPage.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
      accessLevel: 'PUBLIC',
      archivedAt: null,
      currentVersionId: { not: null },
    },
    select: {
      slug: true,
      kind: true,
      publishedAt: true,
      territorialUnit: { select: { name: true } },
      currentVersion: {
        select: {
          title: true,
          summary: true,
          bodyMarkdown: true,
          seoTitle: true,
          seoDescription: true,
        },
      },
    },
  });

  if (pagina === null || pagina.currentVersion === null) return null;

  return {
    slug: pagina.slug,
    kind: pagina.kind,
    title: pagina.currentVersion.title,
    summary: pagina.currentVersion.summary,
    bodyMarkdown: pagina.currentVersion.bodyMarkdown,
    seoTitle: pagina.currentVersion.seoTitle,
    seoDescription: pagina.currentVersion.seoDescription,
    publishedAt: pagina.publishedAt,
    territorialUnitName: pagina.territorialUnit?.name ?? null,
  };
}

export interface PublishedSummary {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: Date | null;
  readonly territorialUnitName: string | null;
}

/** Listado público de un tipo de contenido, del más reciente al más antiguo. */
export async function publishedList(
  kind: ContentKind,
  options: { limit?: number; territorialUnitId?: string } = {},
): Promise<PublishedSummary[]> {
  const filas = await db().contentPage.findMany({
    where: {
      kind,
      status: 'PUBLISHED',
      accessLevel: 'PUBLIC',
      archivedAt: null,
      currentVersionId: { not: null },
      ...(options.territorialUnitId === undefined ? {} : { territorialUnitId: options.territorialUnitId }),
    },
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    take: Math.min(options.limit ?? 50, 100),
    select: {
      slug: true,
      publishedAt: true,
      territorialUnit: { select: { name: true } },
      currentVersion: { select: { title: true, summary: true } },
    },
  });

  return filas
    .filter((fila) => fila.currentVersion !== null)
    .map((fila) => ({
      slug: fila.slug,
      title: fila.currentVersion!.title,
      summary: fila.currentVersion!.summary,
      publishedAt: fila.publishedAt,
      territorialUnitName: fila.territorialUnit?.name ?? null,
    }));
}

export interface EditorialPage {
  readonly id: string;
  readonly slug: string;
  readonly kind: string;
  readonly status: string;
  readonly title: string;
  readonly hasPendingChanges: boolean;
  readonly publishedAt: Date | null;
  readonly scheduledFor: Date | null;
  readonly updatedAt: Date;
  readonly legalEntity: string | null;
}

/** Listado del panel editorial. Incluye lo no publicado y exige permiso. */
export async function editorialPages(
  actor: ActorContext,
  filter: { status?: string; kind?: string } = {},
): Promise<UseCaseResult<EditorialPage[]>> {
  const decision = can(actor, 'content.page.read', { kind: 'ContentPage' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const alcance =
    actor.actorKind === 'ROOT_SUPERADMIN' || actor.legalEntityScope.length === 0
      ? undefined
      : actor.legalEntityScope;

  const filas = await db().contentPage.findMany({
    where: {
      ...(filter.status === undefined ? {} : { status: filter.status as never }),
      ...(filter.kind === undefined ? {} : { kind: filter.kind as never }),
      // El alcance por entidad se aplica en la consulta, no al pintar.
      ...(alcance === undefined ? {} : { OR: [{ legalEntityId: { in: [...alcance] } }, { legalEntityId: null }] }),
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      slug: true,
      kind: true,
      status: true,
      publishedAt: true,
      scheduledFor: true,
      updatedAt: true,
      currentVersionId: true,
      draftVersionId: true,
      legalEntity: { select: { shortName: true } },
      draftVersion: { select: { title: true } },
      currentVersion: { select: { title: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      slug: fila.slug,
      kind: fila.kind,
      status: fila.status,
      title: fila.draftVersion?.title ?? fila.currentVersion?.title ?? '(sin título)',
      hasPendingChanges: fila.draftVersionId !== null && fila.draftVersionId !== fila.currentVersionId,
      publishedAt: fila.publishedAt,
      scheduledFor: fila.scheduledFor,
      updatedAt: fila.updatedAt,
      legalEntity: fila.legalEntity?.shortName ?? null,
    })),
  );
}

export interface VersionHistoryEntry {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly changeNote: string | null;
  readonly authorName: string;
  readonly reviewerName: string | null;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly isCurrent: boolean;
  readonly revertedFromVersion: number | null;
}

/** Historial completo de un contenido, con quién hizo cada cosa. */
export async function versionHistory(
  actor: ActorContext,
  pageId: string,
): Promise<UseCaseResult<VersionHistoryEntry[]>> {
  const decision = can(actor, 'content.page.read', { kind: 'ContentPage', id: pageId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const pagina = await db().contentPage.findUnique({
    where: { id: pageId },
    select: { currentVersionId: true },
  });
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const versiones = await db().contentVersion.findMany({
    where: { pageId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      changeNote: true,
      createdAt: true,
      publishedAt: true,
      author: { select: { person: { select: { givenName: true, familyName: true } } } },
      reviewedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
      revertedFromVersion: { select: { version: true } },
    },
  });

  return ok(
    versiones.map((version) => ({
      id: version.id,
      version: version.version,
      title: version.title,
      changeNote: version.changeNote,
      authorName: `${version.author.person.givenName} ${version.author.person.familyName}`,
      reviewerName:
        version.reviewedBy === null
          ? null
          : `${version.reviewedBy.person.givenName} ${version.reviewedBy.person.familyName}`,
      createdAt: version.createdAt,
      publishedAt: version.publishedAt,
      isCurrent: version.id === pagina.currentVersionId,
      revertedFromVersion: version.revertedFromVersion?.version ?? null,
    })),
  );
}

export interface SearchHit {
  readonly slug: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: Date | null;
}

/**
 * Buscador público (F2-UI-011).
 *
 * Busca **solo** en lo publicado y público. La búsqueda es el sitio donde un
 * filtro de visibilidad mal puesto se nota más tarde: un borrador que aparece
 * en resultados revela tanto como una página abierta.
 *
 * Es búsqueda léxica sobre título, resumen y cuerpo, con `ILIKE`. La búsqueda
 * semántica con vectores es alcance de la Fase 10, donde vive el índice; traerla
 * aquí obligaría a mantener dos índices y a decidir sin datos cuál gana.
 */
export async function searchPublished(query: string, limit = 30): Promise<SearchHit[]> {
  const termino = query.trim();
  // Menos de dos caracteres devuelve todo, que no es buscar.
  if (termino.length < 2) return [];

  const filas = await db().contentPage.findMany({
    where: {
      status: 'PUBLISHED',
      accessLevel: 'PUBLIC',
      archivedAt: null,
      currentVersionId: { not: null },
      currentVersion: {
        OR: [
          { title: { contains: termino, mode: 'insensitive' } },
          { summary: { contains: termino, mode: 'insensitive' } },
          { bodyMarkdown: { contains: termino, mode: 'insensitive' } },
        ],
      },
    },
    orderBy: [{ publishedAt: 'desc' }],
    take: Math.min(limit, 50),
    select: {
      slug: true,
      kind: true,
      publishedAt: true,
      currentVersion: { select: { title: true, summary: true } },
    },
  });

  return filas
    .filter((fila) => fila.currentVersion !== null)
    .map((fila) => ({
      slug: fila.slug,
      kind: fila.kind,
      title: fila.currentVersion!.title,
      summary: fila.currentVersion!.summary,
      publishedAt: fila.publishedAt,
    }));
}

export interface SitemapEntry {
  readonly slug: string;
  readonly publishedAt: Date | null;
}

/**
 * Direcciones publicadas y visibles para el mapa del sitio (F2-OPS-001).
 *
 * Solo `PUBLIC`: una página de acceso restringido en el mapa del sitio le
 * anuncia a todo el mundo que existe, y a quien la abra le responde una
 * denegación. Devuelve la dirección y la fecha, nada más: el mapa no necesita
 * el cuerpo y traerlo sería mover el sitio entero en cada rastreo.
 */
export async function publishedSitemapEntries(): Promise<SitemapEntry[]> {
  const filas = await db().contentPage.findMany({
    where: {
      status: 'PUBLISHED',
      accessLevel: 'PUBLIC',
      archivedAt: null,
      currentVersionId: { not: null },
    },
    orderBy: [{ slug: 'asc' }],
    select: { slug: true, publishedAt: true },
  });

  return filas.map((fila) => ({ slug: fila.slug, publishedAt: fila.publishedAt }));
}
