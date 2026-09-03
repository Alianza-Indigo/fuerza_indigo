import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { accountsForAppointment, assignableRoles, liveAssignments, territoryOptions } from '@/modules/access';
import { listLegalEntities } from '@/modules/admin';
import { AssignForm, RevokeForm, type Opcion } from './appointment-forms';

export const metadata = { title: 'Nombramientos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Nombramientos vigentes y su otorgamiento (PRD §4.3, §24 Fase 1).
 *
 * Los dos controles que hacen verificable el criterio «un administrador
 * ordinario no puede asignarse permisos superiores» se aplican en el caso de
 * uso, no aquí. Esta pantalla se limita a no ofrecer lo que va a ser rechazado:
 * la cuenta propia no aparece en la lista de personas y los roles se filtran a
 * los que quien mira ya posee.
 */
export default async function AppointmentsPage() {
  const actor = await currentActor();

  const [asignaciones, roles, cuentas, entidades, territorios] = await Promise.all([
    liveAssignments(actor),
    assignableRoles(actor),
    accountsForAppointment(actor),
    listLegalEntities(actor),
    territoryOptions(actor),
  ]);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const opcionesCuentas: Opcion[] = cuentas.ok
    ? cuentas.data.map((cuenta) => ({
        value: cuenta.userId,
        label: `${cuenta.personName} · ${cuenta.maskedEmail}${cuenta.status === 'INVITED' ? ' · sin activar' : ''}`,
      }))
    : [];

  const opcionesRoles: Opcion[] = roles.ok
    ? roles.data.map((rol) => ({ value: rol.code, label: `${rol.name} · ${rol.permissionCount} permisos` }))
    : [];

  const opcionesEntidades: Opcion[] = entidades.ok
    ? entidades.data.map((entidad) => ({ value: entidad.id, label: entidad.shortName }))
    : [];

  const opcionesTerritorios: Opcion[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];

  const puedeOtorgar = roles.ok && cuentas.ok;

  return (
    <PageShell
      title="Nombramientos"
      description="Quién ocupa qué cargo, en qué territorio y hasta cuándo. Revocar conserva el historial: no se borra nada."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Nombramientos vigentes</h2>
          {!asignaciones.ok ? (
            <ErrorNotice title={asignaciones.error.message} />
          ) : asignaciones.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún nombramiento vigente"
              description="Cuando otorgues el primero aparecerá aquí, con su motivo y su vigencia."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Rol</th>
                  <th scope="col" className="p-3 font-medium">Alcance</th>
                  <th scope="col" className="p-3 font-medium">Vigencia</th>
                  <th scope="col" className="p-3 font-medium">Motivo</th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Revocar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.data.map((asignacion) => (
                  <tr key={asignacion.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{asignacion.personName}</span>
                      <span className="block text-xs text-[var(--color-ink-soft)]">{asignacion.maskedEmail}</span>
                    </td>
                    <td className="p-3">{asignacion.roleName}</td>
                    <td className="p-3">
                      {asignacion.legalEntity === null && asignacion.territories.length === 0 ? (
                        <Badge tone="neutral">Sin acotar</Badge>
                      ) : (
                        <>
                          {asignacion.legalEntity !== null && <div>{asignacion.legalEntity}</div>}
                          {asignacion.territories.length > 0 && (
                            <div className="text-xs text-[var(--color-ink-soft)]">
                              {asignacion.territories.join(', ')}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">
                      <div>desde {formatter.format(asignacion.startsAt)}</div>
                      {asignacion.endsAt !== null && (
                        <div className="text-xs text-[var(--color-ink-soft)]">
                          hasta {formatter.format(asignacion.endsAt)}
                        </div>
                      )}
                    </td>
                    <td className="max-w-xs p-3 text-xs text-[var(--color-ink-soft)]">{asignacion.grantReason}</td>
                    <td className="p-3">
                      <RevokeForm assignmentId={asignacion.id} personName={asignacion.personName} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Otorgar un nombramiento</h2>
          {!puedeOtorgar ? (
            <ErrorNotice title="No tienes facultades para otorgar nombramientos">
              <p>
                Consultar quién ocupa cada cargo y otorgarlos son cosas distintas. Si crees que deberías poder,
                habla con quien tenga la Secretaría Ejecutiva.
              </p>
            </ErrorNotice>
          ) : opcionesRoles.length === 0 ? (
            <EmptyState
              title="No hay ningún rol que puedas otorgar"
              description="Solo puedes otorgar roles cuyos permisos ya tienes tú. Ninguno de los del catálogo cumple esa condición con tus facultades actuales."
            />
          ) : (
            <Card>
              <AssignForm
                cuentas={opcionesCuentas}
                roles={opcionesRoles}
                entidades={opcionesEntidades}
                territorios={opcionesTerritorios}
              />
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
