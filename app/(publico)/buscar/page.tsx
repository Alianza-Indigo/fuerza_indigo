import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, NoResults, PageShell } from '@/design-system/primitives';
import { searchPublished } from '@/modules/content';
import { formatDate } from '@/platform/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Encuentra páginas, noticias y comunicados del sitio público.',
  robots: { index: false, follow: true },
};

const TIPO: Record<string, string> = {
  PAGE: 'Página',
  NEWS: 'Noticia',
  STATEMENT: 'Comunicado',
  RESOURCE: 'Recurso',
  FAQ: 'Pregunta frecuente',
  CALL_FOR_APPLICATIONS: 'Convocatoria',
  LEGAL: 'Página legal',
  DELEGATION_PROFILE: 'Delegación',
  PROTOCOL: 'Protocolo',
};

/**
 * Buscador público.
 *
 * Es un formulario `GET`: la búsqueda vive en la dirección, de modo que se puede
 * compartir, guardar en marcadores y volver atrás. Funciona sin JavaScript.
 *
 * Distingue los dos estados vacíos que el PRD §5.4 obliga a separar: **aún no
 * has buscado** y **no hay resultados para lo que buscaste** no dicen lo mismo
 * ni ofrecen lo mismo.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termino = (q ?? '').trim();
  const resultados = termino.length >= 2 ? await searchPublished(termino) : [];

  return (
    <PageShell title="Buscar" description="En páginas, noticias y comunicados publicados." width="ancha">
      <form method="get" role="search" className="mb-8 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <label htmlFor="q" className="block font-medium">
            Qué buscas
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={termino}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-ink-inverse)]"
        >
          Buscar
        </button>
      </form>

      {termino.length === 0 ? (
        <EmptyState
          title="Escribe lo que buscas"
          description="Puedes buscar por tema, por el nombre de una delegación o por una palabra que recuerdes del texto."
        />
      ) : termino.length < 2 ? (
        <EmptyState
          title="Escribe al menos dos letras"
          description="Con una sola letra saldría casi todo el sitio, que no es buscar."
        />
      ) : resultados.length === 0 ? (
        <NoResults
          hint={`No encontramos nada publicado que contenga «${termino}». Puede que el contenido aún no exista o que se llame de otra forma.`}
          action={
            <Link href="/contacto" className="font-medium underline underline-offset-4">
              Escríbenos y te orientamos
            </Link>
          }
        />
      ) : (
        <>
          <p role="status" className="mb-4 text-[var(--color-ink-soft)]">
            {resultados.length === 1 ? 'Un resultado' : `${resultados.length} resultados`} para «{termino}»
          </p>
          <ul className="space-y-4">
            {resultados.map((hit) => (
              <li key={hit.slug}>
                <Card as="article">
                  <p className="text-sm text-[var(--color-ink-soft)]">{TIPO[hit.kind] ?? hit.kind}</p>
                  <h2 className="mt-1 text-lg font-semibold">
                    <Link
                      href={hit.kind === 'NEWS' || hit.kind === 'STATEMENT' ? `/noticias/${hit.slug}` : `/${hit.slug}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {hit.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-[var(--color-ink-soft)]">{hit.summary}</p>
                  {hit.publishedAt !== null && (
                    <time dateTime={hit.publishedAt.toISOString()} className="mt-2 block text-sm text-[var(--color-ink-faint)]">
                      {formatDate(hit.publishedAt)}
                    </time>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
