import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, NoResults, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { applicationQueue, membershipTypeList } from '@/modules/membership';
import { searchPeople } from '@/modules/identity';
import { territoryOptions } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import { ESTADO_DE_SOLICITUD } from '../../../(portal)/mi/afiliacion/etiquetas';
import { AssistedStartForm } from './assisted-start-form';

export const metadata = { title: 'Solicitudes de afiliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADOS = [
  'SUBMITTED',
  'DOCUMENTATION_PENDING',
  'UNDER_REVIEW',
  'CLARIFICATION_REQUIRED',
  'APPROVED',
  'PENDING_PAYMENT',
  'ACTIVATED',
  'REJECTED',
  'WITHDRAWN',
  'DRAFT',
] as const;

type Estado = (typeof ESTADOS)[number];

/**
 * Cola de solicitudes (PRD §8.1, paso 9).
 *
 * Ordenada por antigüedad de envío y no por fecha de creación: quien lleva más
 * tiempo esperando va primero, que es lo que hace que una cola sea una cola y no
 * una pila.
 */
export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const actor = await currentActor();
  const puedeCapturar = can(actor, 'membership.application.create', { kind: 'MembershipApplication' }).allowed;

  const filtroEstado = (ESTADOS as readonly string[]).includes(estado ?? '') ? (estado as Estado) : undefined;

  const [solicitudes, calidades, personas, territorios] = await Promise.all([
    applicationQueue(actor, {
      ...(filtroEstado === undefined ? {} : { status: filtroEstado }),
      ...(q === undefined || q === '' ? {} : { query: q }),
    }),
    puedeCapturar ? membershipTypeList(actor, { onlyActive: true }) : Promise.resolve(null),
    puedeCapturar ? searchPeople(actor, { limit: 200 }) : Promise.resolve(null),
    puedeCapturar ? territoryOptions(actor) : Promise.resolve(null),
  ]);

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Solicitudes de afiliación"
      description="Ordenadas por antigüedad: quien lleva más tiempo esperando aparece primero."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Filtrar</h2>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 space-y-1.5">
              <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
              <select
                id="estado"
                name="estado"
                defaultValue={filtroEstado ?? ''}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2 text-base"
              >
                <option value="">Todos</option>
                {ESTADOS.map((uno) => (
                  <option key={uno} value={uno}>
                    {ESTADO_DE_SOLICITUD[uno] ?? uno}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-56 flex-1 space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium">Folio o apellido</label>
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
              Filtrar
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Cola</h2>
          {!solicitudes.ok ? (
            <ErrorNotice title={solicitudes.error.message} />
          ) : solicitudes.data.length === 0 && (filtroEstado !== undefined || (q ?? '') !== '') ? (
            <NoResults hint="Prueba sin filtro de estado, o con el folio completo." />
          ) : solicitudes.data.length === 0 ? (
            <EmptyState
              title="No hay ninguna solicitud todavía"
              description="Aparecerán aquí en cuanto alguien envíe la suya."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Folio</th>
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Calidad</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Enviada</th>
                  <th scope="col" className="p-3 font-medium">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.data.map((solicitud) => (
                  <tr key={solicitud.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      <Link
                        href={`/gestion/afiliacion/solicitudes/${solicitud.id}`}
                        className="font-mono text-sm underline underline-offset-4"
                      >
                        {solicitud.folio}
                      </Link>
                    </td>
                    <td className="p-3">
                      {solicitud.personName}
                      <span className="block font-mono text-xs text-[var(--color-ink-soft)]">
                        {solicitud.personPublicId}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      {solicitud.membershipType}
                      <span className="block text-xs text-[var(--color-ink-soft)]">{solicitud.territory ?? '—'}</span>
                    </td>
                    <td className="p-3">
                      <Badge
                        tone={
                          solicitud.status === 'REJECTED'
                            ? 'danger'
                            : solicitud.status === 'CLARIFICATION_REQUIRED' || solicitud.status === 'DOCUMENTATION_PENDING'
                              ? 'warning'
                              : 'accent'
                        }
                      >
                        {ESTADO_DE_SOLICITUD[solicitud.status] ?? solicitud.status}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">
                      {solicitud.submittedAt === null ? 'Borrador' : fecha.format(solicitud.submittedAt)}
                    </td>
                    <td className="p-3 text-sm">
                      {solicitud.documents.total === 0
                        ? '—'
                        : `${solicitud.documents.total}${solicitud.documents.pending > 0 ? `, ${solicitud.documents.pending} sin revisar` : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeCapturar && calidades !== null && personas !== null && territorios !== null && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Capturar una solicitud asistida</h2>
            <p className="mb-3 max-w-[var(--width-prose)] text-[var(--color-ink-soft)]">
              Para quien no puede hacer el trámite por su cuenta. Se abre un borrador que se completa con la
              persona delante y se envía cuando ella lo confirma.
            </p>
            <Card>
              <AssistedStartForm
                personas={
                  personas.ok
                    ? personas.data
                        .filter((persona) => persona.mergedInto === null)
                        .map((persona) => ({
                          value: persona.personId,
                          label: `${persona.displayName} · ${persona.publicId}`,
                        }))
                    : []
                }
                calidades={
                  calidades.ok
                    ? calidades.data.map((calidad) => ({
                        value: calidad.id,
                        label: `${calidad.name} (${calidad.legalEntity})`,
                      }))
                    : []
                }
                territorios={
                  territorios.ok
                    ? territorios.data.map((unidad) => ({
                        value: unidad.id,
                        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
                      }))
                    : []
                }
              />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
