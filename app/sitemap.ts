import type { MetadataRoute } from 'next';
import { env } from '@/platform/config/env';
import { publishedSitemapEntries } from '@/modules/content';
import { PUBLIC_ROUTES } from '@/platform/i18n';

export const dynamic = 'force-dynamic';

/**
 * Mapa del sitio (F2-OPS-001).
 *
 * Se compone de dos fuentes y ninguna se escribe a mano: las rutas contratadas
 * del mapa funcional, que ya viven en un solo sitio para que la cabecera, el
 * pie y esto no discrepen, y las páginas publicadas del gestor de contenidos.
 *
 * Una ruta contratada **sin contenido publicado no entra**. La página existe y
 * dice la verdad —que todavía no hay nada—, pero anunciarla a un buscador sería
 * pedirle que traiga gente a una pantalla vacía. Entra el día que se publique
 * algo, sola.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL;
  const publicadas = await publishedSitemapEntries();
  const conContenido = new Set(publicadas.map((entrada) => `/${entrada.slug}`));

  const contratadas = PUBLIC_ROUTES.filter(
    (ruta) =>
      // La portada y las rutas que sirve el código —no el gestor— entran
      // siempre: existen con su contenido desde el primer despliegue.
      ruta.href === '/' ||
      ruta.href === '/noticias' ||
      ruta.href === '/buscar' ||
      ruta.href === '/contacto' ||
      ruta.href === '/solicitar-apoyo' ||
      conContenido.has(ruta.href),
  ).map((ruta): MetadataRoute.Sitemap[number] => ({
    url: `${base}${ruta.href}`,
    lastModified: new Date(),
    changeFrequency: ruta.href === '/' ? 'daily' : 'weekly',
    priority: ruta.href === '/' ? 1 : 0.7,
  }));

  const delGestor = publicadas
    .filter((entrada) => !PUBLIC_ROUTES.some((ruta) => ruta.href === `/${entrada.slug}`))
    .map((entrada): MetadataRoute.Sitemap[number] => ({
      url: `${base}/${entrada.slug}`,
      lastModified: entrada.publishedAt ?? new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    }));

  return [...contratadas, ...delGestor];
}
