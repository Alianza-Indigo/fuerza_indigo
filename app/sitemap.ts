import type { MetadataRoute } from 'next';
import { env } from '@/platform/config/env';
import { publishedSitemapEntries } from '@/modules/content';
import { publicDirectory } from '@/modules/membership';
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
  // Del directorio entran **solo** las fichas cuya persona autorizó que la
  // indexen (PRD §7.3). Quien pidió aparecer sin indexación tiene una página
  // que se puede visitar y que no se anuncia a ningún buscador; meterla aquí
  // sería desobedecer esa distinción con una lista.
  const fichas = (await publicDirectory()).filter((ficha) => ficha.indexable);
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
      // El directorio existe desde la Fase 4 y lo sirve el código, no el gestor.
      ruta.href === '/directorio' ||
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

  const delDirectorio = fichas.map((ficha): MetadataRoute.Sitemap[number] => ({
    url: `${base}/directorio/${ficha.slug}`,
    lastModified: ficha.publishedAt,
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  return [...contratadas, ...delGestor, ...delDirectorio];
}
