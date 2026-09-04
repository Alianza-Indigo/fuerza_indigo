import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { LEGAL_NAV, SITE_NAV } from '@/platform/i18n';
import { record } from '@/platform/analytics';
import { classifyUserAgent } from '@/platform/kernel/ids';

export const dynamic = 'force-dynamic';

/**
 * Marco del sitio público.
 *
 * La navegación funciona **sin JavaScript**: en móvil es un `<details>` nativo,
 * que abre, cierra, se anuncia solo a los lectores de pantalla y responde al
 * teclado sin una línea de guion. Un menú hecho con estado de React sería más
 * código para hacer peor lo que el navegador ya hace bien, y dejaría fuera a
 * quien navega con la red caída a media carga (PRD §5.4).
 *
 * Desde 360 px: el menú colapsa por debajo de `md` y se despliega en horizontal
 * por encima. No hay ningún punto intermedio en el que se corte.
 *
 * La medición agregada se registra aquí y no en cada pantalla: el marco es lo
 * único por lo que pasan todas las rutas públicas, y repartirla por las páginas
 * garantizaría que la siguiente que alguien escriba no mida nada. Va dentro de
 * `after()`, así que ocurre **después** de responder: quien lee la página no
 * espera a que se escriba un contador.
 */
export default async function PublicoLayout({ children }: { children: ReactNode }) {
  const cabeceras = await headers();
  const ruta = cabeceras.get('x-pathname') ?? '/';
  const clase = classifyUserAgent(cabeceras.get('user-agent'));

  after(async () => {
    await record(ruta === '/sin-conexion' ? 'OFFLINE_FALLBACK' : 'PAGE_VIEW', {
      route: ruta,
      userAgentClass: clase,
    });
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-block size-6 rounded-md bg-[var(--color-accent)]"
            />
            <span>Fuerza Índigo</span>
          </Link>

          <nav aria-label="Principal" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {SITE_NAV.map((seccion) => (
                <li key={seccion.title} className="relative">
                  <details className="group">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 font-medium hover:bg-[var(--color-accent-soft)]">
                      {seccion.title}
                      <span aria-hidden="true" className="text-xs">
                        ▾
                      </span>
                    </summary>
                    <ul className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-2 shadow-[var(--shadow-overlay)]">
                      {seccion.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="block rounded-lg px-3 py-2 hover:bg-[var(--color-accent-soft)]"
                          >
                            <span className="block font-medium">{item.label}</span>
                            <span className="block text-sm text-[var(--color-ink-soft)]">{item.description}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/acceso"
              className="hidden min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-4 font-medium sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              href="/afiliate/agremiado"
              className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-ink-inverse)]"
            >
              Afíliate
            </Link>
          </div>
        </div>

        {/* Navegación en móvil: nativa, sin JavaScript. */}
        <nav aria-label="Principal en móvil" className="border-t border-[var(--color-line)] md:hidden">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-medium">
              <span>Menú</span>
              <span aria-hidden="true" className="group-open:hidden">
                ▾
              </span>
              <span aria-hidden="true" className="hidden group-open:inline">
                ▴
              </span>
            </summary>
            <div className="space-y-4 border-t border-[var(--color-line)] px-4 py-4">
              {SITE_NAV.map((seccion) => (
                <div key={seccion.title}>
                  <p className="text-sm font-semibold text-[var(--color-ink-soft)]">{seccion.title}</p>
                  <ul className="mt-1">
                    {seccion.items.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className="flex min-h-11 items-center rounded-lg px-2 font-medium">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Link
                href="/acceso"
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
              >
                Entrar
              </Link>
            </div>
          </details>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-16 border-t border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {SITE_NAV.map((seccion) => (
              <div key={seccion.title}>
                <h2 className="font-semibold">{seccion.title}</h2>
                <ul className="mt-3 space-y-1">
                  {seccion.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="inline-flex min-h-11 items-center text-[var(--color-ink-soft)] underline-offset-4 hover:underline"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-[var(--color-line)] pt-6">
            <ul className="flex flex-wrap gap-x-6">
              {LEGAL_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--color-ink-soft)] underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/accesibilidad"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-accent-ink)] underline underline-offset-4"
                >
                  Ajustar cómo se ve este sitio
                </Link>
              </li>
            </ul>
            <p className="mt-4 max-w-[var(--width-prose)] text-sm text-[var(--color-ink-soft)]">
              Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo» y Alianza Índigo A. C.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
