import type { Metadata, Viewport } from 'next';
import { currentPreferences } from '@/platform/preferences';
import { preferenceAttributes } from '@/platform/preferences/preferences';
import { ConnectionNotice, ServiceWorkerRegistration } from '@/platform/pwa';
import { colorToken } from '@/design-system/tokens';
import { env } from '@/platform/config/env';
import './globals.css';

const DESCRIPCION =
  'Plataforma del Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo» y del ecosistema Alianza Índigo.';

/**
 * Metadatos del documento (F2-OPS-001).
 *
 * `robots` deniega por omisión y cada ruta pública lo habilita para sí. Es la
 * misma postura que la lista cerrada de permisos: una pantalla nueva de gestión
 * no queda indexable porque alguien olvidó excluirla.
 *
 * `metadataBase` sale de `APP_URL` para que las direcciones sociales sean
 * absolutas. Sin ella, una imagen relativa se comparte rota en cuanto sale del
 * sitio, que es justo cuando importa.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: {
    default: 'Fuerza Índigo',
    template: '%s · Fuerza Índigo',
  },
  description: DESCRIPCION,
  applicationName: 'Fuerza Índigo',
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Fuerza Índigo',
    locale: 'es_MX',
    title: 'Fuerza Índigo',
    description: DESCRIPCION,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Fuerza Índigo · sindicato de personas neurodivergentes' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fuerza Índigo',
    description: DESCRIPCION,
    images: ['/og.png'],
  },
  icons: {
    icon: [
      { url: '/icono.svg', type: 'image/svg+xml' },
      { url: '/icono-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nunca se bloquea la ampliación: es requisito de accesibilidad (PRD §5.2).
  maximumScale: 5,
  // El color de la barra del sistema sigue al tema, y los dos valores salen de
  // los mismos tokens que la interfaz, no de un hexadecimal escrito a mano.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: colorToken('--color-indigo-600') },
    { media: '(prefers-color-scheme: dark)', color: colorToken('--color-indigo-950') },
  ],
};

/**
 * Marco del documento.
 *
 * Las preferencias se resuelven en el servidor y se escriben como atributos de
 * `<html>`, de modo que la primera pintura ya sale con el tema, el tamaño y la
 * densidad que la persona eligió. Nada parpadea porque nada se decide en el
 * navegador (PRD §5.3).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const preferencias = await currentPreferences();

  return (
    // `data-scroll-behavior` no es decoración: le dice al enrutador que la hoja
    // de estilos declara desplazamiento suave, para que **lo desactive durante
    // los cambios de ruta**. Sin él, cada navegación anima el salto de la
    // página aunque nadie lo haya pedido, y en una plataforma para personas
    // neurodivergentes el movimiento involuntario es justo lo que el PRD §5.2
    // manda poder controlar. La preferencia de movimiento reducido sigue
    // ganando por encima de todo esto (defecto `D-F4-020`).
    <html lang="es-MX" data-scroll-behavior="smooth" {...preferenceAttributes(preferencias)}>
      <body className="min-h-dvh antialiased">
        {/*
          Al recibir el foco tiene que alcanzar los 44 px que exige
          docs/TEST_PLAN.md §7. Con solo el relleno vertical se quedaba en
          41,6 px: quien navega con el teclado lo veía, pero quien lo pulsa en
          una pantalla táctil tenía un objetivo por debajo del umbral.
        */}
        <a
          href="#contenido"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:bg-[var(--color-accent)] focus:px-4 focus:text-[var(--color-ink-inverse)]"
        >
          Saltar al contenido
        </a>
        <ConnectionNotice />
        {children}
        <ServiceWorkerRegistration habilitado={env().NODE_ENV === 'production'} />
      </body>
    </html>
  );
}
