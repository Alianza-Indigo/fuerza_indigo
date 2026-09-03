import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { can } from '@/platform/authz/policy';
import { SubmitButton } from '@/design-system/primitives';
import { logoutAction } from '../(auth)/acceso/actions';

export const dynamic = 'force-dynamic';

const SECCIONES = [
  { href: '/gestion/nombramientos', label: 'Nombramientos' },
  { href: '/gestion/personas', label: 'Invitar personas' },
];

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
  const alcanza =
    can(sondeo, 'access.role.assign', { kind: 'RoleAssignment' }).allowed ||
    can(sondeo, 'identity.user.invite', { kind: 'User' }).allowed;

  // Sin facultades no hay área de gestión: se devuelve a la persona a su
  // portal, sin decirle qué existe detrás.
  if (!alcanza) redirect('/mi/seguridad');

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
            {SECCIONES.map((seccion) => (
              <li key={seccion.href}>
                <Link
                  href={seccion.href}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-indigo-50)]"
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
