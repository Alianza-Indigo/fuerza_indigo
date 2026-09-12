import Link from 'next/link';
import { Badge, Card, PageShell } from '@/design-system/primitives';
import { healthReport } from '@/platform/health';
import { systemOverview } from '@/modules/admin';
import { SECCIONES as SECCIONES_GESTION } from '../gestion/secciones';
import { SECCIONES as SECCIONES_INSTITUCIONAL } from '../institucional/secciones';

/**
 * Directorio de áreas para el acceso total de la raíz (ADR-0174): cada pantalla
 * de administración, enlazada directamente desde el panel. Las listas se toman
 * de las mismas fuentes que arman la navegación de cada área, así que no se
 * desincronizan.
 */
const AREAS = [
  { titulo: 'Gestión', enlaces: SECCIONES_GESTION.map((s) => ({ href: s.href, label: s.label })) },
  { titulo: 'Institucional', enlaces: SECCIONES_INSTITUCIONAL.map((s) => ({ href: s.href, label: s.label })) },
  { titulo: 'Casos y apoyo', enlaces: [{ href: '/casos', label: 'Casos y protección' }] },
] as const;

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
      description="Acceso total a la plataforma y a todas sus áreas de administración."
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
          <h2 className="mb-3 text-lg font-semibold">Primeros pasos</h2>
          <Card>
            <p className="text-sm text-[var(--color-ink-soft)]">
              Si esta es una instalación nueva, completa la entidad, los avisos, las reglas constitutivas y el primer nombramiento en un solo recorrido.
            </p>
            <Link href="/superadmin/puesta-en-marcha" className="mt-3 inline-block font-medium underline underline-offset-4">
              Abrir puesta en marcha
            </Link>
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
          <h2 className="mb-3 text-lg font-semibold">Áreas de administración</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Acceso total: todas las pantallas de la organización, enlazadas directamente.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AREAS.map((area) => (
              <Card key={area.titulo}>
                <h3 className="mb-2 font-semibold">{area.titulo}</h3>
                <ul className="space-y-1 text-sm">
                  {area.enlaces.map((enlace) => (
                    <li key={enlace.href}>
                      <Link href={enlace.href} className="underline underline-offset-4 hover:no-underline">
                        {enlace.label}
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
