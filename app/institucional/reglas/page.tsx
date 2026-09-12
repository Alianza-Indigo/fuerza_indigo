import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import {
  CLAVES_DE_REGLA,
  FORMA_DE_REGLA,
  NOMBRE_DE_MAYORIA,
  NOMBRE_DE_QUORUM,
  NOMBRE_DE_REGLA,
  approvedResolutionOptions,
  ruleSetList,
  type MajorityRule,
  type QuorumRule,
} from '@/modules/governance';
import { DraftRuleSetForm, EditRuleDraftForm, InitialPutInForceForm, PutInForceForm } from './rules-forms';

export const metadata = { title: 'Reglas estatutarias', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  IN_FORCE: { label: 'En vigor', tone: 'success' },
  SUPERSEDED: { label: 'Superada', tone: 'warning' },
};

function comoTexto(clave: (typeof CLAVES_DE_REGLA)[number], valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') return 'Pendiente de los estatutos';
  const forma = FORMA_DE_REGLA[clave];
  if (forma === 'booleano') return valor === true ? 'Sí' : 'No';
  if (forma === 'mayoria' && typeof valor === 'string') {
    return NOMBRE_DE_MAYORIA[valor as MajorityRule] ?? valor;
  }
  if (forma === 'quorum' && typeof valor === 'string') {
    return NOMBRE_DE_QUORUM[valor as QuorumRule] ?? valor;
  }
  if (typeof valor === 'number') return forma === 'porcentaje' ? `${valor} %` : String(valor);
  if (typeof valor === 'string') return valor;
  // Un valor que no es ni número ni texto es un borrador mal guardado: se dice,
  // en vez de imprimir «[object Object]» en una pantalla de gobierno.
  return 'Valor no reconocido';
}

/**
 * Reglas estatutarias versionadas (PRD §9.3, §9.4; F5-GOB-003).
 *
 * La pantalla enseña las tres cosas que hacen falta para confiar en un umbral:
 * qué dice, desde cuándo rige y qué acuerdo lo aprobó. Y enseña también lo que
 * falta, porque una regla ausente que no se ve acaba sustituida por una
 * suposición.
 */
export default async function ReglasEstatutariasPage() {
  const actor = await currentActor();

  const [versiones, acuerdos] = await Promise.all([ruleSetList(actor), approvedResolutionOptions(actor)]);

  const puedeRedactar = can({ ...actor, reason: 'redacción de reglas estatutarias' }, 'governance.rules.manage', {
    kind: 'NormativeRuleSet',
  }).allowed;
  const puedePonerEnVigor = can(
    { ...actor, reason: 'puesta en vigor de reglas estatutarias' },
    'institution.normative_rules.manage',
    { kind: 'NormativeRuleSet' },
  ).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const opcionesAcuerdo: readonly Option[] = acuerdos.ok
    ? acuerdos.data.map((acuerdo) => ({ value: acuerdo.id, label: acuerdo.label }))
    : [];

  const enVigor = versiones.ok ? versiones.data.find((version) => version.status === 'IN_FORCE') : undefined;

  return (
    <PageShell
      title="Reglas estatutarias"
      description="Los umbrales con los que la plataforma decide: quórum, mayorías, plazos y periodos. Una versión en vigor no se edita; se redacta otra y se pone en vigor con el acuerdo de la asamblea."
      width="ancha"
    >
      <div className="space-y-8">
        {versiones.ok && enVigor === undefined && (
          <Notice tone="warning" title="No hay ninguna versión en vigor">
            <p>
              Mientras no la haya, ningún órgano puede instalarse ni ninguna asamblea convocarse: los actos
              institucionales se ejecutan conforme a una versión concreta, y no se elige una por omisión.
            </p>
          </Notice>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Versiones</h2>
          {!versiones.ok ? (
            <ErrorNotice title={versiones.error.message} />
          ) : versiones.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna versión"
              description="Redacta la primera con los umbrales que aporten los estatutos."
            />
          ) : (
            <div className="space-y-4">
              {versiones.data.map((version) => {
                const estado = ESTADO[version.status] ?? { label: version.status, tone: 'neutral' as Tone };
                return (
                  <Card key={version.id}>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold">Versión {version.version}</h3>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                      {version.complete ? (
                        <Badge tone="success">Completa</Badge>
                      ) : (
                        <Badge tone="warning">Faltan {version.missing.length}</Badge>
                      )}
                    </div>

                    <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
                      {version.effectiveFrom === null
                        ? 'Sin fecha de entrada en vigor.'
                        : `Rige desde el ${fecha.format(version.effectiveFrom)}`}
                      {version.effectiveTo !== null && ` y hasta el ${fecha.format(version.effectiveTo)}`}
                      {version.approvedByResolution !== null && ` · acuerdo ${version.approvedByResolution}`}
                    </p>

                    <Disclosure summary="Ver los umbrales">
                      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        {CLAVES_DE_REGLA.map((clave) => (
                          <div key={clave} className="border-b border-[var(--color-line)] py-1 last:border-0">
                            <dt className="font-medium">{NOMBRE_DE_REGLA[clave]}</dt>
                            <dd
                              className={
                                version.rules[clave] === undefined ? 'text-[var(--color-ink-soft)] italic' : ''
                              }
                            >
                              {comoTexto(clave, version.rules[clave])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </Disclosure>

                    {version.status === 'DRAFT' && puedeRedactar && (
                      <div className="mt-4">
                        <Disclosure summary="Editar el borrador">
                          <EditRuleDraftForm ruleSetId={version.id} valores={version.rules} />
                        </Disclosure>
                      </div>
                    )}

                    {version.status === 'DRAFT' && puedePonerEnVigor && (
                      <div className="mt-4">
                        <Disclosure summary="Poner en vigor">
                          {enVigor === undefined && actor.actorKind === 'ROOT_SUPERADMIN' ? (
                            <InitialPutInForceForm
                              ruleSetId={version.id}
                              version={version.version}
                              completa={version.complete}
                            />
                          ) : enVigor !== undefined ? (
                            <PutInForceForm
                              ruleSetId={version.id}
                              version={version.version}
                              acuerdos={opcionesAcuerdo}
                              completa={version.complete}
                            />
                          ) : (
                            <Notice tone="warning" title="La versión inicial la registra la cuenta raíz">
                              <p>Usa la pantalla de puesta en marcha del Superadmin para acreditar el instrumento constitutivo.</p>
                            </Notice>
                          )}
                        </Disclosure>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {puedeRedactar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Redactar una versión nueva</h2>
            <Card>
              <DraftRuleSetForm />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
