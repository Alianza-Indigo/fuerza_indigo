import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState, PageShell, Prose, Section } from '@/design-system/primitives';
import { Markdown } from '@/design-system/markdown';
import { publishedLegalDocuments } from '@/modules/content';
import { LEGAL_NAV, formatDate } from '@/platform/i18n';

export const dynamic = 'force-dynamic';

/**
 * Documentos legales por entidad (F2-CMS-003).
 *
 * Fuerza Índigo y Alianza Índigo son personas morales distintas y cada una
 * responde por su propio texto. Cuando hay uno de cada, la página los muestra
 * los dos con un selector: elegir por quien lee cuál le corresponde sería
 * decidir en su lugar, y quien trata con las dos entidades necesita ambos.
 *
 * La declaración de accesibilidad no pasa por aquí. Es una ruta estática del
 * mismo grupo, que Next resuelve antes que este comodín, porque describe el
 * comportamiento del programa y tiene que cambiar con él.
 */

function contratado(documento: string) {
  return LEGAL_NAV.find((entrada) => entrada.href === `/legales/${documento}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documento: string }>;
}): Promise<Metadata> {
  const { documento } = await params;
  const versiones = await publishedLegalDocuments(documento);
  const entrada = contratado(documento);

  if (versiones.length === 0) {
    return entrada === undefined
      ? { title: 'Página no encontrada' }
      : { title: entrada.label, description: entrada.description, robots: { index: false, follow: true } };
  }

  return {
    title: versiones[0]!.title,
    description: entrada?.description ?? versiones[0]!.summary,
    alternates: { canonical: `/legales/${documento}` },
    robots: { index: true, follow: true },
  };
}

export default async function DocumentoLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ documento: string }>;
  searchParams: Promise<{ entidad?: string }>;
}) {
  const { documento } = await params;
  const { entidad } = await searchParams;
  const versiones = await publishedLegalDocuments(documento);
  const entrada = contratado(documento);

  if (versiones.length === 0) {
    if (entrada === undefined) notFound();

    return (
      <PageShell title={entrada.label} description={entrada.description} width="lectura">
        <EmptyState
          title="Todavía no hay un texto publicado"
          description="Este documento lo redacta y publica la organización, y hasta que lo haga no ponemos nada en su lugar. Un texto legal de relleno sería peor que ninguno: quien lo lea tomaría decisiones basándose en él."
          action={
            <Link href="/contacto" className="font-medium underline underline-offset-4">
              Escríbenos si necesitas esta información ahora
            </Link>
          }
        />
      </PageShell>
    );
  }

  const elegida =
    versiones.find((version) => version.legalEntityCode?.toLowerCase() === entidad?.toLowerCase()) ?? versiones[0]!;

  return (
    <PageShell title={elegida.title} description={elegida.summary} width="lectura">
      <div className="space-y-8">
        {versiones.length > 1 && (
          <Section
            title="¿De qué entidad?"
            description="Son dos personas morales distintas y cada una responde por su propio texto."
            level={2}
          >
            <nav aria-label="Entidad del documento" className="flex flex-wrap gap-2">
              {versiones.map((version) => {
                const activa = version.slug === elegida.slug;
                const destino =
                  version.legalEntityCode === null
                    ? `/legales/${documento}`
                    : `/legales/${documento}?entidad=${version.legalEntityCode.toLowerCase()}`;
                return (
                  <Link
                    key={version.slug}
                    href={destino}
                    aria-current={activa ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 ${
                      activa
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent-ink)]'
                        : 'border-[var(--color-line-strong)]'
                    }`}
                  >
                    {version.legalEntityShortName ?? 'Común a las dos entidades'}
                  </Link>
                );
              })}
            </nav>
          </Section>
        )}

        <Card>
          {elegida.publishedAt !== null && (
            <p className="mb-6 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Vigente desde el{' '}
              <time dateTime={elegida.publishedAt.toISOString()}>
                {formatDate(elegida.publishedAt, { locale: 'es-MX', timeZone: 'America/Mexico_City' })}
              </time>
              {elegida.legalEntityShortName === null ? '' : ` · ${elegida.legalEntityShortName}`}
            </p>
          )}
          <Prose>
            <Markdown source={elegida.bodyMarkdown} />
          </Prose>
        </Card>
      </div>
    </PageShell>
  );
}
