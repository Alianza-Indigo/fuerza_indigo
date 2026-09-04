import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { healthReport } from '@/platform/health';
import { siteReport } from '@/platform/analytics';
import { currentActor } from '@/platform/http/request-context';

export const metadata = { title: 'Salud técnica', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const actor = await currentActor();
  const [report, medicion] = await Promise.all([healthReport(), siteReport(actor, { dias: 7 })]);
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' });
  const numero = new Intl.NumberFormat('es-MX');

  return (
    <PageShell
      title="Salud técnica"
      description="Cada comprobación responde a una pregunta concreta que alguien tendría que hacerse ante un incidente."
    >
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={report.status === 'ok' ? 'success' : report.status === 'degraded' ? 'warning' : 'danger'}>
              {report.status === 'ok' ? 'Todo en orden' : report.status === 'degraded' ? 'Con limitaciones' : 'Con fallos'}
            </Badge>
            <span className="text-sm text-[var(--color-ink-soft)]">
              Verificado el {formatter.format(new Date(report.checkedAt))}
            </span>
          </div>
        </Card>

        <ScrollableTable>
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Comprobación</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
              <th scope="col" className="p-3 font-medium">Detalle</th>
              <th scope="col" className="p-3 font-medium">Duración</th>
            </tr>
          </thead>
          <tbody>
            {report.checks.map((check) => (
              <tr key={check.name} className="border-b border-[var(--color-line)] last:border-0">
                <td className="p-3 font-medium">{check.name.replace(/_/g, ' ')}</td>
                <td className="p-3">
                  <Badge tone={check.status === 'ok' ? 'success' : check.status === 'degraded' ? 'warning' : 'danger'}>
                    {check.status === 'ok' ? 'Correcto' : check.status === 'degraded' ? 'Limitado' : 'Fallo'}
                  </Badge>
                </td>
                <td className="p-3 text-sm">{check.detail}</td>
                <td className="p-3 tabular-nums text-sm">{check.durationMs} ms</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>

        <Section
          title="Uso del sitio público, últimos siete días"
          description="Medición agregada: contadores por hora, sin identificadores, sin cookies y sin el texto de las búsquedas. El tráfico automatizado se cuenta aparte y no entra en el resto."
          level={2}
        >
          {!medicion.ok ? (
            <ErrorNotice title={medicion.error.message} />
          ) : medicion.data.paginasVistas === 0 && medicion.data.visitasDeRastreadores === 0 ? (
            <EmptyState
              title="Todavía no hay nada medido"
              description="Los contadores empiezan en la primera visita al sitio público después de este despliegue."
            />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { etiqueta: 'Páginas vistas', valor: medicion.data.paginasVistas },
                  { etiqueta: 'Búsquedas con resultados', valor: medicion.data.busquedasConResultados },
                  { etiqueta: 'Búsquedas sin resultados', valor: medicion.data.busquedasSinResultados },
                  { etiqueta: 'Preferencias guardadas', valor: medicion.data.preferenciasGuardadas },
                  { etiqueta: 'Pantallas de sin conexión', valor: medicion.data.pantallasSinConexion },
                  { etiqueta: 'Visitas de rastreadores', valor: medicion.data.visitasDeRastreadores },
                ].map((dato) => (
                  <Card key={dato.etiqueta}>
                    <p className="text-sm text-[var(--color-ink-soft)]">{dato.etiqueta}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{numero.format(dato.valor)}</p>
                  </Card>
                ))}
              </div>

              {medicion.data.busquedasSinResultados > 0 && (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Las búsquedas sin resultados son la señal editorial más útil de esta tabla: dicen qué está buscando
                  la gente que el sitio todavía no explica.
                </p>
              )}

              {medicion.data.porRuta.length > 0 && (
                <ScrollableTable caption="Páginas vistas por ruta, sin contar rastreadores">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-left">
                      <th scope="col" className="p-3 font-medium">Ruta</th>
                      <th scope="col" className="p-3 font-medium">Vistas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicion.data.porRuta.map((fila) => (
                      <tr key={fila.route} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="p-3 font-mono text-sm">{fila.route}</td>
                        <td className="p-3 tabular-nums">{numero.format(fila.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollableTable>
              )}
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
