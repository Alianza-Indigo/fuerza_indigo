import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { can } from '@/platform/authz/policy';
import { SubmitButton } from '@/design-system/primitives';
import { logoutAction } from '../(auth)/acceso/actions';

export const dynamic = 'force-dynamic';

/**
 * Cada sección declara el permiso que la abre.
 *
 * La navegación se construye a partir de lo que la persona puede alcanzar de
 * verdad. Mostrar una pestaña que lleva a una denegación es hacerle perder el
 * tiempo y, además, decirle que existe algo que no le corresponde.
 */
const SECCIONES = [
  { href: '/gestion/nombramientos', label: 'Nombramientos', permiso: 'access.role.assign' },
  { href: '/gestion/personas', label: 'Invitar personas', permiso: 'identity.user.invite' },
  { href: '/gestion/contenidos', label: 'Contenidos', permiso: 'content.page.read' },
  { href: '/gestion/mensajes', label: 'Mensajes recibidos', permiso: 'support.request.read' },
  { href: '/gestion/redirecciones', label: 'Redirecciones', permiso: 'content.redirect.manage' },
] as const;

/**
 * Marco del área de gestión institucional.
 *
 * **No es el panel del Superadmin.** Aquí entra quien tiene facultades
 * sindicales —hoy, la Secretaría Ejecutiva— y no quien administra la
 * plataforma: nombrar es un acto institucional, y el actor raíz no puede
 * hacerlo por diseño (docs/PERMISSIONS.md §8).
 *
 * Como en el resto del sistema, este marco es una conveniencia y no una
 * garantía: cada caso de uso vuelve a evaluar la política por su cuenta.
 */
export default async function GestionLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!isAuthenticated(actor) || actor.userId === null) redirect('/acceso');

  const sondeo = { ...actor, reason: 'acceso al área de gestión' };
  const visibles = SECCIONES.filter((seccion) => can(sondeo, seccion.permiso, { kind: 'Gestion' }).allowed);

  // Sin ninguna sección alcanzable no hay área de gestión: se devuelve a la
  // persona a su portal, sin decirle qué existe detrás.
  if (visibles.length === 0) redirect('/mi/seguridad');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-semibold">Gestión institucional</span>
          <div className="flex items-center gap-2">
            <Link
              href="/mi/seguridad"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline underline-offset-4"
            >
              Mi cuenta
            </Link>
            <form action={logoutAction}>
              <SubmitButton variant="secondary">Salir</SubmitButton>
            </form>
          </div>
        </div>
        <nav aria-label="Secciones" className="mx-auto w-full max-w-6xl overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1 pb-2">
            {visibles.map((seccion) => (
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
