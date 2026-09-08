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
 * Marco del panel institucional (PRD §6.4).
 *
 * Como el resto de los marcos, es una conveniencia y no una garantía: cada caso
 * de uso vuelve a evaluar la política por su cuenta. Lo que hace aquí es no
 * enseñar puertas cerradas.
 */
export default async function InstitucionalLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  // La raíz (sin cuenta, `userId === null`) también entra: acceso total (ADR-0174).
  if (!isAuthenticated(actor) || (actor.userId === null && actor.actorKind !== 'ROOT_SUPERADMIN')) {
    redirect('/acceso');
  }

  const sondeo = { ...actor, reason: 'acceso al panel institucional' };
  const visibles = SECCIONES.filter((seccion) => can(sondeo, seccion.permiso, { kind: 'Institucional' }).allowed);

  if (visibles.length === 0) redirect('/mi/seguridad');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-semibold">Vida institucional</span>
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
