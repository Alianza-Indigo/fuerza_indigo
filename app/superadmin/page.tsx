import Link from 'next/link';
import { Badge, Card, PageShell } from '@/design-system/primitives';
import { healthReport } from '@/platform/health';
import { systemOverview } from '@/modules/admin';
import { SUPERADMIN_NAVIGATION } from './navigation';

export const metadata = { title: 'Centro de control', robots: { index: false, follow: false } };
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
      title="Centro de control"
      description="Resumen operativo y acceso directo a toda la plataforma."
    >
      <div className="space-y-8">
        {failing.length > 0 && (
          <Card tone="danger">
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
          <h2 className="mb-3 text-lg font-semibold">Accesos rápidos</h2>
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: '/superadmin/puesta-en-marcha', label: 'Configuración inicial', detail: 'Entidad, reglas y estructura de arranque.' },
                { href: '/gestion/registro', label: 'Registro de personas', detail: 'Personas, cuentas y datos maestros.' },
                { href: '/gestion/afiliacion/solicitudes', label: 'Solicitudes de afiliación', detail: 'Revisión y resolución de nuevas solicitudes.' },
                { href: '/casos', label: 'Todos los expedientes', detail: 'Vista global de casos y alertas.' },
                { href: '/institucional/asambleas', label: 'Asambleas', detail: 'Convocatorias, quórum y acuerdos.' },
                { href: '/gestion/finanzas', label: 'Finanzas', detail: 'Cobros, pagos, libro y rendición.' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border border-[var(--color-line)] p-3 no-underline hover:bg-[var(--color-indigo-50)]"
                >
                  <span className="block font-medium">{item.label}</span>
                  <span className="mt-1 block text-sm text-[var(--color-ink-soft)]">{item.detail}</span>
                </Link>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Datos base</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Entidades jurídicas" value={overview.legalEntities} />
            <Metric label="Unidades territoriales" value={overview.territorialUnits} />
            <Metric label="Roles" value={overview.roles} />
            <Metric label="Permisos" value={overview.permissions} />
            <Metric label="Cuentas activas" value={overview.activeUsers} />
            <Metric label="Cuentas invitadas" value={overview.invitedUsers} />
            <Metric label="Embajadores activos" value={overview.activeAmbassadors} />
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
          <h2 className="mb-3 text-lg font-semibold">Mapa completo de la plataforma</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Las mismas rutas del menú lateral, agrupadas por función para localizar cualquier área rápidamente.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SUPERADMIN_NAVIGATION.map((group) => (
              <Card key={group.label}>
                <h3 className="mb-2 font-semibold">{group.label}</h3>
                <ul className="space-y-1 text-sm">
                  {group.links.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="underline underline-offset-4 hover:no-underline">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
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
