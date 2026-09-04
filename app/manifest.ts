import type { MetadataRoute } from 'next';

import { colorToken } from '@/design-system/tokens';

/**
 * Manifiesto de la aplicación instalable (F2-PWA-001, PRD §17.6).
 *
 * Los colores se leen del mismo token que usa la interfaz. Escribirlos a mano
 * haría que la barra del sistema se quedara con el índigo de hace tres meses
 * en cuanto alguien ajustara la paleta, y es el sitio donde menos se nota.
 *
 * `start_url` es la portada y no el panel: quien instala la aplicación desde el
 * sitio público casi nunca tiene cuenta, y abrirle una pantalla de acceso sería
 * pedirle credenciales antes de decirle nada.
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fuerza Índigo',
    short_name: 'Fuerza Índigo',
    description:
      'Plataforma del sindicato Fuerza Índigo y de Alianza Índigo: afiliación, defensa laboral, atención y participación.',
    lang: 'es-MX',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: colorToken('--color-indigo-50'),
    theme_color: colorToken('--color-indigo-600'),
    categories: ['social', 'education', 'productivity'],
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Solicitar apoyo',
        short_name: 'Apoyo',
        description: 'Cuéntanos qué está pasando y te acompañamos.',
        url: '/solicitar-apoyo',
      },
      {
        name: 'Cómo se ve este sitio',
        short_name: 'Accesibilidad',
        description: 'Ajusta el tamaño del texto, el espacio, el movimiento y el tema.',
        url: '/accesibilidad',
      },
    ],
  };
}
