import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { can } from '@/platform/authz/policy';
import { SubmitButton } from '@/design-system/primitives';
import { logoutAction } from '../../(auth)/acceso/actions';
import { SECCIONES } from '../../gestion/secciones';

export const dynamic = 'force-dynamic';

/**
 * Marco del portal de la persona.
 *
 * Aquí entra cualquiera con cuenta, tenga o no facultades institucionales. Lo
 * que ve es lo suyo: sus sesiones, sus pagos. El enlace al área de gestión solo
 * aparece para quien alcanza alguna de sus secciones, y se decide con la misma
 * lista que dibuja esa área: a quien no tiene facultades no se le enseña una
 * puerta cerrada, se le ahorra la puerta.
 */
const SECCIONES_DEL_PORTAL = [
  { href: '/mi/pagos', label: 'Mis pagos' },
  { href: '/mi/seguridad', label: 'Seguridad y sesiones' },
] as const;

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!isAuthenticated(actor)) redirect('/acceso');

  const sondeo = { ...actor, reason: 'acceso al área de gestión' };
  const alcanzaGestion = SECCIONES.some((seccion) => can(sondeo, seccion.permiso, { kind: 'Gestion' }).allowed);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-semibold">Mi cuenta</span>
          <div className="flex items-center gap-2">
            {alcanzaGestion && (
              <Link
                href="/gestion"
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline underline-offset-4"
              >
                Gestión institucional
              </Link>
            )}
            <form action={logoutAction}>
              <SubmitButton variant="secondary">Cerrar sesión</SubmitButton>
            </form>
          </div>
        </div>
        <nav aria-label="Secciones de mi cuenta" className="mx-auto w-full max-w-5xl overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1 pb-2">
            {SECCIONES_DEL_PORTAL.map((seccion) => (
              <li key={seccion.href}>
                <Link
                  href={seccion.href}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 font-medium hover:bg-[var(--color-accent-soft)]"
                >
                  {seccion.label}
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
