import Link from 'next/link';
import { Badge, Card, PageShell } from '@/design-system/primitives';
import { healthReport } from '@/platform/health';
import { systemOverview } from '@/modules/admin';

export const metadata = { title: 'Estado general', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Tablero técnico del Superadmin (PRD §6.5).
 *
 * Abre con lo accionable, no con métricas decorativas: qué está fallando, qué
 * está degradado y qué hay que atender. Las cifras son conteos agregados; esta
 * pantalla no muestra ni un solo dato personal.
 */
export default async function SuperadminHomePage() {
  const [health, overview] = await Promise.all([healthReport(), systemOverview()]);

  const failing = health.checks.filter((check) => check.status === 'failed');
  const degraded = health.checks.filter((check) => check.status === 'degraded');

  return (
    <PageShell
      title="Estado general del sistema"
      description="Configuración técnica y operación. Este acceso no concede derechos sindicales ni alcanza expedientes."
    >
      <div className="space-y-8">
        {failing.length > 0 && (
          <Card className="border-[var(--color-danger)]">
            <h2 className="text-lg font-semibold text-[var(--color-danger)]">Requiere atención inmediata</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {failing.map((check) => (
                <li key={check.name}>
                  <span className="font-medium">{check.name.replace(/_/g, ' ')}:</span> {check.detail}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {degraded.length > 0 && (
          <Card>
            <h2 className="text-lg font-semibold">Funcionando con limitaciones</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {degraded.map((check) => (
                <li key={check.name}>
                  <span className="font-medium">{check.name.replace(/_/g, ' ')}:</span> {check.detail}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Datos base</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Entidades jurídicas" value={overview.legalEntities} />
            <Metric label="Unidades territoriales" value={overview.territorialUnits} />
            <Metric label="Roles" value={overview.roles} />
            <Metric label="Permisos" value={overview.permissions} />
            <Metric label="Cuentas activas" value={overview.activeUsers} />
            <Metric label="Cuentas invitadas" value={overview.invitedUsers} />
            <Metric label="Nombramientos vigentes" value={overview.liveRoleAssignments} />
            <Metric label="Eventos de auditoría" value={overview.auditEvents} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Salud técnica</h2>
          <Card>
            <div className="flex items-center gap-3">
              <Badge tone={health.status === 'ok' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger'}>
                {health.status === 'ok' ? 'Todo en orden' : health.status === 'degraded' ? 'Con limitaciones' : 'Con fallos'}
              </Badge>
              <span className="text-sm text-[var(--color-ink-soft)]">
                {health.checks.length} comprobaciones ejecutadas
              </span>
            </div>
            <p className="mt-3 text-sm">
              <Link href="/superadmin/salud" className="underline underline-offset-4">
                Ver el detalle de cada comprobación
              </Link>
            </p>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Módulos de fases posteriores</h2>
          <Card>
            <p className="text-sm text-[var(--color-ink-soft)]">
              Catálogo y cobros, contenidos públicos, herramientas, CIAN, CENI e inteligencia artificial se
              incorporan en sus fases correspondientes. Esta pantalla no los anuncia todavía, porque anunciar
              lo que aún no existe no le sirve a nadie: cuando existan, aparecerán aquí en funcionamiento.
            </p>
          </Card>
        </section>
      </div>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString('es-MX')}</p>
    </Card>
  );
}
