import Link from 'next/link';
import { Card, EmptyState, ErrorNotice, NoResults, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { territoryOptions } from '@/modules/access';
import { searchPeople } from '@/modules/identity';
import { can } from '@/platform/authz/policy';
import { PersonForm } from './person-form';

export const metadata = { title: 'Registro de personas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Registro maestro de persona (PRD §3.1, F4-AFI-001).
 *
 * Una persona, un registro. El listado muestra las calidades que acumula —
 * agremiada, honoraria, beneficiaria— sobre la misma fila, porque ver que son
 * la misma persona es justo lo que impide dar de alta a la misma dos veces.
 */
export default async function RegistroDePersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const actor = await currentActor();
  const puedeEditar = can(actor, 'identity.person.update', { kind: 'Person' }).allowed;

  const [personas, territorios] = await Promise.all([
    searchPeople(actor, { ...(q === undefined || q === '' ? {} : { query: q }) }),
    territoryOptions(actor),
  ]);

  const opciones = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];

  return (
    <PageShell
      title="Registro de personas"
      description="Cada ser humano tiene un solo registro. Sobre él conviven todas sus relaciones con el ecosistema, sin duplicarlo."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Buscar</h2>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium">
                Nombre, apellido, correo o identificador
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ''}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
              />
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
            >
              Buscar
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Registros</h2>
          {!personas.ok ? (
            <ErrorNotice title={personas.error.message} />
          ) : personas.data.length === 0 && (q ?? '') !== '' ? (
            <NoResults hint="Prueba con menos letras, o con el primer apellido solo. Si de verdad no está, regístrala abajo." />
          ) : personas.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún registro"
              description="Registra a la primera persona con el formulario de abajo."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Identificador</th>
                  <th scope="col" className="p-3 font-medium">Territorio</th>
                  <th scope="col" className="p-3 font-medium">Calidades</th>
                  <th scope="col" className="p-3 font-medium">Cuenta</th>
                </tr>
              </thead>
              <tbody>
                {personas.data.map((persona) => (
                  <tr key={persona.personId} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3 font-medium">
                      <Link href={`/gestion/registro/${persona.personId}`} className="underline underline-offset-4">
                        {persona.displayName}
                      </Link>
                      {persona.mergedInto !== null && (
                        <span className="block text-xs text-[var(--color-ink-soft)]">
                          Fusionado con otro registro
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{persona.publicId}</td>
                    <td className="p-3">{persona.territory ?? '—'}</td>
                    <td className="p-3 text-sm">
                      {persona.qualities.length === 0 ? 'Ninguna' : persona.qualities.join(', ')}
                    </td>
                    <td className="p-3">{persona.hasAccount ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Registrar una persona</h2>
          {!puedeEditar ? (
            <ErrorNotice title="No tienes facultades para dar de alta registros de persona">
              <p>Consultar el registro y crear registros nuevos son cosas distintas.</p>
            </ErrorNotice>
          ) : (
            <Card>
              <PersonForm territorios={opciones} />
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
