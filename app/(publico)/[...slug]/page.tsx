import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { EmptyState, PageShell, Prose } from '@/design-system/primitives';
import { Markdown } from '@/design-system/markdown';
import { publishedPage, resolveRedirect } from '@/modules/content';
import { PUBLIC_ROUTES, formatDate } from '@/platform/i18n';
import { socialMetadata } from '@/platform/seo';

export const dynamic = 'force-dynamic';

/**
 * Páginas públicas servidas por el CMS (PRD §6.1, §16.1).
 *
 * Una sola ruta atiende todo el mapa funcional. La alternativa —un archivo por
 * página— obligaría a desplegar para corregir una coma en un comunicado, que es
 * exactamente lo que un CMS existe para evitar.
 *
 * **Criterio 1 de la fase: ninguna página usa contenido ficticio para aparentar
 * terminación.** Una ruta contratada por el PRD cuyo contenido nadie ha escrito
 * todavía no inventa un texto de relleno: dice con todas sus letras que aún no
 * hay nada publicado ahí, y ofrece por dónde seguir. Es información verdadera y
 * útil; un párrafo inventado sería ninguna de las dos cosas.
 *
 * Una dirección que no existe ni está contratada devuelve un 404 **de verdad**,
 * no una página de disculpa con código 200: el código de estado es lo que leen
 * los buscadores y los lectores automáticos, y mentirles deja direcciones
 * muertas indexadas para siempre.
 */

function rutaContratada(ruta: string) {
  return PUBLIC_ROUTES.find((entrada) => entrada.href === ruta);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const ruta = slug.join('/');
  const pagina = await publishedPage(ruta);

  if (pagina === null) {
    const contratada = rutaContratada(`/${ruta}`);
    return contratada === undefined
      ? { title: 'Página no encontrada' }
      : {
          title: contratada.label,
          description: contratada.description,
          // Una sección sin contenido no se indexa: no hay nada que encontrar
          // ahí todavía, y aparecer en un buscador sería una promesa vacía.
          robots: { index: false, follow: true },
        };
  }

  return socialMetadata({
    title: pagina.seoTitle ?? pagina.title,
    description: pagina.seoDescription ?? pagina.summary,
    path: `/${pagina.slug}`,
    type: 'article',
    publishedTime: pagina.publishedAt,
  });
}

export default async function PaginaPublica({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const ruta = slug.join('/');
  const pagina = await publishedPage(ruta);

  if (pagina === null) {
    // Antes de dar nada por perdido: quizá el contenido se mudó y alguien dejó
    // dicho a dónde. Una dirección publicada es una promesa que sobrevive a la
    // página (ADR-0041).
    const destino = await resolveRedirect(ruta);
    if (destino !== null) {
      if (destino.permanent) permanentRedirect(destino.path);
      redirect(destino.path);
    }

    const contratada = rutaContratada(`/${ruta}`);

    // Una dirección que no existe ni está contratada es un 404 de verdad, con
    // su código de estado. La pantalla la pone `not-found.tsx` del grupo.
    if (contratada === undefined) notFound();

    // Una ruta contratada sin contenido publicado dice la verdad.
    return (
      <PageShell title={contratada.label} description={contratada.description} width="lectura">
        <EmptyState
          title="Todavía no hay contenido publicado aquí"
          description="Esta sección existe y su contenido se está preparando. No ponemos texto de relleno para aparentar que está lista: cuando haya algo que decir, lo dirá aquí."
          action={
            <Link href="/contacto" className="font-medium underline underline-offset-4">
              Escríbenos si necesitas esta información ahora
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title={pagina.title} description={pagina.summary} width="lectura">
      <article>
        {pagina.publishedAt !== null && (
          <p className="mb-6 text-sm text-[var(--color-ink-soft)]" data-secondary>
            Publicado el{' '}
            <time dateTime={pagina.publishedAt.toISOString()}>
              {formatDate(pagina.publishedAt, { locale: 'es-MX', timeZone: 'America/Mexico_City' })}
            </time>
            {pagina.territorialUnitName !== null && ` · ${pagina.territorialUnitName}`}
          </p>
        )}
        <Prose>
          <Markdown source={pagina.bodyMarkdown} />
        </Prose>
      </article>
    </PageShell>
  );
}
