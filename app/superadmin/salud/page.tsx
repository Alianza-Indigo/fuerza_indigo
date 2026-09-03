import { Badge, Card, PageShell, ScrollableTable } from '@/design-system/primitives';
import { healthReport } from '@/platform/health';

export const metadata = { title: 'Salud técnica', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const report = await healthReport();
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' });

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
      </div>
    </PageShell>
  );
}
