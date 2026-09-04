import { headers } from 'next/headers';

import { env } from '@/platform/config/env';

/**
 * Datos estructurados (F2-OPS-001).
 *
 * Se emiten como JSON-LD y **llevan el nonce de la petición**. Los navegadores
 * no ejecutan un `<script type="application/ld+json">`, pero la política de
 * seguridad gobierna el elemento `<script>` sin mirar su tipo: sin nonce, un
 * navegador estricto lo bloquea y el dato estructurado desaparece sin que nadie
 * se entere, porque la página se ve exactamente igual.
 *
 * El contenido se serializa con `JSON.stringify` y se escapa la secuencia que
 * cerraría el elemento. Un título de comunicado con `</script>` dentro no es un
 * escenario rebuscado: es un comunicado sobre seguridad informática.
 */

function serializar(datos: unknown): string {
  return JSON.stringify(datos).replaceAll('<', '\\u003c');
}

export async function StructuredData({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializar({ '@context': 'https://schema.org', ...data }) }}
    />
  );
}

/**
 * La organización, para la portada.
 *
 * Solo se afirma lo que consta: el nombre legal que la semilla declara y la
 * dirección del sitio. No se inventa un domicilio, un teléfono ni un perfil de
 * red social; un dato estructurado equivocado se propaga a los paneles de
 * conocimiento de los buscadores y después cuesta mucho corregirlo.
 */
export function organizacion(): Record<string, unknown> {
  const base = env().APP_URL;

  return {
    '@type': 'Organization',
    name: 'Fuerza Índigo',
    legalName: 'Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo»',
    alternateName: 'Fuerza Índigo',
    url: base,
    logo: `${base}/icono-512.png`,
    image: `${base}/og.png`,
    description:
      'Sindicato de personas neurodivergentes: afiliación, defensa laboral, atención y participación democrática.',
  };
}

/** El sitio, con su buscador propio. */
export function sitioWeb(): Record<string, unknown> {
  const base = env().APP_URL;

  return {
    '@type': 'WebSite',
    name: 'Fuerza Índigo',
    url: base,
    inLanguage: 'es-MX',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${base}/buscar?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Un contenido publicado del gestor. */
export function articulo(input: {
  titulo: string;
  resumen: string;
  slug: string;
  publicadoEl: Date | null;
}): Record<string, unknown> {
  const base = env().APP_URL;

  return {
    '@type': 'Article',
    headline: input.titulo,
    description: input.resumen,
    inLanguage: 'es-MX',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${base}/${input.slug}` },
    image: `${base}/og.png`,
    // La autoría que se declara es la de la organización, no la de la persona
    // que redactó. Quién firma un comunicado es una decisión institucional, y
    // el sistema conoce la autoría interna pero no tiene por qué publicarla.
    author: { '@type': 'Organization', name: 'Fuerza Índigo' },
    publisher: { '@type': 'Organization', name: 'Fuerza Índigo', logo: `${base}/icono-512.png` },
    ...(input.publicadoEl === null ? {} : { datePublished: input.publicadoEl.toISOString() }),
  };
}
