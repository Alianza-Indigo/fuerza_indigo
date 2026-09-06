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
  agendaItems,
  assemblyDetail,
  attendanceList,
  computeQuorum,
  pendingAttendees,
  frozenRoster,
  resolutionList,
  rosterPreview,
} from '@/modules/assembly';
import { voteProcessList } from '@/modules/voting';
import { followUpOwners, myLiveOfficeTerms } from '@/modules/governance';
import { documentSignatures, documentsForSubject, publishedTemplateOptions } from '@/modules/documents';
import { AgendaItemForm, IssueCallForm } from '../assembly-forms';
import {
  AgendaDocumentForm,
  AttendanceForm,
  DeclareQuorumForm,
  FreezeRosterForm,
  IssueCredentialsForm,
  PublishMinutesForm,
  RecordResolutionForm,
  ScheduleVoteForm,
  SignDocumentForm,
  TallyForms,
} from '../session-forms';

export const metadata = { title: 'Sesión de asamblea', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; tone: Tone }> = {
  PLANNED: { label: 'Planeada', tone: 'neutral' },
  CALLED: { label: 'Convocada', tone: 'accent' },
  SECOND_CALL: { label: 'Segunda convocatoria', tone: 'warning' },
  IN_SESSION: { label: 'En sesión', tone: 'success' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
  PUBLISHED: { label: 'Acta publicada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
};

const PUNTO: Record<string, string> = {
  INFORMATIVE: 'Informativo',
  DELIBERATIVE: 'Deliberativo',
  ELECTIVE: 'Electivo',
  STATUTE_REFORM: 'Reforma estatutaria',
  FINANCIAL_REPORT: 'Informe financiero',
  DISSOLUTION: 'Disolución',
};

const MAYORIA: Record<string, string> = {
  SIMPLE: 'Mayoría ordinaria',
  QUALIFIED_TWO_THIRDS: 'Mayoría calificada',
  QUALIFIED_STATUTORY: 'Mayoría calificada estatutaria',
};

const METODO_ASISTENCIA: Record<string, string> = {
  QR_CREDENTIAL: 'Credencial',
  MANUAL: 'Manual',
  REMOTE_SESSION: 'A distancia',
};

/**
 * Sesión de asamblea (PRD §9.4; F5-ASA-002 a F5-ASA-007).
 *
 * Es una sola pantalla porque una sesión es un solo acto continuo: el padrón,
 * la asistencia, el quórum, las votaciones, los acuerdos y el acta ocurren
 * seguidos y quien preside necesita verlos juntos. Cada bloque aparece cuando
 * le toca y no antes: ofrecer «declarar quórum» sin padrón congelado sería un
 * botón que solo sabe fallar.
 */
export default async function SesionPage({ params }: { params: Promise<{ asamblea: string }> }) {
  const { asamblea: publicId } = await params;
  const actor = await currentActor();

  const detalle = await assemblyDetail(actor, publicId);
  if (!detalle.ok) {
    if (detalle.error.httpStatus === 404) notFound();
    return (
      <PageShell title="Sesión de asamblea">
        <ErrorNotice title={detalle.error.message} />
      </PageShell>
    );
  }
  const asamblea = detalle.data;

  const [
    puntos,
    padron,
    previa,
    quorum,
    asistencia,
    pendientes,
    votaciones,
    resoluciones,
    documentos,
    responsables,
    misCargosVivos,
    plantillasConvocatoria,
    plantillasActa,
    plantillasResultado,
  ] = await Promise.all([
    agendaItems(actor, asamblea.id),
    frozenRoster(actor, asamblea.id),
    rosterPreview(actor, asamblea.id),
    computeQuorum(actor, asamblea.id),
    attendanceList(actor, asamblea.id),
    pendingAttendees(actor, asamblea.id),
    voteProcessList(actor, { assemblyId: asamblea.id }),
    resolutionList(actor, { assemblyId: asamblea.id }),
    documentsForSubject(actor, 'ASSEMBLY', asamblea.id),
    followUpOwners(actor),
    myLiveOfficeTerms(actor),
    publishedTemplateOptions(actor, 'CALL_NOTICE'),
    publishedTemplateOptions(actor, 'ASSEMBLY_MINUTES'),
    publishedTemplateOptions(actor, 'ELECTION_RESULT'),
  ]);

  const puedeConvocar = can({ ...actor, reason: 'convocatoria' }, 'assembly.assembly.convene', { kind: 'AssemblyCall' })
    .allowed;
  const puedeOrdenDelDia = can({ ...actor, reason: 'orden del día' }, 'assembly.agenda.manage', { kind: 'AgendaItem' })
    .allowed;
  const puedeCongelar = can({ ...actor, reason: 'padrón' }, 'assembly.roster.freeze', {
    kind: 'AssemblyRosterSnapshot',
  }).allowed;
  const puedeAsistencia = can({ ...actor, reason: 'asistencia' }, 'assembly.attendance.register', {
    kind: 'Attendance',
  }).allowed;
  const puedeQuorum = can({ ...actor, reason: 'quórum' }, 'assembly.quorum.declare', { kind: 'Assembly' }).allowed;
  const puedeVotar = can({ ...actor, reason: 'votación' }, 'voting.process.manage', { kind: 'VoteProcess' }).allowed;
  const puedeEscrutar = can({ ...actor, reason: 'escrutinio' }, 'voting.tally.run', { kind: 'VoteProcess' }).allowed;
  const puedeResolver = can({ ...actor, reason: 'resolución' }, 'assembly.resolution.record', { kind: 'Resolution' })
    .allowed;
  const puedeActa = can({ ...actor, reason: 'acta' }, 'assembly.minutes.publish', { kind: 'Assembly' }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  const estado = ESTADO[asamblea.status] ?? { label: asamblea.status, tone: 'neutral' as Tone };
  const emitidas = new Set(asamblea.callDetails.map((call) => call.ordinal));

  const opcionesAsistentes: readonly Option[] = pendientes.ok
    ? pendientes.data.map((persona) => ({
        value: persona.membershipId,
        label: `${persona.personName} · ${persona.memberNumber}${persona.hasVote ? '' : ' · sin voto'}`,
      }))
    : [];

  const misCargos: readonly Option[] = misCargosVivos.ok
    ? misCargosVivos.data.map((cargo) => ({ value: cargo.value, label: cargo.label }))
    : [];

  const opcionesResponsable: readonly Option[] = responsables.ok
    ? responsables.data.map((persona) => ({ value: persona.value, label: persona.label }))
    : [];

  const puntosVotables: readonly Option[] = puntos.ok
    ? puntos.data
        .filter(
          (punto) => punto.status === 'PENDING' || punto.status === 'IN_DISCUSSION',
        )
        .map((punto) => ({ value: punto.id, label: `${punto.position}. ${punto.title}` }))
    : [];

  const puntosSinResolucion: readonly Option[] = puntos.ok
    ? puntos.data
        .filter((punto) => punto.status !== 'VOTED' && punto.status !== 'WITHDRAWN')
        .map((punto) => ({ value: punto.id, label: `${punto.position}. ${punto.title}` }))
    : [];

  const votacionesEscrutadas: readonly Option[] = votaciones.ok
    ? votaciones.data
        .filter((proceso) => proceso.status === 'TALLIED' || proceso.status === 'CERTIFIED')
        .map((proceso) => ({ value: proceso.id, label: proceso.title }))
    : [];

  const opcionesPlantillaConvocatoria: readonly Option[] = plantillasConvocatoria.ok
    ? plantillasConvocatoria.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];
  const opcionesPlantillaActa: readonly Option[] = plantillasActa.ok
    ? plantillasActa.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];
  const opcionesPlantillaResultado: readonly Option[] = plantillasResultado.ok
    ? plantillasResultado.data.map((plantilla) => ({ value: plantilla.value, label: plantilla.label }))
    : [];

  return (
    <PageShell
      title={`Asamblea ${asamblea.publicId}`}
      description={`${asamblea.bodyName} · ${asamblea.territory} · ${fechaHora.format(asamblea.scheduledAt)}`}
      width="ancha"
      actions={
        <Link href="/institucional/asambleas" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Volver a las asambleas
        </Link>
      }
    >
      <div className="space-y-8">
        <section className="flex flex-wrap items-center gap-3">
          <Badge tone={estado.tone}>{estado.label}</Badge>
          <span className="text-sm text-[var(--color-ink-soft)]">
            Reglas {asamblea.normativeVersion}
            {asamblea.convenedBy !== null && ` · convoca ${asamblea.convenedBy}`}
            {asamblea.convenedByPetition && ' · por petición de agremiados'}
            {asamblea.venue !== null && ` · ${asamblea.venue}`}
          </span>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Orden del día</h2>
          {!puntos.ok ? (
            <ErrorNotice title={puntos.error.message} />
          ) : puntos.data.length === 0 ? (
            <EmptyState
              title="El orden del día está vacío"
              description="La convocatoria lleva el orden del día: sin puntos no se puede convocar."
            />
          ) : (
            <div className="space-y-2">
              {puntos.data.map((punto) => (
                <Card key={punto.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold">
                      {punto.position}. {punto.title}
                    </h3>
                    <Badge tone="neutral">{PUNTO[punto.kind] ?? punto.kind}</Badge>
                    <Badge tone="accent">{MAYORIA[punto.requiredMajority] ?? punto.requiredMajority}</Badge>
                    {punto.status === 'VOTED' && <Badge tone="success">Resuelto</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm">{punto.description}</p>
                  {punto.documentCount > 0 && (
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {punto.documentCount} documento(s) previo(s)
                    </p>
                  )}
                  {puedeOrdenDelDia && punto.status !== 'VOTED' && punto.status !== 'WITHDRAWN' && (
                    <div className="mt-3">
                      <Disclosure summary="Adjuntar un documento previo">
                        <AgendaDocumentForm agendaItemId={punto.id} />
                      </Disclosure>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {puedeOrdenDelDia && asamblea.status === 'PLANNED' && asamblea.callDetails.length === 0 && (
            <div className="mt-4">
              <Disclosure summary="Añadir un punto">
                <AgendaItemForm assemblyId={asamblea.id} />
              </Disclosure>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Convocatorias</h2>
          {asamblea.callDetails.length === 0 ? (
            <EmptyState
              title="Sin convocatoria emitida"
              description="La anticipación estatutaria se comprueba al emitirla. Si no alcanza, el sistema lo dice ahora y no el día de la sesión."
            />
          ) : (
            <ScrollableTable caption="Convocatorias emitidas">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Convocatoria</th>
                  <th scope="col" className="p-3 font-medium">Emitida</th>
                  <th scope="col" className="p-3 font-medium">Anticipación</th>
                  <th scope="col" className="p-3 font-medium">Quórum</th>
                  <th scope="col" className="p-3 font-medium">Canales</th>
                </tr>
              </thead>
              <tbody>
                {asamblea.callDetails.map((call) => (
                  <tr key={call.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3">{call.ordinal === 'FIRST' ? 'Primera' : 'Segunda'}</td>
                    <td className="p-3 tabular-nums">{fechaHora.format(call.issuedAt)}</td>
                    <td className="p-3 tabular-nums">{call.noticeDays} días</td>
                    <td className="p-3">
                      {call.quorumRule === 'HALF_PLUS_ONE' ? 'La mitad más uno' : 'Los presentes'}
                    </td>
                    <td className="p-3 text-xs">{call.channels.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}

          {puedeConvocar && asamblea.status !== 'PUBLISHED' && asamblea.status !== 'CANCELLED' && (
            <div className="mt-4 space-y-3">
              {!emitidas.has('FIRST') && (
                <Disclosure summary="Emitir la primera convocatoria">
                  <IssueCallForm assemblyId={asamblea.id} ordinal="FIRST" plantillas={opcionesPlantillaConvocatoria} />
                </Disclosure>
              )}
              {emitidas.has('FIRST') && !emitidas.has('SECOND') && (
                <Disclosure summary="Emitir la segunda convocatoria">
                  <IssueCallForm assemblyId={asamblea.id} ordinal="SECOND" plantillas={opcionesPlantillaConvocatoria} />
                </Disclosure>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Padrón de la sesión</h2>
          {!padron.ok ? (
            <ErrorNotice title={padron.error.message} />
          ) : padron.data === null ? (
            <>
              <EmptyState
                title="El padrón no está congelado"
                description="Mientras no se congele, el quórum se calcularía sobre un padrón que cambia."
              />
              {puedeCongelar && previa.ok && asamblea.callDetails.length > 0 && (
                <div className="mt-4">
                  <Card>
                    <FreezeRosterForm
                      assemblyId={asamblea.id}
                      total={previa.data.total}
                      withVote={previa.data.withVote}
                    />
                  </Card>
                </div>
              )}
            </>
          ) : (
            <Card>
              <dl className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Congelado el:</dt>
                  <dd className="tabular-nums">{fechaHora.format(padron.data.frozenAt)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">Personas:</dt>
                  <dd className="tabular-nums">
                    {padron.data.entryCount} · {padron.data.withVote} con derecho a voto
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
                      <Badge tone="success">La huella corresponde con las entradas</Badge>
                    ) : (
                      <Badge tone="danger">La huella no corresponde</Badge>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                La huella se recalcula en cada consulta con la misma función que la produjo. Quien reciba el padrón
                puede ejecutarla por su cuenta y comparar.
              </p>
            </Card>
          )}
        </section>

        {padron.ok && padron.data !== null && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Asistencia y quórum</h2>

            {quorum.ok && quorum.data !== null && (
              <Card>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Convocatoria en curso:</dt>
                    <dd>{quorum.data.ordinal === 'FIRST' ? 'Primera' : 'Segunda'}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Regla:</dt>
                    <dd>{quorum.data.rule === 'HALF_PLUS_ONE' ? 'La mitad más uno' : 'Los presentes'}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Padrón:</dt>
                    <dd className="tabular-nums">{quorum.data.rosterSize}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Presentes:</dt>
                    <dd className="tabular-nums">
                      {quorum.data.present} ({quorum.data.presentWithVote} con voto)
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Hacen falta:</dt>
                    <dd className="tabular-nums">{quorum.data.required ?? 'Los presentes'}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">Quórum:</dt>
                    <dd>
                      {quorum.data.declaredAt !== null ? (
                        <Badge tone="success">Declarado por {quorum.data.declaredBy}</Badge>
                      ) : quorum.data.reached ? (
                        <Badge tone="accent">Alcanzado, sin declarar</Badge>
                      ) : (
                        <Badge tone="warning">No alcanzado</Badge>
                      )}
                    </dd>
                  </div>
                </dl>

                {puedeQuorum && quorum.data.declaredAt === null && quorum.data.reached && (
                  <div className="mt-4">
                    <DeclareQuorumForm
                      assemblyId={asamblea.id}
                      ordinal={quorum.data.ordinal}
                      present={quorum.data.present}
                      required={quorum.data.required}
                      base={quorum.data.rosterSize}
                      rosterIntact={quorum.data.rosterIntact}
                    />
                  </div>
                )}
              </Card>
            )}

            {puedeAsistencia && asamblea.status !== 'PUBLISHED' && (
              <div className="mt-4">
                <Disclosure summary="Registrar asistencia">
                  <AttendanceForm assemblyId={asamblea.id} elegibles={opcionesAsistentes} />
                </Disclosure>
              </div>
            )}

            {asistencia.ok && asistencia.data.length > 0 && (
              <div className="mt-4">
                <Disclosure summary={`Lista de asistencia (${asistencia.data.length})`}>
                  <ScrollableTable caption="Asistencia registrada">
                    <thead>
                      <tr className="border-b border-[var(--color-line)] text-left">
                        <th scope="col" className="p-2 font-medium">Persona</th>
                        <th scope="col" className="p-2 font-medium">Número</th>
                        <th scope="col" className="p-2 font-medium">Registro</th>
                        <th scope="col" className="p-2 font-medium">Hora</th>
                        <th scope="col" className="p-2 font-medium">Voto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistencia.data.map((fila) => (
                        <tr key={fila.id} className="border-b border-[var(--color-line)] last:border-0">
                          <td className="p-2">{fila.personName}</td>
                          <td className="p-2 font-mono text-xs">{fila.memberNumber}</td>
                          <td className="p-2">{METODO_ASISTENCIA[fila.method] ?? fila.method}</td>
                          <td className="p-2 tabular-nums">{fechaHora.format(fila.registeredAt)}</td>
                          <td className="p-2">{fila.hasVote ? 'Con voto' : 'Solo voz'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </ScrollableTable>
                </Disclosure>
              </div>
            )}
          </section>
        )}

        {padron.ok && padron.data !== null && asamblea.quorumDeclaredAt !== null && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Votaciones</h2>
            {!votaciones.ok ? (
              <ErrorNotice title={votaciones.error.message} />
            ) : votaciones.data.length === 0 ? (
              <EmptyState
                title="Sin votaciones programadas"
                description="Los puntos deliberativos, electivos, de reforma y de disolución se resuelven con una votación escrutada."
              />
            ) : (
              <div className="space-y-3">
                {votaciones.data.map((proceso) => (
                  <Card key={proceso.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold">{proceso.title}</h3>
                      <Badge tone="neutral">{proceso.status}</Badge>
                      <Badge tone="accent">{proceso.method === 'SECRET' ? 'Secreta' : 'Nominal'}</Badge>
                      {proceso.keyDestroyed && <Badge tone="success">Clave destruida</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      Abre {fechaHora.format(proceso.opensAt)} · cierra {fechaHora.format(proceso.closesAt)}
                    </p>
                    {proceso.status === 'OPEN' && (
                      <p className="mt-2 text-sm">
                        Depósito en{' '}
                        <Link href={`/votar/${proceso.publicId}`} className="underline underline-offset-4">
                          /votar/{proceso.publicId}
                        </Link>
                      </p>
                    )}

                    {proceso.results !== null && (
                      <div className="mt-3">
                        <Disclosure summary="Resultados">
                          <ul className="space-y-1 text-sm">
                            {proceso.results.byOption.map((opcion) => (
                              <li key={opcion.code}>
                                {opcion.label}: <strong className="tabular-nums">{opcion.votes}</strong>
                              </li>
                            ))}
                            <li>Blancos: {proceso.results.blank}</li>
                            <li>Nulos: {proceso.results.invalid}</li>
                            <li>
                              Credenciales emitidas {proceso.results.credentialsIssued}, consumidas{' '}
                              {proceso.results.credentialsSpent}, abstención {proceso.results.abstained}
                            </li>
                          </ul>
                          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                            Códigos escrutados, sin su sentido:
                          </p>
                          <p className="font-mono text-xs break-all">
                            {proceso.results.verificationCodes.join(' · ')}
                          </p>
                        </Disclosure>
                      </div>
                    )}

                    {(puedeVotar || puedeEscrutar) && (
                      <div className="mt-4 space-y-3">
                        {proceso.status === 'SCHEDULED' && puedeVotar && (
                          <Disclosure summary="Emitir credenciales y abrir">
                            <IssueCredentialsForm voteProcessId={proceso.id} />
                          </Disclosure>
                        )}
                        {(proceso.status === 'OPEN' ||
                          proceso.status === 'CLOSED' ||
                          proceso.status === 'TALLIED') && (
                          <TallyForms
                            voteProcessId={proceso.id}
                            status={proceso.status}
                            plantillas={opcionesPlantillaResultado}
                          />
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {puedeVotar && (
              <div className="mt-4">
                <Disclosure summary="Programar una votación">
                  <ScheduleVoteForm
                    assemblyId={asamblea.id}
                    rosterSnapshotId={padron.data.rosterId}
                    puntos={puntosVotables}
                  />
                </Disclosure>
              </div>
            )}
          </section>
        )}

        {asamblea.quorumDeclaredAt !== null && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Resoluciones</h2>
            {!resoluciones.ok ? (
              <ErrorNotice title={resoluciones.error.message} />
            ) : resoluciones.data.length === 0 ? (
              <EmptyState
                title="Sin resoluciones asentadas"
                description="El resultado de cada acuerdo se lee del escrutinio, no lo escribe quien redacta el acta."
              />
            ) : (
              <div className="space-y-3">
                {resoluciones.data.map((resolucion) => (
                  <Card key={resolucion.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-mono text-sm font-semibold">{resolucion.number}</h3>
                      <Badge tone={resolucion.outcome === 'APPROVED' ? 'success' : 'warning'}>
                        {resolucion.outcome === 'APPROVED'
                          ? 'Aprobada'
                          : resolucion.outcome === 'REJECTED'
                            ? 'Rechazada'
                            : 'Diferida'}
                      </Badge>
                      {resolucion.followUpStatus !== 'NOT_REQUIRED' && (
                        <Badge tone="accent">Seguimiento: {resolucion.followUpStatus}</Badge>
                      )}
                    </div>
                    {resolucion.agendaItemTitle !== null && (
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{resolucion.agendaItemTitle}</p>
                    )}
                    <p className="mt-2 whitespace-pre-line text-sm">{resolucion.text}</p>
                    {resolucion.effectiveFrom !== null && (
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        En vigor desde {fecha.format(resolucion.effectiveFrom)}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {puedeResolver && asamblea.status === 'IN_SESSION' && (
              <div className="mt-4">
                <Disclosure summary="Asentar una resolución">
                  <RecordResolutionForm
                    puntos={puntosSinResolucion}
                    votaciones={votacionesEscrutadas}
                    responsables={opcionesResponsable}
                  />
                </Disclosure>
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Documentos y firmas</h2>
          {!documentos.ok ? (
            <ErrorNotice title={documentos.error.message} />
          ) : documentos.data.length === 0 ? (
            <EmptyState
              title="Sin documentos emitidos"
              description="La convocatoria y el acta se emiten desde esta misma pantalla, y aparecen aquí con su folio."
            />
          ) : (
            <div className="space-y-3">
              {await Promise.all(
                documentos.data.map(async (documento) => {
                  const firmas = await documentSignatures(actor, documento.id);
                  return (
                    <Card key={documento.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base font-semibold">{documento.templateName}</h3>
                        <Badge tone={documento.status === 'ISSUED' ? 'success' : 'neutral'}>{documento.status}</Badge>
                        <span className="font-mono text-xs text-[var(--color-ink-soft)]">
                          {documento.folio ?? documento.publicId}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {documento.templateCode} v{documento.templateVersion} · emitido el{' '}
                        {fechaHora.format(documento.issuedAt)} · {documento.signatures} firma(s)
                      </p>

                      {firmas.ok && firmas.data.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {firmas.data.map((firma) => (
                            <li key={firma.id} className="flex flex-wrap items-center gap-2">
                              <span>{firma.signerName}</span>
                              {firma.officeName !== null && (
                                <span className="text-xs text-[var(--color-ink-soft)]">{firma.officeName}</span>
                              )}
                              <span className="text-xs tabular-nums">{fechaHora.format(firma.signedAt)}</span>
                              {firma.stillMatches ? (
                                <Badge tone="success">La firma corresponde con el archivo actual</Badge>
                              ) : (
                                <Badge tone="danger">El archivo cambió desde que se firmó</Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {documento.status === 'ISSUED' && (
                        <div className="mt-3">
                          <Disclosure summary="Firmar">
                            <SignDocumentForm
                              documentId={documento.id}
                              legalEntityId={asamblea.legalEntityId}
                              cargos={misCargos}
                            />
                          </Disclosure>
                        </div>
                      )}
                    </Card>
                  );
                }),
              )}
            </div>
          )}
        </section>

        {puedeActa && asamblea.status === 'IN_SESSION' && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Cerrar la sesión</h2>
            <Card>
              <PublishMinutesForm assemblyId={asamblea.id} plantillas={opcionesPlantillaActa} />
            </Card>
          </section>
        )}

        {asamblea.minutesDocumentId !== null && (
          <Notice tone="success" title="Acta publicada">
            <p>
              La sesión se cerró {asamblea.closedAt === null ? '' : `el ${fecha.format(asamblea.closedAt)}`} y su acta
              quedó emitida con nivel de publicación {asamblea.publicationLevel}.
            </p>
          </Notice>
        )}
      </div>
    </PageShell>
  );
}
