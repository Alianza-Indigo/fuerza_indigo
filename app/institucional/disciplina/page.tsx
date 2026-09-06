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
import { disciplinaryCaseList, evidenceList } from '@/modules/discipline';
import { appointableMemberships, unionBodyList } from '@/modules/governance';
import { grantablePeople } from '@/modules/governance';
import { assemblyList } from '@/modules/assembly';
import { publishedTemplateOptions } from '@/modules/documents';
import {
  AppealForm,
  AppealResolutionForm,
  AssessEvidenceForm,
  DecisionForm,
  EvidenceForm,
  HearingForm,
  NotifyForm,
  OpenCaseForm,
} from './discipline-forms';

export const metadata = { title: 'Procedimientos disciplinarios', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  REPORTED: { label: 'Denunciado', tone: 'neutral' },
  UNDER_INSTRUCTION: { label: 'En instrucción', tone: 'accent' },
  NOTIFIED: { label: 'Notificado', tone: 'accent' },
  HEARING_SCHEDULED: { label: 'Audiencia citada', tone: 'accent' },
  HEARING_HELD: { label: 'Audiencia celebrada', tone: 'accent' },
  DECIDED: { label: 'Resuelto', tone: 'warning' },
  APPEALED: { label: 'Recurrido', tone: 'warning' },
  CLOSED: { label: 'Cerrado', tone: 'neutral' },
  DISMISSED: { label: 'Desechado', tone: 'neutral' },
};

const RESULTADO: Record<string, string> = {
  NO_LIABILITY: 'Sin responsabilidad',
  WARNING: 'Amonestación',
  SUSPENSION_OF_RIGHTS: 'Suspensión de derechos',
  EXPULSION: 'Expulsión',
  OTHER_STATUTORY: 'Otra sanción estatutaria',
};

const OFRECIDA_POR: Record<string, string> = {
  INSTRUCTING_BODY: 'Órgano instructor',
  MEMBER: 'Persona señalada',
  THIRD_PARTY: 'Tercero',
};

/**
 * Procedimientos disciplinarios (PRD §9.8; F5-DIS-001 a F5-DIS-003).
 *
 * La pantalla enseña el debido proceso como una lista de hechos comprobables
 * —notificada, con acceso, citada, oída— y no como un estado. Un expediente que
 * no puede resolverse lo dice, y dice por qué.
 */
export default async function DisciplinaPage() {
  const actor = await currentActor();

  const [expedientes, organos, membresias, personas, asambleas, plantillas] = await Promise.all([
    disciplinaryCaseList(actor),
    unionBodyList(actor),
    appointableMemberships(actor),
    grantablePeople(actor),
    assemblyList(actor),
    publishedTemplateOptions(actor, 'DISCIPLINARY_DECISION'),
  ]);

  const puedeAbrir = can({ ...actor, reason: 'apertura de procedimiento' }, 'discipline.case.open', {
    kind: 'DisciplinaryCase',
  }).allowed;
  const puedeInstruir = can({ ...actor, reason: 'instrucción' }, 'discipline.evidence.manage', {
    kind: 'DisciplinaryEvidence',
  }).allowed;
  const puedeResolver = can({ ...actor, reason: 'resolución' }, 'discipline.decision.issue', {
    kind: 'DisciplinaryDecision',
  }).allowed;
  const puedeRecurso = can({ ...actor, reason: 'recurso' }, 'discipline.appeal.resolve', { kind: 'Appeal' }).allowed;
  const puedeVerPropio = can({ ...actor, reason: 'expediente propio' }, 'discipline.case.read_own', {
    kind: 'DisciplinaryCase',
  }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const opcionesOrgano: readonly Option[] = organos.ok
    ? organos.data.filter((organo) => organo.status === 'ACTIVE').map((organo) => ({ value: organo.id, label: organo.name }))
    : [];
  const opcionesMembresia: readonly Option[] = membresias.ok
    ? membresias.data.map((membresia) => ({ value: membresia.value, label: membresia.label }))
    : [];
  const opcionesPersona: readonly Option[] = personas.ok
    ? personas.data.map((persona) => ({ value: persona.value, label: persona.label }))
    : [];
  const opcionesAsamblea: readonly Option[] = asambleas.ok
    ? asambleas.data.map((asamblea) => ({
        value: asamblea.id,
        label: `${asamblea.publicId} · ${fecha.format(asamblea.scheduledAt)}`,
      }))
    : [];
  const opcionesPlantilla: readonly Option[] = plantillas.ok
    ? plantillas.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];

  const pruebasPorExpediente = expedientes.ok
    ? await Promise.all(expedientes.data.map((expediente) => evidenceList(actor, expediente.id)))
    : [];

  return (
    <PageShell
      title="Procedimientos disciplinarios"
      description="Audiencia, pruebas, resolución fundada y recurso. Sin notificación y sin audiencia —o su renuncia expresa— no hay resolución que valga, y el sistema no la permite."
      width="ancha"
    >
      <div className="space-y-8">
        <Notice tone="neutral" title="Ninguna inteligencia artificial interviene aquí" live="none">
          <p>
            No hay en este módulo ninguna sugerencia automática de culpabilidad ni de sanción, y no la habrá. Resolver
            sobre los derechos de una persona agremiada es un acto humano, con nombre y fundamento.
          </p>
        </Notice>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Expedientes</h2>
          {!expedientes.ok ? (
            <ErrorNotice title={expedientes.error.message} />
          ) : expedientes.data.length === 0 ? (
            <EmptyState
              title="No hay procedimientos abiertos"
              description="Un expediente disciplinario es reservado y sigue el procedimiento estatutario paso a paso."
            />
          ) : (
            <div className="space-y-4">
              {expedientes.data.map((expediente, indice) => {
                const estado = ESTADO[expediente.status] ?? { label: expediente.status, tone: 'neutral' as Tone };
                const pruebas = pruebasPorExpediente[indice];
                return (
                  <Card key={expediente.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-mono text-sm font-semibold">{expediente.folio}</h3>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                      {expediente.dueProcessComplete ? (
                        <Badge tone="success">Debido proceso cumplido</Badge>
                      ) : (
                        <Badge tone="warning">Debido proceso incompleto</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {expediente.personName} · instruye {expediente.instructingBody} · reglas{' '}
                      {expediente.normativeVersion}
                    </p>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Denunciado el:</dt>
                        <dd>{fecha.format(expediente.reportedAt)}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Notificada el:</dt>
                        <dd>
                          {expediente.notifiedAt === null ? 'Sin notificar' : fechaHora.format(expediente.notifiedAt)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Acceso al expediente:</dt>
                        <dd>
                          {expediente.memberAccessGrantedAt === null
                            ? 'Sin conceder'
                            : fechaHora.format(expediente.memberAccessGrantedAt)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Audiencia:</dt>
                        <dd>
                          {expediente.hearingHeldAt !== null
                            ? `Celebrada el ${fechaHora.format(expediente.hearingHeldAt)}`
                            : expediente.hearingWaivedAt !== null
                              ? `Renunciada el ${fechaHora.format(expediente.hearingWaivedAt)}`
                              : expediente.hearingScheduledAt !== null
                                ? `Citada para el ${fechaHora.format(expediente.hearingScheduledAt)}`
                                : 'Sin citar'}
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Pruebas:</dt>
                        <dd className="tabular-nums">
                          {expediente.evidenceCount}
                          {expediente.unassessedEvidence > 0 && ` · ${expediente.unassessedEvidence} sin valorar`}
                        </dd>
                      </div>
                    </dl>

                    {pruebas !== undefined && pruebas.ok && pruebas.data.length > 0 && (
                      <div className="mt-3">
                        <Disclosure summary={`Pruebas (${pruebas.data.length})`}>
                          <ul className="space-y-3 text-sm">
                            {pruebas.data.map((prueba) => (
                              <li key={prueba.id} className="border-b border-[var(--color-line)] pb-3 last:border-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone="neutral">{OFRECIDA_POR[prueba.offeredBy] ?? prueba.offeredBy}</Badge>
                                  {prueba.admitted === null ? (
                                    <Badge tone="warning">Sin valorar</Badge>
                                  ) : prueba.admitted ? (
                                    <Badge tone="success">Admitida</Badge>
                                  ) : (
                                    <Badge tone="danger">Desechada</Badge>
                                  )}
                                  {prueba.hasFile && <span className="text-xs">Con archivo</span>}
                                </div>
                                <p className="mt-1">{prueba.description}</p>
                                {prueba.admissionRationale !== null && (
                                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                                    {prueba.admissionRationale}
                                    {prueba.assessedBy !== null && ` — ${prueba.assessedBy}`}
                                  </p>
                                )}
                                {puedeInstruir && prueba.admitted === null && expediente.decision === null && (
                                  <div className="mt-2">
                                    <Disclosure summary="Valorar">
                                      <AssessEvidenceForm evidenceId={prueba.id} />
                                    </Disclosure>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </Disclosure>
                      </div>
                    )}

                    {expediente.decision !== null && (
                      <div className="mt-4 rounded-lg border border-[var(--color-line)] p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-medium">Resolución</span>
                          <Badge tone={expediente.decision.outcome === 'NO_LIABILITY' ? 'success' : 'warning'}>
                            {RESULTADO[expediente.decision.outcome] ?? expediente.decision.outcome}
                          </Badge>
                          <span className="text-xs text-[var(--color-ink-soft)]">
                            {fecha.format(expediente.decision.decidedAt)}
                            {expediente.decision.appealDeadlineAt !== null &&
                              ` · plazo para recurrir hasta el ${fecha.format(expediente.decision.appealDeadlineAt)}`}
                          </span>
                        </div>
                        <Disclosure summary="Fundamento">
                          <p className="whitespace-pre-line text-sm">{expediente.decision.rationale}</p>
                        </Disclosure>

                        {expediente.decision.appeals.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {expediente.decision.appeals.map((recurso) => (
                              <div key={recurso.id} className="text-sm">
                                <Badge tone="accent">{recurso.status}</Badge>
                                <p className="mt-1 whitespace-pre-line">{recurso.grounds}</p>
                                {puedeRecurso && !recurso.status.startsWith('RESOLVED') && (
                                  <div className="mt-2">
                                    <Disclosure summary="Resolver el recurso">
                                      <AppealResolutionForm appealId={recurso.id} asambleas={opcionesAsamblea} />
                                    </Disclosure>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {puedeVerPropio && expediente.decision.appeals.length === 0 && (
                          <div className="mt-3">
                            <Disclosure summary="Interponer recurso">
                              <AppealForm decisionId={expediente.decision.id} />
                            </Disclosure>
                          </div>
                        )}
                      </div>
                    )}

                    {expediente.decision === null && (
                      <div className="mt-4 space-y-3">
                        {puedeInstruir && expediente.notifiedAt === null && (
                          <Disclosure summary="Notificar y citar a audiencia">
                            <NotifyForm caseId={expediente.id} />
                          </Disclosure>
                        )}
                        {puedeInstruir &&
                          expediente.notifiedAt !== null &&
                          expediente.hearingHeldAt === null &&
                          expediente.hearingWaivedAt === null && (
                            <Disclosure summary="Asentar la audiencia">
                              <HearingForm caseId={expediente.id} />
                            </Disclosure>
                          )}
                        {puedeInstruir && (
                          <Disclosure summary="Ofrecer una prueba">
                            <EvidenceForm caseId={expediente.id} propia={false} />
                          </Disclosure>
                        )}
                        {puedeVerPropio && (
                          <Disclosure summary="Ofrecer una prueba en mi defensa">
                            <EvidenceForm caseId={expediente.id} propia />
                          </Disclosure>
                        )}
                        {puedeResolver && expediente.dueProcessComplete && expediente.unassessedEvidence === 0 && (
                          <Disclosure summary="Dictar la resolución">
                            <DecisionForm
                              caseId={expediente.id}
                              organos={opcionesOrgano}
                              plantillas={opcionesPlantilla}
                            />
                          </Disclosure>
                        )}
                        {puedeResolver && (!expediente.dueProcessComplete || expediente.unassessedEvidence > 0) && (
                          <Notice tone="warning" title="Todavía no se puede resolver" live="none">
                            <ul className="list-inside list-disc text-sm">
                              {expediente.notifiedAt === null && <li>Falta notificar a la persona señalada.</li>}
                              {expediente.hearingHeldAt === null && expediente.hearingWaivedAt === null && (
                                <li>Falta la audiencia, o la constancia de su renuncia expresa.</li>
                              )}
                              {expediente.unassessedEvidence > 0 && (
                                <li>Quedan {expediente.unassessedEvidence} prueba(s) por valorar.</li>
                              )}
                            </ul>
                          </Notice>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {puedeAbrir && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Abrir un procedimiento</h2>
            <Card>
              <OpenCaseForm membresias={opcionesMembresia} organos={opcionesOrgano} personas={opcionesPersona} />
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  );
}
