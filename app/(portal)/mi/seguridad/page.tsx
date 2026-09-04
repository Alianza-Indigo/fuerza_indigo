import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Card, EmptyState, PageShell, ScrollableTable, SubmitButton } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { myActiveSessions } from '@/modules/identity';
import { logoutAction } from '../../../(auth)/acceso/actions';
import { CloseOtherSessionsForm, CloseSessionButton } from './session-controls';

export const metadata = { title: 'Seguridad y sesiones' };
export const dynamic = 'force-dynamic';

/**
 * Sesiones propias (PRD §20.1).
 *
 * Cada persona ve dónde tiene la cuenta abierta y puede cerrar cualquier sesión.
 * El dispositivo se describe de forma aproximada —navegador y sistema— porque
 * es lo que permite reconocer «esto no fui yo» sin conservar la huella completa
 * del navegador.
 */
export default async function SecurityPage() {
  const actor = await currentActor();
  if (!isAuthenticated(actor)) redirect('/acceso');

  const result = await myActiveSessions(actor);
  const sessions = result.ok ? result.data : [];

  // El enlace al área de gestión solo existe para quien tiene facultades. A
  // quien no las tiene no se le muestra una puerta cerrada: no se le muestra la
  // puerta.
  const sondeo = { ...actor, reason: 'acceso al área de gestión' };
  const alcanzaGestion =
    can(sondeo, 'access.role.assign', { kind: 'RoleAssignment' }).allowed ||
    can(sondeo, 'identity.user.invite', { kind: 'User' }).allowed ||
    can(sondeo, 'content.page.read', { kind: 'ContentPage' }).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title="Seguridad y sesiones"
      description="Aquí ves dónde tienes la cuenta abierta. Si algo no te suena, ciérralo y cambia tu contraseña."
      actions={
        <form action={logoutAction}>
          <SubmitButton variant="secondary">Cerrar sesión</SubmitButton>
        </form>
      }
    >
      <div className="space-y-8">
        {alcanzaGestion && (
          <Card>
            <h2 className="text-lg font-semibold">Gestión institucional</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Tienes facultades de gestión institucional.
            </p>
            <p className="mt-3 text-sm">
              <Link href="/gestion" className="underline underline-offset-4">
                Ir al área de gestión
              </Link>
            </p>
          </Card>
        )}

        <Card>
          <h2 className="text-lg font-semibold">Sesiones abiertas</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Se cierran solas al vencer. Cambiar tu contraseña cierra todas de inmediato.
          </p>

          <div className="mt-4">
            {!result.ok ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {result.error.message}
              </p>
            ) : sessions.length === 0 ? (
              <EmptyState
                title="No hay otras sesiones registradas"
                description="Cuando entres desde otro dispositivo aparecerá aquí."
              />
            ) : (
              <ScrollableTable>
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left">
                    <th scope="col" className="p-3 font-medium">Dispositivo</th>
                    <th scope="col" className="p-3 font-medium">Última actividad</th>
                    <th scope="col" className="p-3 font-medium">Vence</th>
                    <th scope="col" className="p-3 font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{session.deviceLabel ?? 'Dispositivo no identificado'}</span>
                        {session.isCurrent && (
                          <span className="ml-2">
                            <Badge tone="success">Esta sesión</Badge>
                          </span>
                        )}
                      </td>
                      <td className="p-3 tabular-nums">{formatter.format(session.lastSeenAt)}</td>
                      <td className="p-3 tabular-nums">{formatter.format(session.expiresAt)}</td>
                      <td className="p-3 text-right">
                        {session.isCurrent ? (
                          <span className="text-sm text-[var(--color-ink-soft)]">—</span>
                        ) : (
                          <CloseSessionButton sessionId={session.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ScrollableTable>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Cerrar todo lo demás</h2>
          <div className="mt-4">
            <CloseOtherSessionsForm />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
