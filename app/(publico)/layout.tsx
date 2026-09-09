import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { LEGAL_NAV, SITE_NAV } from '@/platform/i18n';
import { record } from '@/platform/analytics';
import { classifyUserAgent } from '@/platform/kernel/ids';

export const dynamic = 'force-dynamic';

const PRIMARY_NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/que-es-fuerza-indigo', label: 'El sindicato' },
  { href: '/#formas-de-participar', label: 'Formas de participar' },
  { href: '/sindicato-y-derechos', label: 'Defensa' },
  { href: '/herramientas', label: 'Herramientas' },
  { href: '/delegaciones', label: 'Delegaciones' },
  { href: '/transparencia', label: 'Transparencia' },
] as const;

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
      <header className="fi-dark relative z-40 border-b border-cyan-300/25 bg-[#030923] text-white shadow-[0_10px_30px_rgba(0,0,0,.18)]">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-11 shrink-0 items-center gap-3 font-black uppercase leading-none tracking-tight">
            <Image src="/landing/fuerza-indigo-mark.webp" alt="" width={43} height={40} sizes="43px" className="h-10 w-auto" />
            <span className="text-[.92rem]">Fuerza<br />Índigo</span>
          </Link>

          <nav aria-label="Principal" className="hidden xl:block">
            <ul className="flex items-center gap-1">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-blue-100/80 transition hover:bg-white/10 hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/acceso" className="hidden min-h-11 items-center rounded-lg border border-cyan-300/45 px-4 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex">
              Entrar
            </Link>
            <Link href="/afiliate/agremiado" className="inline-flex min-h-11 items-center rounded-lg bg-gradient-to-r from-violet-600 to-cyan-400 px-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(0,203,255,.2)] transition hover:brightness-110">
              Afíliate sin costo
            </Link>
          </div>
        </div>

        <nav aria-label="Principal en móvil" className="border-t border-cyan-300/20 xl:hidden">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold sm:px-6 lg:px-8">
              <span>Menú</span>
              <span aria-hidden="true" className="group-open:hidden">▾</span>
              <span aria-hidden="true" className="hidden group-open:inline">▴</span>
            </summary>
            <div className="border-t border-cyan-300/20 bg-[#050d31] px-4 py-4 sm:px-6 lg:px-8">
              <ul className="grid gap-1 sm:grid-cols-2">
                {PRIMARY_NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex min-h-11 items-center rounded-lg px-3 font-medium text-blue-100/80 hover:bg-white/10 hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/acceso" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-cyan-300/45 px-4 font-medium sm:hidden">Entrar</Link>
            </div>
          </details>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="fi-dark border-t border-cyan-300/25 bg-[#02071e] text-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
            <div>
              <Link href="/" className="inline-flex min-h-11 items-center gap-3 font-black uppercase leading-none tracking-tight">
                <Image src="/landing/fuerza-indigo-mark.webp" alt="" width={43} height={40} sizes="43px" className="h-10 w-auto" />
                <span>Fuerza<br />Índigo</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm text-blue-100/65">Diversidad hoy. Derechos siempre.</p>
            </div>

            {SITE_NAV.map((seccion) => (
              <div key={seccion.title}>
                <h2 className="font-bold text-white">{seccion.title}</h2>
                <ul className="mt-3 space-y-1">
                  {seccion.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-blue-100/65 underline-offset-4 hover:text-white hover:underline">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-cyan-300/20 pt-6">
            <ul className="flex flex-wrap gap-x-6">
              {LEGAL_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-blue-100/65 underline-offset-4 hover:text-white hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/accesibilidad" className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-300 underline underline-offset-4">
                  Ajustar cómo se ve este sitio
                </Link>
              </li>
            </ul>
            <p className="mt-4 max-w-[var(--width-prose)] text-sm text-blue-100/55">
              Sindicato Unión de Inclusión y Derechos Neurodivergentes «Fuerza Índigo» y Alianza Índigo A. C.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
