import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, NoResults, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { beneficiaryRegistry } from '@/modules/membership';
import { searchPeople } from '@/modules/identity';
import { territoryOptions } from '@/modules/access';
import { entitiesFor } from '@/platform/institution/entities';
import { can } from '@/platform/authz/policy';
import { BeneficiaryForm } from './beneficiary-form';
import { ESTADO_DE_REGISTRO_PROTEGIDO, ORIGEN, PERFIL_PROTEGIDO, PRIVACIDAD } from '../etiquetas';

export const metadata = { title: 'Personas beneficiarias', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADOS = ['ACTIVE', 'REVOKED'] as const;

/**
 * Registro de personas beneficiarias protegidas (PRD §3.4, §8.3).
 *
 * Ordenado por urgencia: quien más lo necesita aparece arriba. La necesidad
 * inicial **no** se muestra en el listado cuando la privacidad es reforzada —lo
 * que alguien contó de su vida no es una columna de una tabla— y el registro
 * nace reforzado.
 */
export default async function BeneficiariosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const actor = await currentActor();
  const puedeRegistrar = can(actor, 'membership.beneficiary.create', { kind: 'ProtectedBeneficiary' }).allowed;

  const filtroEstado = (ESTADOS as readonly string[]).includes(estado ?? '')
    ? (estado as (typeof ESTADOS)[number])
    : undefined;
  const [registro, personas, territorios, entidades] = await Promise.all([
    beneficiaryRegistry(actor, {
      ...(filtroEstado === undefined ? {} : { status: filtroEstado }),
      ...(q === undefined || q === '' ? {} : { query: q }),
    }),
    puedeRegistrar ? searchPeople(actor, { limit: 200 }) : Promise.resolve(null),
    puedeRegistrar ? territoryOptions(actor) : Promise.resolve(null),
    puedeRegistrar
      ? entitiesFor(actor, 'membership.beneficiary.create', 'ProtectedBeneficiary')
      : Promise.resolve([]),
  ]);

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const opcionesDePersona =
    personas !== null && personas.ok
      ? personas.data
          .filter((persona) => persona.mergedInto === null)
          .map((persona) => ({ value: persona.personId, label: `${persona.displayName} · ${persona.publicId}` }))
      : [];

  return (
    <PageShell
      title="Personas beneficiarias"
      description="Atención sin afiliación y sin cuota. No concede derechos electorales ni entra en el padrón que se remite a la autoridad laboral."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Filtrar</h2>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-44 space-y-1.5">
              <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
              <select
                id="estado"
                name="estado"
                defaultValue={filtroEstado ?? ''}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
              >
                <option value="">Todos</option>
                {ESTADOS.map((uno) => (
                  <option key={uno} value={uno}>{ESTADO_DE_REGISTRO_PROTEGIDO[uno] ?? uno}</option>
                ))}
              </select>
            </div>
            <div className="min-w-52 flex-1 space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium">Identificador o apellido</label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ''}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
              />
            </div>
            <button type="submit" className="min-h-11 rounded-lg border border-[var(--color-line-strong)] px-4 font-medium">
              Filtrar
            </button>
          </form>
        </section>

        <Section title="Registro">
          {!registro.ok ? (
            <ErrorNotice title={registro.error.message} />
          ) : registro.data.length === 0 && (filtroEstado !== undefined || (q ?? '') !== '') ? (
            <NoResults hint="Prueba sin filtros, o con el identificador completo." />
          ) : registro.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay registros protegidos"
              description="Registra la primera con el formulario de abajo."
            />
          ) : (
            <ScrollableTable caption="Personas registradas con su perfil, estado y origen">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Perfil</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Origen</th>
                  <th scope="col" className="p-3 font-medium">Privacidad</th>
                  <th scope="col" className="p-3 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {registro.data.map((fila) => (
                  <tr key={fila.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/gestion/afiliacion/beneficiarios/${fila.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {fila.personName}
                      </Link>
                      <span className="block font-mono text-xs text-[var(--color-ink-soft)]">{fila.publicId}</span>
                      {fila.responsiblePersonName !== null && (
                        <span className="block text-xs">Representa: {fila.responsiblePersonName}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm">{PERFIL_PROTEGIDO[fila.profileKind] ?? fila.profileKind}</td>
                    <td className="p-3"><Badge tone={fila.status === 'ACTIVE' ? 'success' : 'danger'}>{ESTADO_DE_REGISTRO_PROTEGIDO[fila.status] ?? fila.status}</Badge></td>
                    <td className="p-3 text-sm">{ORIGEN[fila.originKind] ?? fila.originKind}</td>
                    <td className="p-3 text-sm">{PRIVACIDAD[fila.privacyLevel] ?? fila.privacyLevel}</td>
                    <td className="p-3 tabular-nums">{fecha.format(fila.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        {puedeRegistrar && (
          <Section
            title="Crear registro protegido"
            description="El registro no abre una atención. Las solicitudes de ayuda se administran como expedientes separados."
          >
            <Card>
              <BeneficiaryForm
                personas={opcionesDePersona}
                entidades={entidades.map((entidad) => ({ value: entidad.id, label: entidad.name }))}
                territorios={
                  territorios !== null && territorios.ok
                    ? territorios.data.map((unidad) => ({
                        value: unidad.id,
                        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
                      }))
                    : []
                }
              />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
