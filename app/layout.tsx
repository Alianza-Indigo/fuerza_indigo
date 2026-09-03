import type { Metadata, Viewport } from 'next';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="min-h-dvh antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-indigo-600)] focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
