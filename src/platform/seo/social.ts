import type { Metadata } from 'next';

/**
 * Metadatos sociales de una pantalla pública (F2-OPS-001).
 *
 * Existe porque Next **sustituye** el bloque `openGraph` completo cuando una
 * página lo declara, en vez de mezclarlo con el del marco. Una pantalla que
 * solo quería fijar su tipo se quedaba sin imagen, y eso no se ve en la propia
 * pantalla: se ve cuando alguien comparte el enlace en un grupo de mensajería y
 * llega un rectángulo gris. Un fallo que solo aparece fuera del sitio es el que
 * más tarda en descubrirse.
 *
 * Cada pantalla pública compone sus metadatos con esta función y no a mano.
 */
export function socialMetadata(input: {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  publishedTime?: Date | null;
  index?: boolean;
}): Metadata {
  const tipo = input.type ?? 'website';
  const indexable = input.index ?? true;

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    robots: { index: indexable, follow: true },
    openGraph: {
      type: tipo,
      siteName: 'Fuerza Índigo',
      locale: 'es_MX',
      title: input.title,
      description: input.description,
      url: input.path,
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: 'Fuerza Índigo · sindicato de personas neurodivergentes',
        },
      ],
      ...(tipo === 'article' && input.publishedTime !== null && input.publishedTime !== undefined
        ? { publishedTime: input.publishedTime.toISOString() }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: ['/og.png'],
    },
  };
}
