import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentActor } from '@/platform/http/request-context';
import { SubmitButton } from '@/design-system/primitives';
import { rootLogoutAction } from './login/actions';
import { SUPERADMIN_NAVIGATION } from './navigation';
import { SuperadminQuickSearch } from './quick-search';

export const dynamic = 'force-dynamic';

/**
 * Marco del Centro de Control del Superadmin.
 *
 * La raíz no tiene un panel paralelo al producto: esta navegación enlaza las
 * superficies reales de Gestión, Institucional y Casos, además de las pantallas
 * técnicas propias del Superadmin.
 */
export default async function SuperadminLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '';

  // La pantalla de acceso no puede exigir sesión: sería un bucle.
  if (pathname.endsWith('/superadmin/login')) return <>{children}</>;

  const actor = await currentActor();
  if (actor.actorKind !== 'ROOT_SUPERADMIN') redirect('/superadmin/login');

  return (
    <div className="min-h-dvh bg-[var(--color-surface)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/superadmin" className="font-semibold no-underline">
              Fuerza Índigo · Centro de control
            </Link>
            <span className="rounded-full border border-[var(--color-indigo-500)] px-2 py-0.5 text-xs text-[var(--color-indigo-600)]">
              Acceso total
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline underline-offset-4"
            >
              Ver sitio
            </Link>
            <form action={rootLogoutAction}>
              <SubmitButton variant="secondary">Salir</SubmitButton>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-4">
            <SuperadminQuickSearch />
          </div>

          <details className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3 lg:hidden">
            <summary className="cursor-pointer font-medium">Navegación del Centro de control</summary>
            <nav aria-label="Centro de control móvil" className="mt-4 space-y-5">
              {SUPERADMIN_NAVIGATION.map((group) => (
                <NavGroup key={group.label} label={group.label} links={group.links} />
              ))}
            </nav>
          </details>

          <nav
            aria-label="Centro de control"
            className="hidden max-h-[calc(100dvh-8rem)] space-y-5 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-3 lg:block"
          >
            {SUPERADMIN_NAVIGATION.map((group) => (
              <NavGroup key={group.label} label={group.label} links={group.links} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  links,
}: {
  label: string;
  links: readonly { readonly href: string; readonly label: string }[];
}) {
  return (
    <section aria-labelledby={`nav-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <h2
        id={`nav-${label.replace(/\s+/g, '-').toLowerCase()}`}
        className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]"
      >
        {label}
      </h2>
      <ul className="mt-1 space-y-0.5">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-indigo-50)]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
