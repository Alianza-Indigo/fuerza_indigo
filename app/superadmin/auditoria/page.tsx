import { Badge, Card, EmptyState, ErrorNotice, NoResults, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { queryAuditEvents, querySecurityEvents } from '@/modules/audit';

export const metadata = { title: 'Auditoría', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Visor de bitácoras (PRD §20.4).
 *
 * Filtra por el alcance del actor: quien mira no ve todo el sistema, ve su
 * ámbito. La columna de posición en la cadena permite detectar un hueco a
 * simple vista, que es de lo que sirve encadenar.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await currentActor();

  const objectKind = typeof params['objectKind'] === 'string' ? params['objectKind'] : undefined;
  const outcomeParam = typeof params['outcome'] === 'string' ? params['outcome'] : undefined;
  const outcome =
    outcomeParam === 'SUCCESS' || outcomeParam === 'DENIED' || outcomeParam === 'FAILED' ? outcomeParam : undefined;
  const hasFilters = objectKind !== undefined || outcome !== undefined;

  const [audit, security] = await Promise.all([
    queryAuditEvents(actor, {
      limit: 50,
      ...(objectKind === undefined ? {} : { objectKind }),
      ...(outcome === undefined ? {} : { outcome }),
    }),
    querySecurityEvents(actor, { limit: 25 }),
  ]);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <PageShell
      title="Auditoría"
      description="Bitácora institucional y de seguridad. Los eventos son anexables: la base impide modificarlos o borrarlos."
    >
      <div className="space-y-8">
        <Card>
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label htmlFor="objectKind" className="block text-sm font-medium">
                Tipo de objeto
              </label>
              <input
                id="objectKind"
                name="objectKind"
                defaultValue={objectKind ?? ''}
                className="min-h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="outcome" className="block text-sm font-medium">
                Resultado
              </label>
              <select
                id="outcome"
                name="outcome"
                defaultValue={outcome ?? ''}
                className="min-h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
              >
                <option value="">Cualquiera</option>
                <option value="SUCCESS">Correcto</option>
                <option value="DENIED">Denegado</option>
                <option value="FAILED">Fallido</option>
              </select>
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-[var(--color-indigo-600)] px-5 py-2.5 font-medium text-white"
            >
              Filtrar
            </button>
            {hasFilters && (
              <a href="/superadmin/auditoria" className="min-h-11 py-2.5 text-sm underline underline-offset-4">
                Quitar filtros
              </a>
            )}
          </form>
        </Card>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Bitácora institucional</h2>
          {!audit.ok ? (
            <ErrorNotice title={audit.error.message} />
          ) : audit.data.items.length === 0 ? (
            hasFilters ? (
              <NoResults
                action={
                  <a href="/superadmin/auditoria" className="underline underline-offset-4">
                    Quitar filtros
                  </a>
                }
              />
            ) : (
              <EmptyState
                title="Todavía no hay eventos registrados"
                description="La bitácora se llena sola conforme ocurren actos en el sistema. Un sistema recién instalado la tiene vacía."
              />
            )
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Cuándo</th>
                  <th scope="col" className="p-3 font-medium">Acción</th>
                  <th scope="col" className="p-3 font-medium">Objeto</th>
                  <th scope="col" className="p-3 font-medium">Actor</th>
                  <th scope="col" className="p-3 font-medium">Resultado</th>
                  <th scope="col" className="p-3 font-medium">Cadena</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((event) => (
                  <tr key={event.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 tabular-nums">{formatter.format(event.occurredAt)}</td>
                    <td className="p-3 font-mono text-xs">{event.action}</td>
                    <td className="p-3 text-xs">
                      {event.objectKind}
                      <span className="block text-[var(--color-ink-soft)]">{event.objectId.slice(0, 8)}…</span>
                    </td>
                    <td className="p-3">{event.actorLabel}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          event.outcome === 'SUCCESS' ? 'success' : event.outcome === 'DENIED' ? 'warning' : 'danger'
                        }
                      >
                        {event.outcome === 'SUCCESS' ? 'Correcto' : event.outcome === 'DENIED' ? 'Denegado' : 'Fallido'}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums text-xs">#{event.chainSequence}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Bitácora de seguridad</h2>
          {!security.ok ? (
            <ErrorNotice title={security.error.message} />
          ) : security.data.items.length === 0 ? (
            <EmptyState
              title="Sin eventos de seguridad"
              description="Aquí aparecen accesos, intentos fallidos, límites de tasa y denegaciones."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Cuándo</th>
                  <th scope="col" className="p-3 font-medium">Tipo</th>
                  <th scope="col" className="p-3 font-medium">Sujeto</th>
                  <th scope="col" className="p-3 font-medium">Gravedad</th>
                </tr>
              </thead>
              <tbody>
                {security.data.items.map((event) => (
                  <tr key={event.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 tabular-nums">{formatter.format(event.occurredAt)}</td>
                    <td className="p-3 font-mono text-xs">{event.kind}</td>
                    <td className="p-3 font-mono text-xs">{event.subjectLabel ?? '—'}</td>
                    <td className="p-3">
                      <Badge
                        tone={
                          event.severity === 'CRITICAL' ? 'danger' : event.severity === 'WARNING' ? 'warning' : 'neutral'
                        }
                      >
                        {event.severity === 'CRITICAL' ? 'Crítica' : event.severity === 'WARNING' ? 'Aviso' : 'Informativa'}
                      </Badge>
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
