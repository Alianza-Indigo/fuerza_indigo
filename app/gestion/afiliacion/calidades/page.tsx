import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { membershipTypeFormOptions, membershipTypeList } from '@/modules/membership';
import { can } from '@/platform/authz/policy';
import { QualityForm } from './quality-form';

export const metadata = { title: 'Calidades de membresía', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Catálogo de calidades (PRD §3.2, §3.3).
 *
 * Es la pantalla donde se ve, de un vistazo, quién vota y quién no. Esa columna
 * no está por completitud: el criterio del PRD §24 Fase 4 pide que un afiliado
 * honorario no obtenga voto **por error**, y un error empieza por no poder mirar
 * quién lo tiene.
 */
export default async function CalidadesPage() {
  const actor = await currentActor();
  const puedeAdministrar = can(actor, 'membership.type.manage', { kind: 'MembershipType' }).allowed;

  const [calidades, opciones] = await Promise.all([
    membershipTypeList(actor),
    puedeAdministrar ? membershipTypeFormOptions(actor) : Promise.resolve(null),
  ]);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Calidades de membresía"
      description="Qué calidades existen y qué concede cada una. Los importes los fija el catálogo de cobros; aquí solo se elige con qué concepto se cobra."
    >
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Calidades</h2>
          {!calidades.ok ? (
            <ErrorNotice title={calidades.error.message} />
          ) : calidades.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna calidad"
              description="Crea la primera con el formulario de abajo."
            />
          ) : (
            <ScrollableTable>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Calidad</th>
                  <th scope="col" className="p-3 font-medium">Entidad</th>
                  <th scope="col" className="p-3 font-medium">Derechos</th>
                  <th scope="col" className="p-3 font-medium">Cobro</th>
                  <th scope="col" className="p-3 font-medium">Vigencia</th>
                  <th scope="col" className="p-3 font-medium">Membresías</th>
                </tr>
              </thead>
              <tbody>
                {calidades.data.map((calidad) => (
                  <tr key={calidad.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                    <td className="p-3">
                      {puedeAdministrar ? (
                        <Link
                          href={`/gestion/afiliacion/calidades/${calidad.id}`}
                          className="font-medium underline underline-offset-4"
                        >
                          {calidad.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{calidad.name}</span>
                      )}
                      <span className="block font-mono text-xs text-[var(--color-ink-soft)]">{calidad.code}</span>
                      {!calidad.isActive && (
                        <span className="mt-1 block text-xs">No admite solicitudes nuevas</span>
                      )}
                    </td>
                    <td className="p-3">{calidad.legalEntity}</td>
                    <td className="p-3">
                      {calidad.category === 'UNION_MEMBER' ? (
                        <span className="space-x-1">
                          {calidad.grantsPoliticalRights ? (
                            <Badge tone="success">Vota</Badge>
                          ) : (
                            <Badge tone="neutral">Sin voto</Badge>
                          )}
                          {calidad.countsForQuorum && <Badge tone="accent">Quórum</Badge>}
                          {calidad.appearsInAuthorityRoster && <Badge tone="warning">Padrón oficial</Badge>}
                        </span>
                      ) : (
                        <Badge tone="neutral">Honoraria · sin derechos políticos</Badge>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {calidad.requiresPayment ? (calidad.catalogProduct ?? 'Exige pago, sin concepto') : 'Sin costo'}
                    </td>
                    <td className="p-3 text-sm">
                      {calidad.durationMonths === null
                        ? 'Mientras no se dé de baja'
                        : `${calidad.durationMonths} meses`}
                      <span className="block text-xs text-[var(--color-ink-soft)]">
                        Rige desde {formatter.format(calidad.effectiveFrom)}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">{calidad.liveMemberships}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Crear una calidad</h2>
          {!puedeAdministrar || opciones === null ? (
            <ErrorNotice title="No tienes facultades para administrar el catálogo de calidades">
              <p>Consultarlo y modificarlo son cosas distintas.</p>
            </ErrorNotice>
          ) : !opciones.ok ? (
            <ErrorNotice title={opciones.error.message} />
          ) : (
            <Card>
              <QualityForm
                entidades={opciones.data.legalEntities.map((entidad) => ({
                  value: entidad.id,
                  label: entidad.name,
                }))}
                conceptos={opciones.data.catalogProducts.map((producto) => ({
                  value: producto.id,
                  label: `${producto.name} (${producto.code})`,
                }))}
              />
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
