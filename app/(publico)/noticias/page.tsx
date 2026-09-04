import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, PageShell } from '@/design-system/primitives';
import { publishedList } from '@/modules/content';
import { formatDate } from '@/platform/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Noticias',
  description: 'Comunicados, notas y recursos del Sindicato Fuerza Índigo.',
  robots: { index: true, follow: true },
};

export default async function NoticiasPage() {
  const [noticias, comunicados] = await Promise.all([
    publishedList('NEWS', { limit: 50 }),
    publishedList('STATEMENT', { limit: 50 }),
  ]);

  const todo = [...noticias, ...comunicados].sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );

  return (
    <PageShell title="Noticias" description="Comunicados, notas y recursos del sindicato." width="ancha">
      {todo.length === 0 ? (
        <EmptyState
          title="Todavía no hay nada publicado"
          description="Cuando el sindicato publique su primer comunicado o nota aparecerá aquí. No mostramos contenido de ejemplo para aparentar que la sección está llena."
          action={
            <Link href="/contacto" className="font-medium underline underline-offset-4">
              Escríbenos si buscas algo concreto
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {todo.map((nota) => (
            <li key={nota.slug}>
              <Card as="article">
                {nota.publishedAt !== null && (
                  <time dateTime={nota.publishedAt.toISOString()} className="text-sm text-[var(--color-ink-soft)]">
                    {formatDate(nota.publishedAt)}
                  </time>
                )}
                <h2 className="mt-2 text-lg font-semibold">
                  <Link href={`/noticias/${nota.slug}`} className="underline-offset-4 hover:underline">
                    {nota.title}
                  </Link>
                </h2>
                <p className="mt-1 text-[var(--color-ink-soft)]">{nota.summary}</p>
                {nota.territorialUnitName !== null && (
                  <p className="mt-2 text-sm text-[var(--color-ink-faint)]">{nota.territorialUnitName}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
