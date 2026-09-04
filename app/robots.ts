import type { MetadataRoute } from 'next';
import { env } from '@/platform/config/env';

/**
 * Instrucciones para los rastreadores (F2-OPS-001).
 *
 * La lista de lo que no se rastrea **no** es una medida de seguridad y no debe
 * confundirse con una: cualquiera puede leer este archivo y ver las direcciones
 * que aparecen en él. Lo que impide el acceso es la política de permisos, que
 * se evalúa en cada caso de uso. Esto solo evita que un buscador gaste su
 * presupuesto de rastreo en pantallas que siempre le van a responder con una
 * redirección al acceso, y que indexe una página de sesión expirada.
 *
 * Por eso aquí solo figuran zonas, nunca identificadores: escribir
 * `/gestion/mensajes/<folio>` sería publicar el folio.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/gestion', '/superadmin', '/mi/', '/acceso', '/activar', '/recuperar', '/sin-conexion'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
