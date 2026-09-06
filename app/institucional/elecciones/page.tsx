import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { electionList } from '@/modules/election';
import { unionBodyList } from '@/modules/governance';
import { territoryOptions } from '@/modules/access';
import { CreateElectionForm } from './election-forms';

export const metadata = { title: 'Elecciones', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'En preparación', tone: 'neutral' },
  CALL_ISSUED: { label: 'Convocada', tone: 'accent' },
  REGISTRATION_OPEN: { label: 'Registro abierto', tone: 'accent' },
  CAMPAIGN: { label: 'Campaña', tone: 'accent' },
  VOTING: { label: 'Jornada', tone: 'success' },
  TALLYING: { label: 'Escrutinio', tone: 'warning' },
  RESULTS_DECLARED: { label: 'Resultados declarados', tone: 'success' },
  CHALLENGED: { label: 'Impugnada', tone: 'warning' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
  ANNULLED: { label: 'Anulada', tone: 'danger' },
};

/**
 * Procesos electorales (PRD §9.6; F5-ELE-001).
 *
 * La lista enseña lo que decide si un proceso puede seguir adelante: si la
 * comisión está integrada y con sus declaraciones, si el padrón está publicado
 * y cuántas incidencias siguen abiertas.
 */
export default async function EleccionesPage() {
  const actor = await currentActor();

  const [procesos, organos, territorios] = await Promise.all([
    electionList(actor),
    unionBodyList(actor),
    territoryOptions(actor),
  ]);

  const puedeAdministrar = can({ ...actor, reason: 'administración electoral' }, 'election.election.manage', {
    kind: 'Election',
  }).allowed;

  const opcionesOrgano: readonly Option[] = organos.ok
    ? organos.data.filter((organo) => organo.status === 'ACTIVE').map((organo) => ({ value: organo.id, label: organo.name }))
    : [];
  const opcionesTerritorio: readonly Option[] = territorios.ok
    ? territorios.data.map((unidad) => ({
        value: unidad.id,
        label: `${'· '.repeat(Math.max(0, unidad.depth))}${unidad.name}`,
      }))
    : [];

  return (
    <PageShell
      title="Elecciones"
      description="Comisión Electoral, calendario, padrón, planillas y jornada. El voto es personal, libre, directo y secreto: la plataforma no puede decir quién votó qué, y ese es el punto."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Procesos</h2>
          {!procesos.ok ? (
            <ErrorNotice title={procesos.error.message} />
          ) : procesos.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún proceso electoral"
              description="Regístralo con su calendario, integra la comisión y convoca."
            />
          ) : (
            <ScrollableTable caption="Procesos electorales, del más reciente al más antiguo">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Proceso</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Comisión</th>
                  <th scope="col" className="p-3 font-medium">Planillas</th>
                  <th scope="col" className="p-3 font-medium">Incidencias</th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {procesos.data.map((proceso) => {
                  const estado = ESTADO[proceso.status] ?? { label: proceso.status, tone: 'neutral' as Tone };
                  const declaradas = proceso.commissionMembers.filter((integrante) => integrante.declared).length;
                  return (
                    <tr key={proceso.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{proceso.name}</span>
                        <span className="block text-xs text-[var(--color-ink-soft)]">
                          {proceso.bodyName} · {proceso.territory}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </td>
                      <td className="p-3 tabular-nums">
                        {proceso.commissionMembers.length} · {declaradas} con declaración
                      </td>
                      <td className="p-3 tabular-nums">{proceso.slateCount}</td>
                      <td className="p-3">
                        {proceso.openIncidents === 0 ? (
                          <span className="text-[var(--color-ink-soft)]">Ninguna abierta</span>
                        ) : (
                          <Badge tone="warning">{proceso.openIncidents} abiertas</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/institucional/elecciones/${proceso.publicId}`}
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                        >
                          Abrir<span className="sr-only"> el proceso {proceso.name}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeAdministrar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Registrar un proceso</h2>
            <Card>
              <CreateElectionForm organos={opcionesOrgano} territorios={opcionesTerritorio} />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
