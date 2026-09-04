import type { Metadata, Viewport } from 'next';
import { currentPreferences } from '@/platform/preferences';
import { preferenceAttributes } from '@/platform/preferences/preferences';
import { ConnectionNotice, ServiceWorkerRegistration } from '@/platform/pwa';
import { colorToken } from '@/design-system/tokens';
import { env } from '@/platform/config/env';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fuerza Índigo',
    template: '%s · Fuerza Índigo',
  },
  description:
    'Plataforma del Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo» y del ecosistema Alianza Índigo.',
  robots: { index: false, follow: false },
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
    <html lang="es-MX" {...preferenceAttributes(preferencias)}>
      <body className="min-h-dvh antialiased">
        <a
          href="#contenido"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-[var(--color-ink-inverse)]"
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
