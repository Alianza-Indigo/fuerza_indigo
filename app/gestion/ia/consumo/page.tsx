import { Badge, Card, EmptyState, ErrorNotice, ForbiddenNotice, Notice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { formatMoney } from '@/platform/i18n';
import { usageByModule } from '@/modules/ai';

export const metadata = { title: 'Consumo de IA', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Nombre legible de cada módulo. Los que no estén se muestran con su clave. */
const MODULO: Record<string, string> = {
  support: 'Entrada de ayuda',
  cases: 'Expedientes',
  content: 'Contenidos',
  membership: 'Afiliación',
  ai: 'IA',
};

const ESTADO: Record<string, string> = {
  SUCCEEDED: 'Con éxito',
  SCHEMA_REJECTED: 'Rechazadas por esquema',
  BLOCKED_BY_POLICY: 'Detenidas por política',
  PROVIDER_ERROR: 'Error del proveedor',
  TIMEOUT: 'Tiempo agotado',
};

/**
 * Consumo, costo y errores de la IA por módulo (criterio 6 de la fase).
 *
 * **Sin contenido.** Esta pantalla enseña cuánto se gastó y cuántas peticiones
 * fallaron, por módulo, y nada de lo que se escribió: la consulta que la alimenta
 * (`ai.usage.read`) no selecciona ninguna columna de texto. Vigilar el gasto no
 * abre las conversaciones.
 */
export default async function ConsumoPage() {
  const actor = await currentActor();
  if (!can(actor, 'ai.usage.read', { kind: 'AiGeneration', legalEntityId: null }).allowed) {
    return (
      <PageShell title="Consumo de IA">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const reporte = await usageByModule(actor);
  const formato = { locale: actor.locale, timeZone: actor.timeZone };
  const fechas = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Consumo de IA"
      description="Cuánto cuesta la IA y qué falla, por módulo. No muestra nada de lo que se escribió: solo cuentas, costo y estados."
      width="ancha"
    >
      {!reporte.ok ? (
        <ErrorNotice title={reporte.error.message} />
      ) : (
        <div className="space-y-8">
          <Notice title="Esta pantalla no muestra contenido" tone="accent" live="none">
            <p>
              Lo que se ve aquí son cuentas y costo, nunca lo que alguien le escribió a un modelo. Leer ese contenido es
              otra facultad, aparte a propósito.
            </p>
          </Notice>

          <Section title="Resumen" description={`Del ${fechas.format(reporte.data.from)} al ${fechas.format(reporte.data.to)}.`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Peticiones</p>
                <p className="text-2xl font-semibold tabular-nums">{reporte.data.totals.requests}</p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Costo</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(reporte.data.totals.costMinor, reporte.data.currency, formato)}
                </p>
                {reporte.data.monthlyCapMinor !== null && (
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Techo mensual: {formatMoney(reporte.data.monthlyCapMinor, reporte.data.currency, formato)}
                  </p>
                )}
              </Card>
              <Card>
                <p className="text-sm text-[var(--color-ink-soft)]">Con algún error</p>
                <p className="text-2xl font-semibold tabular-nums">{reporte.data.totals.errors}</p>
              </Card>
            </div>
          </Section>

          <Section title="Por módulo" description="Cada módulo que ha usado la IA, con su costo y sus fallos.">
            {reporte.data.modules.length === 0 ? (
              <EmptyState
                title="Todavía no hay consumo"
                description="Cuando algún módulo use la IA, aquí aparecerá cuánto costó y qué falló, sin lo que se escribió."
              />
            ) : (
              <ScrollableTable caption="Consumo de IA por módulo: peticiones, tokens, costo y errores, sin contenido">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left">
                    <th scope="col" className="p-3 font-medium">Módulo</th>
                    <th scope="col" className="p-3 font-medium">Peticiones</th>
                    <th scope="col" className="p-3 font-medium">Tokens</th>
                    <th scope="col" className="p-3 font-medium">Costo</th>
                    <th scope="col" className="p-3 font-medium">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.data.modules.map((m) => (
                    <tr key={m.module} className="border-b border-[var(--color-line)] align-top last:border-0">
                      <td className="p-3 font-medium">{MODULO[m.module] ?? m.module}</td>
                      <td className="p-3 tabular-nums">{m.requests}</td>
                      <td className="p-3 tabular-nums text-sm">
                        {(m.promptTokens + m.completionTokens).toLocaleString('es-MX')}
                      </td>
                      <td className="p-3 tabular-nums">{formatMoney(m.costMinor, reporte.data.currency, formato)}</td>
                      <td className="p-3">
                        {m.errors === 0 ? (
                          <span className="text-sm text-[var(--color-ink-faint)]">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {(['PROVIDER_ERROR', 'TIMEOUT', 'SCHEMA_REJECTED', 'BLOCKED_BY_POLICY'] as const)
                              .filter((s) => m.byStatus[s] > 0)
                              .map((s) => (
                                <Badge key={s} tone="warning">
                                  {ESTADO[s]}: {m.byStatus[s]}
                                </Badge>
                              ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ScrollableTable>
            )}
          </Section>
        </div>
      )}
    </PageShell>
  );
}
