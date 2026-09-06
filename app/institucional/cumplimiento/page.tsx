import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { obligationList } from '@/modules/bargaining';
import { listLegalEntities } from '@/modules/admin';
import { AdvanceObligationForm, OpenObligationForm } from './compliance-forms';

export const metadata = { title: 'Obligaciones ante la autoridad', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = {
  MEMBER_REGISTRY_UPDATE: 'Padrón',
  LEADERSHIP_CHANGE: 'Dirigencia',
  STATUTE_AMENDMENT: 'Reforma estatutaria',
  FINANCIAL_REPORT: 'Informe financiero',
  OTHER: 'Otra',
};

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pendiente', tone: 'warning' },
  PREPARED: { label: 'Preparada', tone: 'accent' },
  SUBMITTED: { label: 'Presentada', tone: 'success' },
  ACKNOWLEDGED: { label: 'Acusada de recibo', tone: 'success' },
  OBSERVED: { label: 'Observada', tone: 'danger' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
};

/**
 * Obligaciones ante la autoridad laboral (PRD §9.7; F5-CUM-001, F5-CUM-002).
 *
 * Ordenadas por lo que está por vencer. Lo vencido se marca, porque una
 * obligación fuera de plazo tiene consecuencias que no se arreglan enterándose
 * tarde.
 */
export default async function CumplimientoPage() {
  const actor = await currentActor();

  const [obligaciones, entidades] = await Promise.all([obligationList(actor), listLegalEntities(actor)]);

  const puedeAdministrar = can({ ...actor, reason: 'obligaciones ante autoridad' }, 'compliance.obligation.manage', {
    kind: 'ComplianceObligation',
  }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const opcionesEntidad: readonly Option[] = entidades.ok
    ? entidades.data.map((entidad) => ({ value: entidad.id, label: entidad.shortName }))
    : [];

  return (
    <PageShell
      title="Obligaciones ante la autoridad"
      description="Lo que hay que presentar, por qué acto, cuándo vence y con qué acuse se cumplió."
      width="ancha"
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Obligaciones</h2>
          {!obligaciones.ok ? (
            <ErrorNotice title={obligaciones.error.message} />
          ) : obligaciones.data.length === 0 ? (
            <EmptyState
              title="No hay obligaciones registradas"
              description="Una obligación nace de un acto: una asamblea que cambió la dirigencia, una reforma, un ejercicio que cierra."
            />
          ) : (
            <ScrollableTable caption="Obligaciones ante la autoridad laboral">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Tipo</th>
                  <th scope="col" className="p-3 font-medium">Origen</th>
                  <th scope="col" className="p-3 font-medium">Entidad</th>
                  <th scope="col" className="p-3 font-medium">Vence</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Acuses</th>
                  {puedeAdministrar && (
                    <th scope="col" className="p-3 font-medium">
                      <span className="sr-only">Actualizar</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {obligaciones.data.map((obligacion) => {
                  const estado = ESTADO[obligacion.status] ?? { label: obligacion.status, tone: 'neutral' as Tone };
                  return (
                    <tr key={obligacion.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3">{TIPO[obligacion.kind] ?? obligacion.kind}</td>
                      <td className="max-w-xs p-3 text-sm">{obligacion.triggerEventRef}</td>
                      <td className="p-3">{obligacion.legalEntity}</td>
                      <td className="p-3 tabular-nums">
                        {fecha.format(obligacion.dueAt)}
                        {obligacion.overdue && (
                          <span className="mt-1 block">
                            <Badge tone="danger">Fuera de plazo</Badge>
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                        {obligacion.authorityReference !== null && (
                          <span className="mt-1 block font-mono text-xs text-[var(--color-ink-soft)]">
                            {obligacion.authorityReference}
                          </span>
                        )}
                      </td>
                      <td className="p-3 tabular-nums">{obligacion.documentCount}</td>
                      {puedeAdministrar && (
                        <td className="p-3">
                          {obligacion.status !== 'CLOSED' && (
                            <Disclosure summary="Actualizar">
                              <AdvanceObligationForm obligationId={obligacion.id} />
                            </Disclosure>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        {puedeAdministrar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Registrar una obligación</h2>
            <Card>
              <OpenObligationForm entidades={opcionesEntidad} />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
