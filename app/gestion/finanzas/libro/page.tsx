import { Badge, Card, EmptyState, ErrorNotice, Notice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { ACCOUNT_CODES, billableEntities, ledgerEntries, reconciliationList } from '@/modules/billing';
import { can } from '@/platform/authz/policy';
import { formatMoney, todayInZone } from '@/platform/i18n';
import { AdjustmentForm, CloseReconciliationForm, ReverseEntryForm, RunReconciliationForm } from './forms';

export const metadata = { title: 'Libro y conciliación', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ORIGEN: Record<string, string> = {
  PAYMENT: 'Cobro',
  REFUND: 'Devolución',
  MANUAL_ADJUSTMENT: 'Ajuste',
  ASSET_MOVEMENT: 'Patrimonio',
  EXEMPTION: 'Exención',
};

const EXCEPCION: Record<string, string> = {
  UNMATCHED_IN_STRIPE: 'Entró dinero que ningún cobro explica',
  UNMATCHED_IN_LEDGER: 'Cobro confirmado sin asiento en el libro',
  AMOUNT_MISMATCH: 'Los importes no coinciden',
  UNPROCESSED_EVENT: 'Evento de la pasarela sin procesar',
};

/**
 * Libro auxiliar y cortes de conciliación (F3-LIB-001, F3-LIB-002).
 *
 * El libro se lee, no se edita: la pantalla no ofrece ningún botón de editar
 * porque no existe tal cosa, ni aquí ni en la base. Lo que ofrece es revertir,
 * que crea un asiento nuevo y deja los dos a la vista.
 */
export default async function LibroPage() {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'consulta del libro auxiliar' };

  const [libro, cortes, entidades] = await Promise.all([
    ledgerEntries(actor, {}),
    reconciliationList(actor),
    billableEntities(actor),
  ]);

  const puedeAjustar = can(sondeo, 'billing.ledger.adjust', { kind: 'LedgerEntry' }).allowed;
  const puedeConciliar = can(sondeo, 'billing.reconciliation.close', { kind: 'Reconciliation' }).allowed;

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fecha = new Intl.DateTimeFormat(actor.locale, { dateStyle: 'medium', timeZone: actor.timeZone });
  const hoy = todayInZone(actor.timeZone);

  const opcionesDeEntidad = entidades.ok
    ? entidades.data.map((entidad) => ({ id: entidad.id, label: entidad.shortName }))
    : [];
  const opcionesDeCuenta = Object.entries(ACCOUNT_CODES).map(([id, label]) => ({ id, label }));

  return (
    <PageShell
      title="Libro y conciliación"
      description="Todo lo que entró y salió, con su origen. Un asiento no se edita ni se borra: una corrección es un asiento nuevo."
      width="ancha"
    >
      <div className="space-y-10">
        {libro.ok && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-[var(--color-ink-soft)]">Entró</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-success)]">
                {formatMoney(libro.data.totals.creditMinor, 'MXN', formato)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--color-ink-soft)]">Salió</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-danger)]">
                {formatMoney(libro.data.totals.debitMinor, 'MXN', formato)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--color-ink-soft)]">Neto</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatMoney(libro.data.totals.netMinor, 'MXN', formato)}
              </p>
            </Card>
          </div>
        )}

        <Section title="Asientos" level={2} description="Los quinientos más recientes. Los totales de arriba suman todo el periodo, no solo esta lista.">
          {!libro.ok ? (
            <ErrorNotice title={libro.error.message} />
          ) : libro.data.rows.length === 0 ? (
            <EmptyState
              title="El libro está vacío"
              description="Cuando se confirme el primer cobro, su asiento aparecerá aquí. Nada se asienta a mano salvo los ajustes."
            />
          ) : (
            <ScrollableTable caption="Asientos del libro auxiliar, del más reciente al más antiguo">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Fecha</th>
                  <th scope="col" className="p-3 font-medium">Concepto</th>
                  <th scope="col" className="p-3 font-medium">Cuenta</th>
                  <th scope="col" className="p-3 font-medium">Entró</th>
                  <th scope="col" className="p-3 font-medium">Salió</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {libro.data.rows.map((fila) => (
                  <tr key={fila.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3 tabular-nums text-sm">{fecha.format(fila.entryDate)}</td>
                    <td className="p-3">
                      <span className={fila.reversed ? 'line-through decoration-[var(--color-ink-soft)]' : ''}>
                        {fila.description}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                        {ORIGEN[fila.sourceKind] ?? fila.sourceKind}
                        {' · '}
                        {fila.legalEntityShortName}
                      </span>
                      {fila.reason !== null && (
                        <span className="mt-1 block text-sm text-[var(--color-ink-soft)]">{fila.reason}</span>
                      )}
                      {puedeAjustar && !fila.reversed && !fila.isReversal && (
                        <div className="mt-2">
                          <ReverseEntryForm entryId={fila.id} />
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-sm">{fila.accountLabel}</td>
                    <td className="p-3 tabular-nums">
                      {fila.direction === 'CREDIT' ? formatMoney(fila.amountMinor, fila.currency, formato) : '—'}
                    </td>
                    <td className="p-3 tabular-nums">
                      {fila.direction === 'DEBIT' ? formatMoney(fila.amountMinor, fila.currency, formato) : '—'}
                    </td>
                    <td className="p-3">
                      {fila.reversed ? (
                        <Badge tone="warning">Revertido</Badge>
                      ) : fila.isReversal ? (
                        <Badge tone="accent">Corrección</Badge>
                      ) : fila.reconciled ? (
                        <Badge tone="success">Conciliado</Badge>
                      ) : (
                        <Badge tone="neutral">Sin conciliar</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>

        {puedeAjustar && opcionesDeEntidad.length > 0 && (
          <Section
            title="Asentar un ajuste"
            level={2}
            description="Para lo que no viene de un cobro ni de una devolución: una comisión que no quedó registrada, una corrección de cuenta."
          >
            <Card>
              <AdjustmentForm entidades={opcionesDeEntidad} cuentas={opcionesDeCuenta} hoy={hoy} />
            </Card>
          </Section>
        )}

        <Section
          title="Cortes de conciliación"
          level={2}
          description="Comparan lo que el libro dice con lo que la pasarela confirmó. Lo que no cuadra se nombra, no se redondea."
        >
          {!cortes.ok ? (
            <ErrorNotice title={cortes.error.message} />
          ) : cortes.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ningún corte"
              description="Un corte compara un periodo del libro con lo que la pasarela confirmó en ese mismo periodo."
            />
          ) : (
            <div className="space-y-4">
              {cortes.data.map((corte) => (
                <Card key={corte.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {fecha.format(corte.periodStart)} — {fecha.format(new Date(corte.periodEnd.getTime() - 1))}
                      </h3>
                      <p className="text-sm text-[var(--color-ink-soft)]">
                        {corte.legalEntityShortName} · cuenta {corte.stripeAccountKey}
                      </p>
                    </div>
                    <Badge
                      tone={
                        corte.status === 'CLOSED'
                          ? 'neutral'
                          : corte.status === 'BALANCED'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {corte.status === 'CLOSED'
                        ? `Cerrado el ${corte.closedAt === null ? '' : fecha.format(corte.closedAt)}`
                        : corte.status === 'BALANCED'
                          ? 'Cuadra'
                          : 'Con diferencias'}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm text-[var(--color-ink-soft)]">Según el libro</dt>
                      <dd className="tabular-nums">{formatMoney(corte.expectedTotalMinor, 'MXN', formato)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-[var(--color-ink-soft)]">Según la pasarela</dt>
                      <dd className="tabular-nums">{formatMoney(corte.observedTotalMinor, 'MXN', formato)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-[var(--color-ink-soft)]">Diferencia</dt>
                      <dd
                        className={`tabular-nums font-semibold ${
                          corte.differenceMinor === 0n ? '' : 'text-[var(--color-warning)]'
                        }`}
                      >
                        {formatMoney(corte.differenceMinor, 'MXN', formato)}
                      </dd>
                    </div>
                  </dl>

                  {corte.exceptions.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium">Lo que no cuadra</h4>
                      <ul className="mt-2 space-y-2">
                        {corte.exceptions.map((excepcion) => (
                          <li key={excepcion.id} className="rounded-lg border border-[var(--color-line)] p-3">
                            <p className="font-medium">{EXCEPCION[excepcion.kind] ?? excepcion.kind}</p>
                            <p className="text-sm text-[var(--color-ink-soft)]">
                              <span className="font-mono text-xs">{excepcion.reference}</span>
                              {excepcion.amountMinor > 0n && (
                                <> · {formatMoney(excepcion.amountMinor, 'MXN', formato)}</>
                              )}
                            </p>
                            <p className="mt-1 text-sm">{excepcion.detail}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {puedeConciliar && corte.status !== 'CLOSED' && (
                    <div className="mt-4">
                      <CloseReconciliationForm
                        reconciliationId={corte.id}
                        conDiferencias={corte.differenceMinor !== 0n}
                      />
                    </div>
                  )}

                  {corte.status === 'CLOSED' && (
                    <Notice tone="neutral" live="none" title="Corte cerrado">
                      Sus asientos ya no se corrigen dentro de este periodo. Una corrección posterior se asienta en el
                      periodo abierto, que es como se corrige un libro que no se puede reescribir.
                    </Notice>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Section>

        {puedeConciliar && opcionesDeEntidad.length > 0 && (
          <Section title="Correr un corte" level={2}>
            <Card>
              <RunReconciliationForm entidades={opcionesDeEntidad} />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
