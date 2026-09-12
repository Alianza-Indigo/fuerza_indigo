import { Card, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { territoryOptions } from '@/modules/access';
import { listAdministrablePeople } from '@/modules/admin';
import { can } from '@/platform/authz/policy';
import { AccountForm } from './account-form';
import { InviteForm } from './invite-form';
import { SetupLinkForm } from './setup-link-form';

export const metadata = { title: 'Invitar personas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Alta de personas administradoras por invitación (PRD §24 Fase 1).
 *
 * La cuenta nace habilitada y el titular establece su contraseña con un enlace
 * de un solo uso que, temporalmente, se entrega desde esta misma pantalla.
 */
export default async function PeopleManagementPage() {
  const actor = await currentActor();
  const puedeInvitar = can(actor, 'identity.user.invite', { kind: 'User' }).allowed;
  const puedeCerrar = can({ ...actor, reason: 'administración de cuentas' }, 'identity.user.disable', {
    kind: 'User',
  }).allowed;

  const [personas, territorios] = await Promise.all([listAdministrablePeople(actor), territoryOptions(actor)]);

  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const opciones = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];

  return (
    <PageShell
      title="Personas con cuenta"
      description="Quién tiene acceso al sistema y desde cuándo. Los correos se muestran parcialmente ocultos a propósito."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Cuentas</h2>
          {!personas.ok ? (
            <ErrorNotice title={personas.error.message} />
          ) : personas.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna cuenta"
              description="Invita a la primera persona con el formulario de abajo."
            />
          ) : (
            <ScrollableTable caption="Cuentas de la organización, con su estado, su último acceso y sus nombramientos">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Correo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Último acceso</th>
                  <th scope="col" className="p-3 font-medium">Nombramientos</th>
                  {puedeCerrar && <th scope="col" className="p-3 font-medium">Acceso</th>}
                </tr>
              </thead>
              <tbody>
                {personas.data.map((persona) => (
                  <tr key={persona.userId} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3 font-medium">{persona.displayName}</td>
                    <td className="p-3">{persona.maskedEmail}</td>
                    <td className="p-3">
                      {persona.status === 'ACTIVE' ? 'Activa' : persona.status === 'INVITED' ? 'Pendiente heredada' : 'Deshabilitada'}
                      {!persona.hasPassword && persona.status !== 'DISABLED' && (
                        <span className="block text-xs">falta establecer contraseña</span>
                      )}
                      {persona.isLocked && <span className="block text-xs">bloqueada temporalmente</span>}
                    </td>
                    <td className="p-3 tabular-nums">
                      {persona.lastLoginAt === null ? 'Nunca' : formatter.format(persona.lastLoginAt)}
                    </td>
                    <td className="p-3 text-xs">
                      {persona.assignments.length === 0
                        ? 'Ninguno'
                        : persona.assignments.map((nombramiento) => nombramiento.role).join(', ')}
                    </td>
                    {puedeCerrar && (
                      <td className="p-3">
                        {!persona.hasPassword && persona.status !== 'DISABLED' ? (
                          <SetupLinkForm userId={persona.userId} />
                        ) : persona.userId === actor.userId ? (
                          <span className="text-xs text-[var(--color-ink-soft)]">
                            Es tu cuenta: no puedes cerrarla tú
                          </span>
                        ) : (
                          <AccountForm
                            userId={persona.userId}
                            displayName={persona.displayName}
                            cerrada={persona.status === 'DISABLED'}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Crear una cuenta</h2>
          {!puedeInvitar ? (
            <ErrorNotice title="No tienes facultades para invitar personas">
              <p>Consultar quién tiene cuenta y crear cuentas nuevas son cosas distintas.</p>
            </ErrorNotice>
          ) : (
            <Card>
              <InviteForm territorios={opciones} />
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
