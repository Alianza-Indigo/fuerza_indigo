import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { listAdministrablePeople, listLegalEntities } from '@/modules/admin';

export const metadata = { title: 'Personas y roles', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Gestión base de entidades jurídicas, personas administradoras y roles
 * (PRD §24 Fase 1).
 *
 * El correo aparece **enmascarado**: para administrar cuentas y nombramientos
 * no hace falta leerlo completo, y el actor raíz no tiene lectura de datos
 * personales (docs/PERMISSIONS.md §8).
 */
export default async function PeoplePage() {
  const actor = await currentActor();
  const [people, entities] = await Promise.all([
    listAdministrablePeople(actor),
    listLegalEntities(actor),
  ]);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <PageShell
      title="Personas y roles"
      description="Cuentas del sistema y sus nombramientos vigentes, en solo lectura. Los correos se muestran parcialmente ocultos a propósito."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Entidades jurídicas</h2>
          {!entities.ok ? (
            <ErrorNotice title={entities.error.message} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {entities.data.map((entity) => (
                <Card key={entity.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{entity.shortName}</p>
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{entity.legalName}</p>
                    </div>
                    <Badge tone={entity.isActive ? 'success' : 'neutral'}>
                      {entity.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[var(--color-ink-soft)]">Naturaleza</dt>
                      <dd>{entity.kind === 'UNION' ? 'Sindicato' : 'Asociación civil'}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-ink-soft)]">Serie documental</dt>
                      <dd className="font-mono">{entity.documentSeriesPrefix}</dd>
                    </div>
                  </dl>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Cuentas y nombramientos</h2>
          {!people.ok ? (
            <ErrorNotice title={people.error.message} />
          ) : people.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay cuentas"
              description="Las cuentas se crean por invitación desde la Secretaría de Organización o desde una delegación. Cuando exista la primera, aparecerá aquí."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Correo</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Nombramientos vigentes</th>
                  <th scope="col" className="p-3 font-medium">Último acceso</th>
                </tr>
              </thead>
              <tbody>
                {people.data.map((person) => (
                  <tr key={person.userId} className="border-b border-[var(--color-line)] last:border-0 align-top">
                    <td className="p-3 font-medium">{person.displayName}</td>
                    <td className="p-3 font-mono text-xs">{person.maskedEmail}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          person.isLocked ? 'danger' : person.status === 'ACTIVE' ? 'success' : 'neutral'
                        }
                      >
                        {person.isLocked ? 'Bloqueada' : person.status === 'ACTIVE' ? 'Activa' : person.status === 'INVITED' ? 'Invitada' : 'Deshabilitada'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {person.assignments.length === 0 ? (
                        <span className="text-[var(--color-ink-soft)]">Sin nombramientos</span>
                      ) : (
                        <ul className="space-y-1">
                          {person.assignments.map((assignment) => (
                            <li key={assignment.id}>
                              <span className="font-medium">{assignment.role}</span>
                              {assignment.legalEntity !== null && (
                                <span className="text-[var(--color-ink-soft)]"> · {assignment.legalEntity}</span>
                              )}
                              {assignment.territories.length > 0 && (
                                <span className="text-[var(--color-ink-soft)]">
                                  {' '}· {assignment.territories.join(', ')}
                                </span>
                              )}
                              {assignment.endsAt !== null && (
                                <span className="text-[var(--color-ink-soft)]">
                                  {' '}· hasta {formatter.format(assignment.endsAt)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">
                      {person.lastLoginAt === null ? '—' : formatter.format(person.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>
      </div>
    </PageShell>
  );
}
