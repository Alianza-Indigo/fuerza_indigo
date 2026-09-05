import Link from 'next/link';
import { Card, EmptyState, ErrorNotice, NoResults, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { internalDirectory, specialtyOptions } from '@/modules/membership';
import { territoryOptions } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import { CALIDAD_EXACTA } from '../afiliacion/padrones/etiquetas';
import { ESTADO_DE_MEMBRESIA } from '../afiliacion/membresias/etiquetas';
import { ExportDirectoryForm } from './export-form';

export const metadata = { title: 'Directorio interno', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Directorio interno (PRD §7.2; F4-DIR-001).
 *
 * Quién es quién dentro de la organización, con los filtros que el PRD
 * enumera. La situación de cuotas aparece **solo** para quien tiene la facultad
 * de leer pagos: quien busca a una persona no necesita saber si está al
 * corriente, y enseñárselo convierte una búsqueda en un juicio.
 */
export default async function DirectorioInternoPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    categoria?: string;
    estado?: string;
    especialidad?: string;
    territorio?: string;
    disponibilidad?: string;
    credencial?: string;
  }>;
}) {
  const parametros = await searchParams;
  const actor = await currentActor();

  const filtros = {
    ...(parametros.q ? { query: parametros.q } : {}),
    ...(parametros.categoria ? { category: parametros.categoria as 'UNION_MEMBER' } : {}),
    ...(parametros.estado ? { status: parametros.estado as 'ACTIVE' } : {}),
    ...(parametros.especialidad ? { specialtyId: parametros.especialidad } : {}),
    ...(parametros.territorio ? { territorialUnitId: parametros.territorio } : {}),
    ...(parametros.disponibilidad ? { availability: parametros.disponibilidad } : {}),
    ...(parametros.credencial === 'vigente' ? { withValidCredential: true } : {}),
  };

  const [directorio, especialidades, territorios] = await Promise.all([
    internalDirectory(actor, filtros),
    specialtyOptions(actor),
    territoryOptions(actor),
  ]);

  const puedeExportar = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'directory.internal.export',
    { kind: 'Membership', isBulk: true, containsPersonalData: true },
  ).allowed;

  const hayFiltro = Object.keys(filtros).length > 0;
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const veCuotas = directorio.ok && directorio.data.some((fila) => fila.duesStatus !== null);

  return (
    <PageShell
      title="Directorio interno"
      description="Quién es quién dentro de la organización. No es el directorio público: aquí no hace falta que nadie haya autorizado nada."
    >
      <div className="space-y-8">
        {!directorio.ok ? (
          <ErrorNotice title={directorio.error.message} />
        ) : (
          <>
            <section>
              <form action="/gestion/directorio" method="get" className="flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1 space-y-1.5">
                  <label htmlFor="q" className="block text-sm font-medium">Nombre o número</label>
                  <input
                    id="q"
                    name="q"
                    type="search"
                    defaultValue={parametros.q ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  />
                </div>
                <div className="min-w-44 space-y-1.5">
                  <label htmlFor="categoria" className="block text-sm font-medium">Categoría</label>
                  <select
                    id="categoria"
                    name="categoria"
                    defaultValue={parametros.categoria ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Todas</option>
                    {Object.entries(CALIDAD_EXACTA).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-44 space-y-1.5">
                  <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
                  <select
                    id="estado"
                    name="estado"
                    defaultValue={parametros.estado ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Activas y suspendidas</option>
                    {Object.entries(ESTADO_DE_MEMBRESIA).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-52 space-y-1.5">
                  <label htmlFor="especialidad" className="block text-sm font-medium">Oficio o profesión</label>
                  <select
                    id="especialidad"
                    name="especialidad"
                    defaultValue={parametros.especialidad ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Cualquiera</option>
                    {especialidades.ok &&
                      especialidades.data.map((una) => (
                        <option key={una.id} value={una.id}>{una.name}</option>
                      ))}
                  </select>
                </div>
                <div className="min-w-52 space-y-1.5">
                  <label htmlFor="territorio" className="block text-sm font-medium">Territorio</label>
                  <select
                    id="territorio"
                    name="territorio"
                    defaultValue={parametros.territorio ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Cualquiera</option>
                    {territorios.ok &&
                      territorios.data.map((unidad) => (
                        <option key={unidad.id} value={unidad.id}>
                          {`${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="min-w-44 space-y-1.5">
                  <label htmlFor="disponibilidad" className="block text-sm font-medium">Disponibilidad</label>
                  <select
                    id="disponibilidad"
                    name="disponibilidad"
                    defaultValue={parametros.disponibilidad ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Cualquiera</option>
                    <option value="AVAILABLE">Disponible</option>
                    <option value="LIMITED">Con disponibilidad limitada</option>
                    <option value="UNAVAILABLE">No disponible</option>
                  </select>
                </div>
                <div className="min-w-44 space-y-1.5">
                  <label htmlFor="credencial" className="block text-sm font-medium">Credencial</label>
                  <select
                    id="credencial"
                    name="credencial"
                    defaultValue={parametros.credencial ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
                  >
                    <option value="">Cualquiera</option>
                    <option value="vigente">Solo con credencial vigente</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg border border-[var(--color-line-strong)] px-4 font-medium"
                >
                  Filtrar
                </button>
              </form>
            </section>

            <Section title="Personas" description={`${directorio.data.length} resultado(s).`}>
              {directorio.data.length === 0 ? (
                hayFiltro ? (
                  <NoResults hint="Prueba con menos filtros, o con el apellido completo." />
                ) : (
                  <EmptyState
                    title="Todavía no hay nadie en el directorio"
                    description="Aparecen aquí las personas con membresía activa o suspendida."
                  />
                )
              ) : (
                <ScrollableTable>
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left">
                      <th scope="col" className="p-3 font-medium">Persona</th>
                      <th scope="col" className="p-3 font-medium">Número</th>
                      <th scope="col" className="p-3 font-medium">Calidad</th>
                      <th scope="col" className="p-3 font-medium">Estado</th>
                      <th scope="col" className="p-3 font-medium">Territorio</th>
                      <th scope="col" className="p-3 font-medium">Oficio o profesión</th>
                      <th scope="col" className="p-3 font-medium">Credencial</th>
                      {veCuotas && <th scope="col" className="p-3 font-medium">Cuotas</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {/*
                      La identidad de la fila es el número de miembro, no la
                      persona (defecto `D-F4-016`): quien sostiene dos calidades
                      —agremiada y honoraria— ocupa dos filas, y con la persona
                      por clave React recibía dos hijos con la misma y podía
                      duplicar u omitir una de ellas. El número de miembro es
                      único por membresía, que es justo lo que la fila muestra.
                    */}
                    {directorio.data.map((fila) => (
                      <tr key={fila.memberNumber} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="p-3">
                          <Link
                            href={`/gestion/registro/${fila.personId}`}
                            className="underline underline-offset-4"
                          >
                            {fila.personName}
                          </Link>
                          {fila.headline !== null && (
                            <span className="block text-xs text-[var(--color-ink-soft)]">{fila.headline}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-sm">{fila.memberNumber ?? '—'}</td>
                        <td className="p-3">
                          {fila.category === null ? '—' : (CALIDAD_EXACTA[fila.category] ?? fila.category)}
                        </td>
                        <td className="p-3">
                          {fila.membershipStatus === null
                            ? '—'
                            : (ESTADO_DE_MEMBRESIA[fila.membershipStatus] ?? fila.membershipStatus)}
                        </td>
                        <td className="p-3">{fila.territory ?? '—'}</td>
                        <td className="p-3">{fila.occupation ?? '—'}</td>
                        <td className="p-3 tabular-nums">
                          {fila.credentialValidUntil === null
                            ? 'Sin credencial vigente'
                            : formatter.format(fila.credentialValidUntil)}
                        </td>
                        {veCuotas && (
                          <td className="p-3">
                            {fila.duesStatus === 'AL_CORRIENTE' ? 'Al corriente' : 'Con adeudo'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </ScrollableTable>
              )}
            </Section>

            {puedeExportar && (
              <Section title="Exportar">
                <Card>
                  <ExportDirectoryForm />
                </Card>
              </Section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
