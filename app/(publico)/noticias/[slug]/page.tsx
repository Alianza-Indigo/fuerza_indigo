import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell, Prose } from '@/design-system/primitives';
import { Markdown } from '@/design-system/markdown';
import { publishedPage } from '@/modules/content';
import { formatDate } from '@/platform/i18n';
import { StructuredData, articulo, socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const nota = await publishedPage(slug);
  if (nota === null) return { title: 'Nota no encontrada' };

  return socialMetadata({
    title: nota.seoTitle ?? nota.title,
    description: nota.seoDescription ?? nota.summary,
    path: `/noticias/${nota.slug}`,
    type: 'article',
    publishedTime: nota.publishedAt,
  });
}

export default async function NotaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const nota = await publishedPage(slug);
  if (nota === null) notFound();

  return (
    <PageShell title={nota.title} description={nota.summary} width="lectura">
      <StructuredData
        data={articulo({
          titulo: nota.title,
          resumen: nota.summary,
          slug: nota.slug,
          publicadoEl: nota.publishedAt,
        })}
      />
      <article>
        {nota.publishedAt !== null && (
          <p className="mb-6 text-sm text-[var(--color-ink-soft)]" data-secondary>
            <time dateTime={nota.publishedAt.toISOString()}>{formatDate(nota.publishedAt)}</time>
            {nota.territorialUnitName !== null && ` · ${nota.territorialUnitName}`}
          </p>
        )}
        <Prose>
          <Markdown source={nota.bodyMarkdown} />
        </Prose>
      </article>
      <p className="mt-10">
        <Link href="/noticias" className="font-medium underline underline-offset-4">
          Volver a las noticias
        </Link>
      </p>
    </PageShell>
  );
}
