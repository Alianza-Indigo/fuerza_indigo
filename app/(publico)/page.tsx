import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, EmptyState, LinkButton, ModuleBadge, Section } from '@/design-system/primitives';
import { publishedList } from '@/modules/content';
import { SITE_NAV, formatDate } from '@/platform/i18n';
import { StructuredData, organizacion, sitioWeb, socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = socialMetadata({
  title: 'Fuerza Índigo · Sindicato de inclusión y derechos neurodivergentes',
  description:
    'Sindicato Unión de Inclusión y Derechos Neurodivergentes. Defendemos los derechos laborales de las personas neurodivergentes y de quienes trabajan con ellas.',
  path: '/',
});

/**
 * Inicio.
 *
 * Lo primero que se ve no es un manifiesto sino **qué se puede hacer aquí**:
 * afiliarse, pedir apoyo o encontrar la delegación. Quien llega a la página de
 * un sindicato suele llegar con un problema concreto, y hacerle leer tres
 * párrafos antes de ofrecerle la puerta es hacerle perder el tiempo cuando
 * menos lo tiene.
 */
export default async function InicioPage() {
  const noticias = await publishedList('NEWS', { limit: 3 });

  return (
    <main id="contenido">
      <StructuredData data={organizacion()} />
      <StructuredData data={sitioWeb()} />
      <section className="border-b border-[var(--color-line)] bg-[var(--color-surface-accent)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-semibold text-[var(--color-accent-ink)]">
            Sindicato Unión de Inclusión y Derechos Neurodivergentes
          </p>
          <h1 className="mt-3 max-w-[16ch] text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Los derechos no se piden solos.
          </h1>
          <p className="mt-5 max-w-[var(--width-prose)] text-lg text-[var(--color-ink-soft)] sm:text-xl">
            Representamos a quienes trabajan siendo personas neurodivergentes y a quienes trabajan con ellas.
            Acompañamiento real, no folletos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/afiliate/agremiado">Afíliate</LinkButton>
            <LinkButton href="/solicitar-apoyo" variant="secondary">
              Necesito apoyo ahora
            </LinkButton>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-16 sm:px-6">
        <Section
          title="Por dónde empezar"
          description="Cada camino lleva a algo que se puede hacer hoy, no a una lista de intenciones."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SITE_NAV.flatMap((seccion) => seccion.items)
              .filter((item) =>
                ['/afiliate/agremiado', '/solicitar-apoyo', '/delegaciones', '/cian', '/ceni', '/transparencia'].includes(
                  item.href,
                ),
              )
              .map((item) => (
                <Card key={item.href} as="article">
                  {item.module !== undefined && <ModuleBadge module={item.module}>{item.label}</ModuleBadge>}
                  <h3 className="mt-3 text-lg font-semibold">
                    <Link href={item.href} className="underline-offset-4 hover:underline">
                      {item.label}
                    </Link>
                  </h3>
                  <p className="mt-1 text-[var(--color-ink-soft)]">{item.description}</p>
                </Card>
              ))}
          </div>
        </Section>

        <Section title="Lo último" description="Comunicados y notas del sindicato.">
          {noticias.length === 0 ? (
            <EmptyState
              title="Todavía no hay noticias publicadas"
              description="Cuando el sindicato publique su primer comunicado aparecerá aquí. No mostramos notas de ejemplo."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {noticias.map((nota) => (
                <Card key={nota.slug} as="article">
                  {nota.publishedAt !== null && (
                    <time
                      dateTime={nota.publishedAt.toISOString()}
                      className="text-sm text-[var(--color-ink-soft)]"
                    >
                      {formatDate(nota.publishedAt)}
                    </time>
                  )}
                  <h3 className="mt-2 text-lg font-semibold">
                    <Link href={`/noticias/${nota.slug}`} className="underline-offset-4 hover:underline">
                      {nota.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-[var(--color-ink-soft)]">{nota.summary}</p>
                </Card>
              ))}
            </div>
          )}
          {noticias.length > 0 && (
            <p className="mt-6">
              <Link href="/noticias" className="font-medium underline underline-offset-4">
                Ver todas las noticias
              </Link>
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
