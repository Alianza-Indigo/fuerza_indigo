import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Notice,
  PageShell,
  ScrollableTable,
  type Option,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import {
  NOMBRE_DE_ETAPA,
  electionDetail,
  incidentList,
  slateList,
} from '@/modules/election';
import { electionRoster } from '@/modules/assembly';
import { grantablePeople, officeList, officeTermList } from '@/modules/governance';
import { publishedTemplateOptions } from '@/modules/documents';
import {
  AdvanceForm,
  CommissionForm,
  ElectionCallForm,
  ElectionTallyForms,
  ElectionVoteForm,
  EvidenceExportForm,
  IncidentForm,
  IncidentResolutionForm,
  RollForms,
  SlateDecisionForm,
  SlateForm,
} from '../election-forms';

export const metadata = { title: 'Proceso electoral', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'En preparación', tone: 'neutral' },
  CALL_ISSUED: { label: 'Convocada', tone: 'accent' },
  REGISTRATION_OPEN: { label: 'Registro abierto', tone: 'accent' },
  CAMPAIGN: { label: 'Campaña', tone: 'accent' },
  VOTING: { label: 'Jornada', tone: 'success' },
  TALLYING: { label: 'Escrutinio', tone: 'warning' },
  RESULTS_DECLARED: { label: 'Resultados declarados', tone: 'success' },
  CHALLENGED: { label: 'Impugnada', tone: 'warning' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
  ANNULLED: { label: 'Anulada', tone: 'danger' },
};

const PLANILLA: Record<string, { label: string; tone: Tone }> = {
  SUBMITTED: { label: 'Presentada', tone: 'neutral' },
  UNDER_REVIEW: { label: 'En revisión', tone: 'accent' },
  VALIDATED: { label: 'Validada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  WITHDRAWN: { label: 'Retirada', tone: 'neutral' },
};

const INCIDENCIA: Record<string, string> = {
  PROCEDURAL: 'Procedimiento',
  ELIGIBILITY: 'Elegibilidad',
  TECHNICAL: 'Técnica',
  CONDUCT: 'Conducta',
  CHALLENGE: 'Impugnación',
};

/**
 * Proceso electoral (PRD §9.6; F5-ELE-001 a F5-ELE-006).
 *
 * Sigue el orden real del proceso: comisión, convocatoria, padrón, planillas,
 * jornada, escrutinio, incidencias y expediente. Cada bloque aparece cuando la
 * etapa lo permite; los demás no se ofrecen, porque un botón que solo sabe
 * fallar es peor que su ausencia.
 */
export default async function ProcesoElectoralPage({ params }: { params: Promise<{ eleccion: string }> }) {
  const { eleccion: publicId } = await params;
  const actor = await currentActor();

  const detalle = await electionDetail(actor, publicId);
  if (!detalle.ok) {
    if (detalle.error.httpStatus === 404) notFound();
    return (
      <PageShell title="Proceso electoral">
        <ErrorNotice title={detalle.error.message} />
      </PageShell>
    );
  }
  const proceso = detalle.data;

  const [padron, planillas, incidencias, personas, cargosVigentes, cargosDelOrgano, plantillasConvocatoria, plantillasResultado] =
    await Promise.all([
      electionRoster(actor, proceso.id),
      slateList(actor, proceso.id),
      incidentList(actor, proceso.id),
      grantablePeople(actor),
      officeTermList(actor, { onlyLive: true }),
      officeList(actor, { unionBodyId: proceso.unionBodyId }),
      publishedTemplateOptions(actor, 'CALL_NOTICE'),
      publishedTemplateOptions(actor, 'ELECTION_RESULT'),
    ]);

  const puedeAdministrar = can({ ...actor, reason: 'administración electoral' }, 'election.election.manage', {
    kind: 'Election',
  }).allowed;
  const puedeRegistrarPlanilla = can({ ...actor, reason: 'registro de planilla' }, 'election.slate.register', {
    kind: 'CandidateSlate',
  }).allowed;
  const puedeValidar = can({ ...actor, reason: 'validación de planillas' }, 'election.slate.validate', {
    kind: 'CandidateSlate',
  }).allowed;
  const puedePadron = can({ ...actor, reason: 'padrón electoral' }, 'election.roster.publish', { kind: 'Election' })
    .allowed;
  const puedeIncidencias = can({ ...actor, reason: 'incidencias' }, 'election.incident.manage', {
    kind: 'ElectionIncident',
  }).allowed;
  const puedeVotacion = can({ ...actor, reason: 'jornada' }, 'voting.process.manage', { kind: 'VoteProcess' }).allowed;
  const puedeExportar = can({ ...actor, reason: 'expediente' }, 'election.evidence.export', { kind: 'Election' })
    .allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const estado = ESTADO[proceso.status] ?? { label: proceso.status, tone: 'neutral' as Tone };

  const opcionesPersona: readonly Option[] = personas.ok
    ? personas.data.map((persona) => ({ value: persona.value, label: persona.label }))
    : [];
  const opcionesCargoVigente: readonly Option[] = cargosVigentes.ok
    ? cargosVigentes.data.map((cargo) => ({ value: cargo.id, label: `${cargo.officeName} · ${cargo.personName}` }))
    : [];
  const opcionesCargo: readonly Option[] = cargosDelOrgano.ok
    ? cargosDelOrgano.data.map((cargo) => ({ value: cargo.id, label: cargo.name }))
    : [];
  const opcionesDestino: readonly Option[] = proceso.nextStates.map((destino) => ({
    value: destino,
    label: ESTADO[destino]?.label ?? destino,
  }));
  const opcionesPlantillaConvocatoria: readonly Option[] = plantillasConvocatoria.ok
    ? plantillasConvocatoria.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];
  const opcionesPlantillaResultado: readonly Option[] = plantillasResultado.ok
    ? plantillasResultado.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];

  const validadas = planillas.ok
    ? planillas.data.filter((planilla) => planilla.status === 'VALIDATED').map((planilla) => ({ id: planilla.id, name: planilla.name }))
    : [];

  return (
    <PageShell
      title={proceso.name}
      description={`${proceso.bodyName} · ${proceso.territory} · reglas ${proceso.normativeVersion}`}
      width="ancha"
      actions={
        <Link href="/institucional/elecciones" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Volver a las elecciones
        </Link>
      }
    >
      <div className="space-y-8">
        <section className="flex flex-wrap items-center gap-3">
          <Badge tone={estado.tone}>{estado.label}</Badge>
          {proceso.callIssued && <Badge tone="success">Convocatoria emitida</Badge>}
          {proceso.rosterPublishedAt !== null && (
            <Badge tone="success">Padrón publicado el {fecha.format(proceso.rosterPublishedAt)}</Badge>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Calendario</h2>
          {proceso.calendar.length === 0 ? (
            <EmptyState title="Sin calendario" description="Un proceso sin etapas con fecha no se puede seguir." />
          ) : (
            <ScrollableTable caption="Etapas del proceso electoral">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Etapa</th>
                  <th scope="col" className="p-3 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {proceso.calendar.map((etapa) => (
                  <tr key={etapa.code} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{NOMBRE_DE_ETAPA[etapa.code]}</td>
                    <td className="p-3 tabular-nums">{etapa.startsOn}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Comisión Electoral</h2>
          {proceso.commissionMembers.length === 0 ? (
            <EmptyState
              title="La comisión no está integrada"
              description="Un proceso sin comisión no tiene quién valide planillas ni resuelva incidencias."
            />
          ) : (
            <ul className="space-y-1 text-sm">
              {proceso.commissionMembers.map((integrante) => (
                <li key={integrante.name} className="flex flex-wrap items-center gap-2">
                  <span>{integrante.name}</span>
                  {integrante.declared ? (
                    <Badge tone="success">Declara no tener candidatura</Badge>
                  ) : (
                    <Badge tone="warning">Sin declaración</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedeAdministrar && proceso.status === 'PLANNED' && (
            <div className="mt-4">
              <Disclosure summary="Integrar a la comisión">
                <CommissionForm
                  electionId={proceso.id}
                  personas={opcionesPersona}
                  cargos={opcionesCargoVigente}
                />
              </Disclosure>
            </div>
          )}
        </section>

        {puedeAdministrar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Etapa del proceso</h2>
            <div className="space-y-4">
              {!proceso.callIssued && proceso.status === 'PLANNED' && (
                <Card>
                  <h3 className="mb-2 text-base font-semibold">Convocar</h3>
                  <ElectionCallForm electionId={proceso.id} plantillas={opcionesPlantillaConvocatoria} />
                </Card>
              )}
              <Card>
                <h3 className="mb-2 text-base font-semibold">Avanzar de etapa</h3>
                <AdvanceForm electionId={proceso.id} destinos={opcionesDestino} />
              </Card>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Padrón electoral</h2>
          {!padron.ok ? (
            <ErrorNotice title={padron.error.message} />
          ) : padron.data === null ? (
            <EmptyState
              title="El padrón no está congelado"
              description="Sin padrón congelado no hay quién vote ni contra qué comprobarlo."
            />
          ) : (
            <Card>
              <dl className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Congelado el:</dt>
                  <dd>{fecha.format(padron.data.frozenAt)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Electoras:</dt>
                  <dd className="tabular-nums">
                    {padron.data.withVote} de {padron.data.entryCount}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Huella:</dt>
                  <dd className="font-mono text-xs break-all">{padron.data.hash}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Integridad:</dt>
                  <dd>
                    {padron.data.intact ? (
                      <Badge tone="success">La huella corresponde</Badge>
                    ) : (
                      <Badge tone="danger">La huella no corresponde</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          {puedePadron && (
            <div className="mt-4">
              <RollForms
                electionId={proceso.id}
                congelado={padron.ok && padron.data !== null}
                publicado={proceso.rosterPublishedAt !== null}
              />
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Planillas</h2>
          {!planillas.ok ? (
            <ErrorNotice title={planillas.error.message} />
          ) : planillas.data.length === 0 ? (
            <EmptyState
              title="Sin planillas registradas"
              description="Las planillas se registran mientras el registro esté abierto."
            />
          ) : (
            <div className="space-y-3">
              {planillas.data.map((planilla) => {
                const situacion = PLANILLA[planilla.status] ?? { label: planilla.status, tone: 'neutral' as Tone };
                return (
                  <Card key={planilla.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold">{planilla.name}</h3>
                      <Badge tone={situacion.tone}>{situacion.label}</Badge>
                      {planilla.warnings.length > 0 && (
                        <Badge tone="warning">{planilla.warnings.length} advertencia(s)</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      Registrada el {fecha.format(planilla.registeredAt)}
                    </p>
                    {planilla.rejectionReason !== null && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Motivo del rechazo:</span> {planilla.rejectionReason}
                      </p>
                    )}

                    {planilla.composition !== null && (
                      <p className="mt-2 text-sm">
                        Composición: {planilla.composition.mujeres} mujeres, {planilla.composition.hombres} hombres,{' '}
                        {planilla.composition.noBinarias} no binarias, {planilla.composition.otras} otras,{' '}
                        {planilla.composition.sinDeclarar} sin declarar
                        {planilla.composition.porcentajeMujeres !== null &&
                          ` · ${planilla.composition.porcentajeMujeres.toFixed(1)} % de mujeres entre quienes declararon`}
                        .
                      </p>
                    )}

                    {planilla.warnings.length > 0 && (
                      <div className="mt-3">
                        <Notice tone="warning" title="Advertencias registradas con la planilla" live="none">
                          <ul className="list-inside list-disc space-y-1 text-sm">
                            {planilla.warnings.map((alerta) => (
                              <li key={alerta.codigo}>{alerta.mensaje}</li>
                            ))}
                          </ul>
                        </Notice>
                      </div>
                    )}

                    <div className="mt-3">
                      <Disclosure summary={`Candidaturas (${planilla.members.length})`}>
                        <ul className="space-y-1 text-sm">
                          {planilla.members.map((integrante) => (
                            <li key={`${integrante.personName}-${integrante.officeName}`}>
                              {integrante.officeName}: {integrante.personName}
                              {integrante.isSubstitute && ' (suplencia)'}
                            </li>
                          ))}
                        </ul>
                      </Disclosure>
                    </div>

                    {puedeValidar && (planilla.status === 'SUBMITTED' || planilla.status === 'UNDER_REVIEW') && (
                      <div className="mt-3">
                        <Disclosure summary="Resolver">
                          <SlateDecisionForm slateId={planilla.id} name={planilla.name} />
                        </Disclosure>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {puedeRegistrarPlanilla && proceso.status === 'REGISTRATION_OPEN' && (
            <div className="mt-4">
              <Disclosure summary="Registrar una planilla">
                <SlateForm electionId={proceso.id} personas={opcionesPersona} cargos={opcionesCargo} />
              </Disclosure>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Jornada</h2>
          {proceso.voteProcess === null ? (
            <>
              <EmptyState
                title="La jornada no está programada"
                description="Se programa sobre el padrón congelado, con una opción por planilla validada."
              />
              {puedeVotacion && padron.ok && padron.data !== null && (
                <div className="mt-4">
                  <Disclosure summary="Programar la jornada">
                    <ElectionVoteForm
                      electionId={proceso.id}
                      rosterSnapshotId={padron.data.rosterId}
                      planillas={validadas}
                    />
                  </Disclosure>
                </div>
              )}
            </>
          ) : (
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold">{proceso.voteProcess.title}</h3>
                <Badge tone="neutral">{proceso.voteProcess.status}</Badge>
              </div>
              {proceso.voteProcess.status === 'OPEN' && (
                <p className="mt-2 text-sm">
                  Depósito en{' '}
                  <Link href={`/votar/${proceso.voteProcess.publicId}`} className="underline underline-offset-4">
                    /votar/{proceso.voteProcess.publicId}
                  </Link>
                </p>
              )}
              {puedeVotacion && (
                <div className="mt-4">
                  <ElectionTallyForms
                    voteProcessId={proceso.voteProcess.id}
                    status={proceso.voteProcess.status}
                    plantillas={opcionesPlantillaResultado}
                  />
                </div>
              )}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Incidencias e impugnaciones</h2>
          {!incidencias.ok ? (
            <ErrorNotice title={incidencias.error.message} />
          ) : incidencias.data.length === 0 ? (
            <EmptyState
              title="Sin incidencias"
              description="Quien no aparezca en el padrón, o vea una irregularidad, la plantea aquí."
            />
          ) : (
            <div className="space-y-3">
              {incidencias.data.map((incidencia) => (
                <Card key={incidencia.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="accent">{INCIDENCIA[incidencia.kind] ?? incidencia.kind}</Badge>
                    <Badge tone={incidencia.status === 'RESOLVED' ? 'success' : 'warning'}>{incidencia.status}</Badge>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {incidencia.reportedBy} · {fecha.format(incidencia.reportedAt)}
                      {incidencia.evidenceCount > 0 && ` · ${incidencia.evidenceCount} evidencia(s)`}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm">{incidencia.description}</p>
                  {incidencia.resolution !== null && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Resolución:</span> {incidencia.resolution}
                    </p>
                  )}
                  {puedeIncidencias && incidencia.status !== 'RESOLVED' && incidencia.status !== 'DISMISSED' && (
                    <div className="mt-3">
                      <Disclosure summary="Resolver">
                        <IncidentResolutionForm incidentId={incidencia.id} />
                      </Disclosure>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {puedeIncidencias && (
            <div className="mt-4">
              <Disclosure summary="Plantear una incidencia">
                <IncidentForm electionId={proceso.id} />
              </Disclosure>
            </div>
          )}
        </section>

        {puedeExportar && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Expediente para la autoridad</h2>
            <Card>
              <EvidenceExportForm electionId={proceso.id} />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
