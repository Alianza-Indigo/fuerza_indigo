import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentActor } from '@/platform/http/request-context';
import { SubmitButton } from '@/design-system/primitives';
import { rootLogoutAction } from './login/actions';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { href: '/superadmin', label: 'Estado general' },
  { href: '/superadmin/personas', label: 'Personas y roles' },
  { href: '/superadmin/auditoria', label: 'Auditoría' },
  { href: '/superadmin/salud', label: 'Salud técnica' },
];

/**
 * Marco del panel de Superadmin.
 *
 * La comprobación de sesión raíz vive aquí, en el servidor, y se repite en cada
 * página: el marco no es una garantía de seguridad, es una conveniencia. Lo que
 * protege de verdad es que cada caso de uso evalúa la política por su cuenta.
 */
export default async function SuperadminLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '';

  // La pantalla de acceso no puede exigir sesión: sería un bucle.
  if (pathname.endsWith('/superadmin/login')) return <>{children}</>;

  const actor = await currentActor();
  if (actor.actorKind !== 'ROOT_SUPERADMIN') redirect('/superadmin/login');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-semibold">Administración técnica</span>
            <span className="rounded-full border border-[var(--color-indigo-500)] px-2 py-0.5 text-xs text-[var(--color-indigo-600)]">
              Sin derechos sindicales
            </span>
          </div>
          <form action={rootLogoutAction}>
            <SubmitButton variant="secondary">Salir</SubmitButton>
          </form>
        </div>
        <nav aria-label="Secciones" className="mx-auto w-full max-w-6xl overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1 pb-2">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-indigo-50)]"
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {children}
    </div>
  );
}
