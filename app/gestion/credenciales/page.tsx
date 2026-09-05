import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  NoResults,
  PageShell,
  ScrollableTable,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { credentialRegistry, verificationSummary } from '@/modules/membership';
import { searchPeople } from '@/modules/identity';
import { listLegalEntities } from '@/modules/admin';
import { can } from '@/platform/authz/policy';
import { codigoLegible } from '@/platform/credentials/design';
import { ETIQUETA_DE_ESTADO, ETIQUETA_DE_TIPO } from '../../(publico)/verificar/etiquetas';
import { ESTADOS } from './etiquetas';
import { IssueForm, ReplaceForm, RevokeForm } from './credential-forms';

export const metadata = { title: 'Credenciales', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Ventana del resumen de consultas: treinta días. */
const DIAS = 30;

/**
 * Credenciales emitidas, su estado y el uso del verificador
 * (PRD §7.4; F4-CRE-001, F4-CRE-003, F4-CRE-004).
 *
 * El estado que se lista es el **vigente**, calculado al leer: una credencial
 * cuya membresía se suspendió ayer aparece suspendida aunque su fila siga
 * diciendo «activa». Lo contrario haría que esta pantalla y el verificador
 * público dijeran cosas distintas de la misma credencial, y quien gestiona
 * confiaría en la que tiene delante.
 */
export default async function CredencialesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; estado?: string }>;
}) {
  const parametros = await searchParams;
  const actor = await currentActor();

  const filtros = {
    ...(parametros.q ? { query: parametros.q } : {}),
    ...(parametros.tipo ? { kind: parametros.tipo as 'UNION_MEMBER' } : {}),
    ...(parametros.estado ? { status: parametros.estado as 'ACTIVE' } : {}),
  };

  const puedeEmitir = can(
    { ...actor, reason: 'comprobación de facultades para mostrar la sección' },
    'credentialing.credential.issue',
    { kind: 'MemberCredential' },
  ).allowed;

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DIAS * 24 * 60 * 60 * 1000);
  const [credenciales, consultas, personas, entidades] = await Promise.all([
    credentialRegistry(actor, filtros),
    verificationSummary(actor, desde),
    puedeEmitir ? searchPeople(actor, { limit: 200 }) : Promise.resolve(null),
    puedeEmitir ? listLegalEntities(actor) : Promise.resolve(null),
  ]);

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const hayFiltro = Object.keys(filtros).length > 0;

  return (
    <PageShell
      title="Credenciales"
      description="Qué credenciales existen, cómo están hoy y cuánto se usa el verificador público."
    >
      <div className="space-y-8">
        {!credenciales.ok ? (
          <ErrorNotice title={credenciales.error.message} />
        ) : (
          <>
            <section>
              <form action="/gestion/credenciales" method="get" className="flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1 space-y-1.5">
                  <label htmlFor="q" className="block text-sm font-medium">
                    Nombre, código o número de miembro
                  </label>
                  <input
                    id="q"
                    name="q"
                    defaultValue={parametros.q ?? ''}
                    className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="tipo" className="block text-sm font-medium">Tipo</label>
                  <select
                    id="tipo"
                    name="tipo"
                    defaultValue={parametros.tipo ?? ''}
                    className="min-h-11 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
                  >
                    <option value="">Todos</option>
                    {Object.entries(ETIQUETA_DE_TIPO).map(([valor, etiqueta]) => (
                      <option key={valor} value={valor}>{etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="estado" className="block text-sm font-medium">Estado</label>
                  <select
                    id="estado"
                    name="estado"
                    defaultValue={parametros.estado ?? ''}
                    className="min-h-11 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3"
                  >
                    <option value="">Todos</option>
                    {ESTADOS.map((uno) => (
                      <option key={uno.value} value={uno.value}>{uno.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="min-h-11 rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-ink-inverse)]"
                >
                  Filtrar
                </button>
              </form>
            </section>

            {credenciales.data.length === 0 ? (
              hayFiltro ? (
                <NoResults hint="Hay credenciales emitidas, pero ninguna coincide con estos filtros." />
              ) : (
                <EmptyState
                  title="Todavía no hay credenciales emitidas"
                  description="Las de agremiado y honoraria se emiten solas al activarse cada membresía. Las de cargo y las profesionales se emiten desde aquí."
                />
              )
            ) : (
              <Section title={`${credenciales.data.length} credencial(es)`}>
                <ScrollableTable caption="Credenciales emitidas, con su estado vigente.">
                  <thead className="border-b border-[var(--color-line)] text-left">
                    <tr>
                      <th scope="col" className="p-3 font-medium">Titular</th>
                      <th scope="col" className="p-3 font-medium">Tipo</th>
                      <th scope="col" className="p-3 font-medium">Código</th>
                      <th scope="col" className="p-3 font-medium">Estado</th>
                      <th scope="col" className="p-3 font-medium">Vigencia</th>
                      <th scope="col" className="p-3 font-medium">Qué se puede hacer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credenciales.data.map((credencial) => {
                      const estado = ETIQUETA_DE_ESTADO[credencial.status];
                      return (
                        <tr
                          key={credencial.publicCode}
                          className="border-b border-[var(--color-line)] align-top last:border-0"
                        >
                          <td className="p-3">
                            <p className="font-medium">{credencial.displayName}</p>
                            {credencial.memberNumber !== null && (
                              <p className="font-mono text-sm text-[var(--color-ink-soft)]">
                                {credencial.memberNumber}
                              </p>
                            )}
                            {credencial.territoryLabel !== null && (
                              <p className="text-sm text-[var(--color-ink-soft)]">
                                {credencial.territoryLabel}
                              </p>
                            )}
                          </td>
                          <td className="p-3">{ETIQUETA_DE_TIPO[credencial.kind]}</td>
                          <td className="p-3 font-mono text-sm">{codigoLegible(credencial.publicCode)}</td>
                          <td className="p-3">
                            <Badge tone={estado.tono}>{estado.titulo}</Badge>
                            {credencial.revokedAt !== null && (
                              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                                {fecha.format(credencial.revokedAt)}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            {credencial.expiresAt === null ? 'Sin término' : fecha.format(credencial.expiresAt)}
                          </td>
                          <td className="p-3">
                            {credencial.status === 'ACTIVE' ? (
                              <div className="space-y-4">
                                <RevokeForm credentialId={credencial.id} />
                                <ReplaceForm credentialId={credencial.id} />
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-ink-soft)]">
                                Ya no está en vigor: no hay nada que revocar ni que reponer.
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ScrollableTable>
              </Section>
            )}
          </>
        )}

        {puedeEmitir && personas !== null && entidades !== null && (
          <Section
            title="Emitir una credencial de cargo o profesional"
            description="Las de agremiado y honoraria no se emiten aquí: nacen con la membresía."
          >
            <Card>
              <IssueForm
                personas={
                  personas.ok
                    ? personas.data
                        .filter((persona) => persona.mergedInto === null)
                        .map((persona) => ({
                          value: persona.personId,
                          label: `${persona.displayName} · ${persona.publicId}`,
                        }))
                    : []
                }
                entidades={
                  entidades.ok
                    ? entidades.data.map((entidad) => ({ value: entidad.id, label: entidad.shortName }))
                    : []
                }
              />
            </Card>
          </Section>
        )}

        <Section
          title={`Uso del verificador · últimos ${DIAS} días`}
          description="Agregado por día y por resultado. No se guarda quién consultó qué: no hay forma de reconstruirlo desde aquí ni desde la base."
        >
          {!consultas.ok ? (
            <ErrorNotice title={consultas.error.message} />
          ) : consultas.data.length === 0 ? (
            <EmptyState
              title="Todavía nadie ha usado el verificador"
              description="En cuanto alguien escanee un código o teclee uno, aparecerá aquí el conteo por día."
            />
          ) : (
            <ScrollableTable caption="Consultas al verificador público, agregadas por día y resultado.">
              <thead className="border-b border-[var(--color-line)] text-left">
                <tr>
                  <th scope="col" className="p-3 font-medium">Día</th>
                  <th scope="col" className="p-3 font-medium">Resultado</th>
                  <th scope="col" className="p-3 font-medium">Consultas</th>
                </tr>
              </thead>
              <tbody>
                {consultas.data.map((fila) => (
                  <tr
                    key={`${fila.dia}-${fila.result}`}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="p-3">{fila.dia}</td>
                    <td className="p-3">{fila.result}</td>
                    <td className="p-3 tabular-nums">{fila.consultas}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
