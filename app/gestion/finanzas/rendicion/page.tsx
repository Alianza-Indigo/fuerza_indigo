import { Card, EmptyState, ErrorNotice, Notice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { accountabilityReport, billableEntities, semesterRange } from '@/modules/billing';
import { db } from '@/platform/db/client';
import { can } from '@/platform/authz/policy';
import { formatMoney } from '@/platform/i18n';
import { ExportLedgerForm } from './export-form';

export const metadata = { title: 'Rendición de cuentas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Rendición de cuentas (F3-LIB-004, F3-LIB-005).
 *
 * Rendir cuentas es un derecho de quien está afiliado, no una concesión de la
 * administración: por eso esta pantalla la alcanza cualquier persona agremiada
 * y no solo quien lleva las finanzas. Lo que enseña son totales por cuenta, sin
 * un solo dato de una persona identificable.
 *
 * La exportación del libro es otra cosa y lleva otro permiso: ahí sí hay
 * detalle, y por eso deja rastro de quién se lo llevó y para qué.
 */
export default async function RendicionPage({
  searchParams,
}: {
  searchParams: Promise<{ entidad?: string; anio?: string; semestre?: string }>;
}) {
  const actor = await currentActor();
  const sondeo = { ...actor, reason: 'consulta de la rendición de cuentas' };
  const { entidad, anio, semestre } = await searchParams;

  const puedeExportar = can(sondeo, 'billing.report.export', { kind: 'LedgerEntry' }).allowed;

  // Las entidades que la persona alcanza. Se resuelven directamente porque
  // `billableEntities` exige la facultad de administrar el catálogo, y aquí
  // entra cualquiera con derecho a rendición de cuentas.
  const entidades = await db().legalEntity.findMany({
    where:
      actor.legalEntityScope.length === 0
        ? { isActive: true }
        : { isActive: true, id: { in: [...actor.legalEntityScope] } },
    orderBy: { code: 'asc' },
    select: { id: true, shortName: true },
  });

  const elegida = entidades.find((fila) => fila.id === entidad) ?? entidades[0];

  const ahora = new Date();
  const año = Number(anio ?? ahora.getUTCFullYear());
  const mitad = semestre === '2' ? 2 : semestre === '1' ? 1 : ahora.getUTCMonth() < 6 ? 1 : 2;
  const periodo = semesterRange(Number.isFinite(año) ? año : ahora.getUTCFullYear(), mitad);

  const reporte =
    elegida === undefined
      ? null
      : await accountabilityReport(actor, { legalEntityId: elegida.id, ...periodo });

  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const paraExportar = puedeExportar ? await billableEntities(actor) : null;

  return (
    <PageShell
      title="Rendición de cuentas"
      description={`Semestre ${String(mitad)} de ${String(año)}. Totales por cuenta, sin ningún dato de una persona identificable.`}
      width="ancha"
    >
      <div className="space-y-10">
        {elegida === undefined ? (
          <EmptyState
            title="No hay ninguna entidad a tu alcance"
            description="La rendición de cuentas se consulta por entidad jurídica, y tu nombramiento no alcanza ninguna."
          />
        ) : reporte === null || !reporte.ok ? (
          <ErrorNotice title={reporte?.ok === false ? reporte.error.message : 'No se pudo preparar el reporte.'} />
        ) : (
          <>
            <nav aria-label="Periodo y entidad" className="flex flex-wrap gap-2">
              {entidades.map((fila) => (
                <a
                  key={fila.id}
                  href={`/gestion/finanzas/rendicion?entidad=${fila.id}&anio=${String(año)}&semestre=${String(mitad)}`}
                  className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 font-medium ${
                    fila.id === elegida.id
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
                      : 'underline underline-offset-4'
                  }`}
                >
                  {fila.shortName}
                </a>
              ))}
              {([1, 2] as const).map((mitadOpcion) => (
                <a
                  key={mitadOpcion}
                  href={`/gestion/finanzas/rendicion?entidad=${elegida.id}&anio=${String(año)}&semestre=${String(mitadOpcion)}`}
                  className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 font-medium ${
                    mitadOpcion === mitad
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
                      : 'underline underline-offset-4'
                  }`}
                >
                  {mitadOpcion === 1 ? 'Primer semestre' : 'Segundo semestre'}
                </a>
              ))}
              <a
                href={`/gestion/finanzas/rendicion?entidad=${elegida.id}&anio=${String(año - 1)}&semestre=${String(mitad)}`}
                className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 underline underline-offset-4"
              >
                {String(año - 1)}
              </a>
            </nav>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Entró</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-success)]">
                  {formatMoney(reporte.data.incomeMinor, reporte.data.currency, formato)}
                </p>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {reporte.data.paymentsCount} {reporte.data.paymentsCount === 1 ? 'cobro' : 'cobros'}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Salió</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-danger)]">
                  {formatMoney(reporte.data.expenseMinor, reporte.data.currency, formato)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Neto del semestre</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(reporte.data.netMinor, reporte.data.currency, formato)}
                </p>
              </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Lo que se dejó de cobrar</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(reporte.data.forgoneMinor, reporte.data.currency, formato)}
                </p>
                <p className="mt-2 text-sm">
                  Becas, exenciones y descuentos aplicados en el periodo, con {reporte.data.exemptionsCount}{' '}
                  {reporte.data.exemptionsCount === 1 ? 'exención total' : 'exenciones totales'}. No es un gasto: es
                  dinero que la organización decidió no cobrar, y por eso no está en el libro pero sí aquí.
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Patrimonio vigente</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(reporte.data.assetsValueMinor, reporte.data.currency, formato)}
                </p>
                <p className="mt-2 text-sm">
                  {reporte.data.assetsCount} {reporte.data.assetsCount === 1 ? 'bien registrado' : 'bienes registrados'},
                  a su valor documentado. No incluye lo que salió del patrimonio.
                </p>
              </Card>
            </div>

            {reporte.data.openDifferences > 0 && (
              <Notice tone="warning" live="none" title="Hay cortes de este periodo sin cerrar y con diferencias">
                {reporte.data.openDifferences}{' '}
                {reporte.data.openDifferences === 1 ? 'corte tiene' : 'cortes tienen'} diferencias que todavía nadie
                ha resuelto. Los números de arriba son los que hay, y esta advertencia forma parte de la rendición:
                presentarlos sin decirlo sería presentar un cuadre que no existe.
              </Notice>
            )}

            <Section title="Por cuenta" level={2}>
              {reporte.data.totals.length === 0 ? (
                <EmptyState
                  title="No hay movimientos en este semestre"
                  description="Ni entradas ni salidas. No es un error: es lo que hay."
                />
              ) : (
                <ScrollableTable caption="Totales por cuenta del catálogo auxiliar en el semestre">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left">
                      <th scope="col" className="p-3 font-medium">Cuenta</th>
                      <th scope="col" className="p-3 font-medium">Entró</th>
                      <th scope="col" className="p-3 font-medium">Salió</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.data.totals.map((fila) => (
                      <tr key={fila.accountCode} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="p-3">{fila.accountLabel}</td>
                        <td className="p-3 tabular-nums">
                          {fila.creditMinor === 0n ? '—' : formatMoney(fila.creditMinor, reporte.data.currency, formato)}
                        </td>
                        <td className="p-3 tabular-nums">
                          {fila.debitMinor === 0n ? '—' : formatMoney(fila.debitMinor, reporte.data.currency, formato)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollableTable>
              )}
            </Section>
          </>
        )}

        {puedeExportar && paraExportar?.ok === true && paraExportar.data.length > 0 && (
          <Section
            title="Exportar el libro"
            level={2}
            description="Con el detalle de cada asiento. Deja constancia de quién lo exportó, cuándo y para qué."
          >
            <Card>
              <ExportLedgerForm
                entidades={paraExportar.data.map((fila) => ({ id: fila.id, label: fila.shortName }))}
                desde={periodo.periodStart}
                hasta={periodo.periodEnd}
              />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
