import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { can } from '@/platform/authz/policy';
import { SubmitButton } from '@/design-system/primitives';
import { logoutAction } from '../(auth)/acceso/actions';
import { SECCIONES } from './secciones';

export const dynamic = 'force-dynamic';

/**
 * Marco del área de casos (PRD §10).
 *
 * Como los demás marcos, es una conveniencia y no una garantía: cada caso de
 * uso vuelve a evaluar la política por su cuenta, y aquí además comprueba
 * asignación sobre el expediente concreto. Lo que hace este marco es no enseñar
 * puertas cerradas.
 *
 * La comprobación de aquí usa la sonda de asignación en positivo a propósito:
 * responde «¿podrías llevar expedientes?», no «¿llevas alguno?». Quien tiene la
 * facultad y ninguno asignado ve el área con la lista vacía, que es la verdad,
 * en vez de una redirección que parecería una negativa.
 */
export default async function CasosLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  // La raíz (sin cuenta, `userId === null`) también entra: acceso total (ADR-0174).
  if (!isAuthenticated(actor) || (actor.userId === null && actor.actorKind !== 'ROOT_SUPERADMIN')) {
    redirect('/acceso');
  }

  const puedeLlevarExpedientes = SECCIONES.some(
    (seccion) =>
      can(actor, seccion.permiso, { kind: 'Case' }, { hasLiveAssignment: () => true }).allowed,
  );
  if (!puedeLlevarExpedientes) redirect('/mi');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-semibold">Casos y acompañamiento</span>
          <div className="flex items-center gap-2">
            <Link
              href="/mi"
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
