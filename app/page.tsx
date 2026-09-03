import Link from 'next/link';

/**
 * Portada provisional de la Fase 1.
 *
 * El sitio institucional completo es alcance de la Fase 2 (PRD §24). Esta página
 * no finge estar terminada ni muestra contenido ficticio: dice con exactitud qué
 * está disponible hoy y a dónde lleva cada enlace, todos funcionales.
 */
export const metadata = { title: 'Inicio' };

export default function HomePage() {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-indigo-600)]">
          Sindicato Unión de Inclusión y Derechos Neurodivergentes
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Fuerza Índigo</h1>
        <p className="max-w-prose text-lg text-[var(--color-ink-soft)]">
          Plataforma en construcción. La infraestructura de acceso, permisos y auditoría ya está operativa; el sitio
          institucional público se incorpora en la fase siguiente.
        </p>
      </header>

      <nav aria-label="Accesos disponibles" className="flex flex-wrap gap-3">
        <Link
          href="/acceso"
          className="rounded-lg bg-[var(--color-indigo-600)] px-5 py-3 font-medium text-white transition-colors hover:bg-[var(--color-indigo-700)]"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/legales/accesibilidad"
          className="rounded-lg border border-[var(--color-line)] px-5 py-3 font-medium transition-colors hover:bg-[var(--color-indigo-50)]"
        >
          Accesibilidad
        </Link>
      </nav>
    </main>
  );
}
