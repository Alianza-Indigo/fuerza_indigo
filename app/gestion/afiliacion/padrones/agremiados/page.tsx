import { Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { unionRoster } from '@/modules/membership';
import { can } from '@/platform/authz/policy';
import { RosterView } from '../roster-view';
import { ExportForm } from '../export-form';
import { RosterFilters } from '../roster-filters';

export const metadata = { title: 'Padrón de agremiados', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Padrón de agremiados (PRD §7.1; F4-PAD-001).
 *
 * Solo agremiados. No es una vista con un filtro puesto por omisión: la
 * consulta que lo alimenta no admite otra categoría, y por eso no existe la
 * manera de llegar aquí y ver mezclado lo que el PRD manda separar.
 */
export default async function PadronDeAgremiadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { q, estado } = await searchParams;
  const actor = await currentActor();

  const filtros = {
    ...(q === undefined || q === '' ? {} : { query: q }),
    ...(estado === undefined || estado === '' ? {} : { status: estado as 'ACTIVE' }),
  };
  const padron = await unionRoster(actor, filtros);
  const puedeExportar = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'membership.roster.export',
    { kind: 'Membership', isBulk: true, containsPersonalData: true },
  ).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Padrón de agremiados"
      description="Quiénes son agremiados hoy, con su número de miembro y su calidad exacta."
    >
      <div className="space-y-8">
        {!padron.ok ? (
          <ErrorNotice title={padron.error.message} />
        ) : (
          <>
            <RosterFilters accion="/gestion/afiliacion/padrones/agremiados" q={q} estado={estado} />

            <Section title="Padrón" description={`${padron.data.length} fila(s).`}>
              <RosterView
                filas={padron.data}
                filtrado={(q ?? '') !== '' || (estado ?? '') !== ''}
                vacio={{
                  title: 'Todavía no hay ningún agremiado',
                  description: 'Aparecen aquí cuando una solicitud aprobada se activa.',
                }}
                formatter={formatter}
              />
            </Section>

            <Notice tone="neutral" title="Este padrón no es el que se remite a la autoridad">
              <p>
                El que se remite es más estrecho: solo membresías activas de una calidad que aparece ante
                autoridades. Está en la sección de autoridad laboral.
              </p>
            </Notice>

            {puedeExportar && (
              <Section title="Exportar">
                <Card>
                  <ExportForm roster="UNION" />
                </Card>
              </Section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
