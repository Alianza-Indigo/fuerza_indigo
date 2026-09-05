import { Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { honoraryRoster } from '@/modules/membership';
import { can } from '@/platform/authz/policy';
import { RosterView } from '../roster-view';
import { ExportForm } from '../export-form';
import { RosterFilters } from '../roster-filters';

export const metadata = { title: 'Padrón de afiliados honorarios', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Padrón de afiliados honorarios (PRD §7.1; F4-PAD-001).
 *
 * Solo agremiados. No es una vista con un filtro puesto por omisión: la
 * consulta que lo alimenta no admite otra categoría, y por eso no existe la
 * manera de llegar aquí y ver mezclado lo que el PRD manda separar.
 */
export default async function PadronHonorarioPage({
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
  const padron = await honoraryRoster(actor, filtros);
  const puedeExportar = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'membership.roster.export',
    { kind: 'Membership', isBulk: true, containsPersonalData: true },
  ).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Padrón de afiliados honorarios"
      description="Quiénes son afiliados honorarios hoy. Ninguno vota ni aparece ante autoridades."
    >
      <div className="space-y-8">
        {!padron.ok ? (
          <ErrorNotice title={padron.error.message} />
        ) : (
          <>
            <RosterFilters accion="/gestion/afiliacion/padrones/honorarios" q={q} estado={estado} />

            <Section title="Padrón" description={`${padron.data.length} fila(s).`}>
              <RosterView
                filas={padron.data}
                filtrado={(q ?? '') !== '' || (estado ?? '') !== ''}
                vacio={{
                  title: 'Todavía no hay ninguna afiliación honoraria',
                  description: 'Aparecen aquí cuando una solicitud honoraria aprobada se activa.',
                }}
                formatter={formatter}
              />
            </Section>

            <Notice tone="neutral" title="Ninguna de estas personas aparece ante la autoridad laboral">
              <p>
                La afiliación honoraria no concede derechos electorales sindicales ni entra en el padrón que
                se remite a autoridades (PRD §3.3). El modelo lo impide, no solo esta pantalla.
              </p>
            </Notice>

            {puedeExportar && (
              <Section title="Exportar">
                <Card>
                  <ExportForm roster="HONORARY" />
                </Card>
              </Section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
