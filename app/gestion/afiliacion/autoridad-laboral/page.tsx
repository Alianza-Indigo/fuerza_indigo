import { Badge, Card, EmptyState, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { authorityFilings, authorityRoster } from '@/modules/membership';
import { can } from '@/platform/authz/policy';
import { ESTADO_DE_TRAMITE, MOVIMIENTO } from '../padrones/etiquetas';
import { RosterView } from '../padrones/roster-view';
import { ExportForm } from '../padrones/export-form';
import { FilingForm } from './filing-form';

export const metadata = { title: 'Autoridad laboral', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Obligaciones ante la autoridad laboral (PRD §8.1 paso 14, §9.7; F4-PAD-004).
 *
 * Dos cosas distintas en una pantalla, y conviene decir por qué están juntas:
 * arriba, **lo que hay que informar** —cada alta y cada baja, con cuánto lleva
 * esperando—; abajo, **el padrón que se remite**, que es la foto de quién es
 * agremiado activo hoy. Separarlas obligaría a cruzar dos pantallas para
 * responder la única pregunta que importa aquí: si la organización está al
 * corriente.
 *
 * La plataforma **no declara cumplida** ninguna obligación (PRD §9.6). Registra
 * lo que se preparó, se presentó y se acusó, con su referencia.
 */
export default async function AutoridadLaboralPage() {
  const actor = await currentActor();

  const [tramites, padron] = await Promise.all([authorityFilings(actor), authorityRoster(actor)]);
  const puedeTramitar = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'membership.authority_filing.manage',
    { kind: 'LabourAuthorityFiling' },
  ).allowed;
  const puedeExportar = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'membership.roster.export',
    { kind: 'Membership', isBulk: true, containsPersonalData: true },
  ).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  const pendientes = tramites.ok
    ? tramites.data.filter((uno) => uno.status !== 'ACKNOWLEDGED' && uno.status !== 'NOT_REQUIRED')
    : [];
  const cerrados = tramites.ok
    ? tramites.data.filter((uno) => uno.status === 'ACKNOWLEDGED' || uno.status === 'NOT_REQUIRED')
    : [];

  return (
    <PageShell
      title="Autoridad laboral"
      description="Altas y bajas por informar, y el padrón que se remite. La plataforma no declara cumplida ninguna obligación."
    >
      <div className="space-y-8">
        {!tramites.ok ? (
          <ErrorNotice title={tramites.error.message} />
        ) : (
          <>
            <Section
              title="Por informar"
              description={
                pendientes.length === 0
                  ? 'Nada pendiente.'
                  : `${pendientes.length} movimiento(s) esperando trámite.`
              }
            >
              {pendientes.length === 0 ? (
                <EmptyState
                  title="No hay nada pendiente de informar"
                  description="Cada alta y cada baja del padrón sindical abre aquí su expediente en cuanto ocurre."
                />
              ) : (
                <ol className="space-y-4">
                  {pendientes.map((tramite) => (
                    <li key={tramite.id}>
                      <Card>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">
                              {MOVIMIENTO[tramite.kind] ?? tramite.kind} · {tramite.personName}
                            </h3>
                            <p className="font-mono text-xs text-[var(--color-ink-soft)]">
                              {tramite.memberNumber} · {tramite.publicId}
                            </p>
                          </div>
                          <Badge tone={(tramite.daysOpen ?? 0) > 30 ? 'danger' : 'warning'}>
                            {ESTADO_DE_TRAMITE[tramite.status] ?? tramite.status}
                          </Badge>
                        </div>

                        <p className="mt-3 text-sm">
                          Ocurrió el {formatter.format(tramite.occurredAt)}
                          {tramite.daysOpen === null
                            ? ''
                            : ` · lleva ${tramite.daysOpen} día(s) esperando`}
                        </p>

                        {puedeTramitar && (
                          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                            <FilingForm filingId={tramite.id} />
                          </div>
                        )}
                      </Card>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {cerrados.length > 0 && (
              <Section title="Ya tramitados" description={`${cerrados.length} movimiento(s).`}>
                <ol className="space-y-3">
                  {cerrados.map((tramite) => (
                    <li key={tramite.id} className="rounded-lg border border-[var(--color-line)] p-4">
                      <p className="font-medium">
                        {MOVIMIENTO[tramite.kind] ?? tramite.kind} · {tramite.personName}
                      </p>
                      <p className="mt-1 text-sm">
                        {ESTADO_DE_TRAMITE[tramite.status] ?? tramite.status}
                        {tramite.authorityReference === null
                          ? ''
                          : ` · referencia ${tramite.authorityReference}`}
                        {tramite.acknowledgedAt === null
                          ? ''
                          : ` · ${formatter.format(tramite.acknowledgedAt)}`}
                      </p>
                      {tramite.notes !== null && <p className="mt-1 text-sm">{tramite.notes}</p>}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </>
        )}

        <Section
          title="Padrón que se remite"
          description="Solo membresías activas de una calidad que aparece ante autoridades."
        >
          {!padron.ok ? (
            <ErrorNotice title={padron.error.message} />
          ) : (
            <>
              <RosterView
                filas={padron.data}
                filtrado={false}
                vacio={{
                  title: 'El padrón que se remite está vacío',
                  description: 'Solo entran agremiados con membresía activa.',
                }}
                formatter={formatter}
              />
              <Notice tone="neutral" title="Una afiliación honoraria nunca entra aquí">
                <p>
                  El PRD §3.3 dice que un afiliado honorario no aparece como agremiado ante autoridades, y el
                  modelo lo garantiza con una comprobación en base: no depende de esta pantalla.
                </p>
              </Notice>
            </>
          )}
        </Section>

        {puedeExportar && (
          <Section title="Exportar el padrón que se remite">
            <Card>
              <ExportForm roster="AUTHORITY" />
            </Card>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
