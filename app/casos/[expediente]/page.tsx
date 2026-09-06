import Link from 'next/link';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { assignableUsers, caseDetail, entitiesForReferral, peopleForCase, protocoloDeRiesgo } from '@/modules/cases';
import {
  NOMBRE_DE_ASIGNACION,
  CANALIZACIONES_CERRADAS,
  NOMBRE_DE_AUDIENCIA,
  NOMBRE_DE_CANALIZACION,
  NOMBRE_DE_DOCUMENTO,
  NOMBRE_DE_TAREA,
  TAREAS_CERRADAS,
  NOMBRE_DE_DOMINIO,
  NOMBRE_DE_ESTADO,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_RIESGO,
  NOMBRE_DE_PAPEL,
  NOMBRE_DE_RESULTADO,
  TONO_DE_PRIORIDAD,
} from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../../(publico)/contacto/labels';
import { AssessmentForm } from './assessment-form';
import { AddParticipantForm, RemoveParticipantForm } from './participants-forms';
import { AssignCaseForm, UnassignCaseForm } from './assignment-forms';
import { AdvanceTaskForm, AssignTaskForm, CreateTaskForm } from './task-forms';
import { EditMessageForm, SendMessageForm } from './message-forms';
import { AttachDocumentForm, OpenClinicalDocumentForm, RemoveDocumentForm } from './document-forms';
import { AcknowledgeEmergencyForm, CloseEmergencyForm, RaiseEmergencyForm } from './emergency-forms';
import { CloseCaseForm, ReopenCaseForm } from './closure-forms';
import {
  AcceptReferralForm,
  CloseReferralForm,
  ProposeReferralForm,
  RequestConsentForm,
  ReturnReferralForm,
  SendReferralForm,
} from './referral-forms';

/** Cómo se nombra en pantalla la calidad con la que alguien interviene. */
const NOMBRE_DE_CALIDAD: Record<string, string> = {
  UNION_MEMBER: 'agremiada',
  HONORARY_AFFILIATE: 'afiliación honoraria',
  PROTECTED_BENEFICIARY: 'persona beneficiaria',
  NONE: 'sin calidad en la organización',
};

export const metadata = { title: 'Expediente', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Un expediente (PRD §10.2).
 *
 * Abrir esta pantalla **escribe en la bitácora**: consta quién lo leyó y
 * cuándo. Se dice en la propia pantalla, igual que en la bandeja de mensajes,
 * porque quien lee tiene derecho a saber que su lectura queda registrada y
 * quien es objeto del expediente tiene derecho a preguntar quién lo ha leído.
 */
export default async function ExpedientePage({ params }: { params: Promise<{ expediente: string }> }) {
  const { expediente } = await params;
  const actor = await currentActor();
  const consulta = await caseDetail(actor, expediente);

  if (!consulta.ok) {
    return (
      <PageShell title="Expediente" width="lectura">
        <ErrorNotice title={consulta.error.message}>
          <Link href="/casos" className="underline underline-offset-4">
            Volver a mis expedientes
          </Link>
        </ErrorNotice>
      </PageShell>
    );
  }

  const datos = consulta.data;
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeZone: actor.timeZone });
  const puedeValorar = datos.status !== 'CLOSED';
  const opciones = puedeValorar ? await peopleForCase(actor, datos.id) : null;
  const personas = opciones !== null && opciones.ok ? opciones.data : [];

  // Quien no tiene la facultad de asignar no ve la sección: enseñar un
  // formulario que va a rechazar el envío no informa de nada.
  const candidaturas = puedeValorar ? await assignableUsers(actor, datos.id) : null;
  const puedeAsignar = candidaturas !== null && candidaturas.ok;

  // El equipo del expediente es a quien se le pueden encomendar tareas. Sale de
  // lo que ya se leyó: no hace falta otra consulta para saber quién lo lleva.
  // Quien es parte lee su expediente y no escribe en él desde aquí: su portal
  // es otra pantalla. Y la nota reservada solo se ofrece a quien puede leerla.
  const puedeComunicar = datos.lectura !== 'PERSONA' && datos.status !== 'CLOSED';
  const puedeReservar = datos.lectura === 'SUPERVISION';

  // Las entidades que pueden recibir una canalización y los documentos que
  // pueden viajar con ella. Se piden solo cuando hay a quién ofrecérselos.
  const entidades = puedeComunicar ? await entitiesForReferral(actor, datos.id) : null;

  // El protocolo se enseña **entero, en la pantalla**, cuando hay una marca de
  // riesgo viva: quien tiene delante una urgencia no debería tener que
  // navegar a otra página para saber a dónde acudir.
  const hayRiesgoVivo = datos.riesgos.some((marca) => marca.cerradaEl === null);
  const protocolo = hayRiesgoVivo ? await protocoloDeRiesgo() : null;
  const documentosCanalizables = datos.documentos.map((documento) => ({
    value: documento.archivoId,
    label: documento.descripcion,
  }));

  const equipo = datos.equipo.map((integrante) => ({
    value: integrante.usuarioId,
    label: `${integrante.nombre} · ${NOMBRE_DE_ASIGNACION[integrante.rol]}`,
  }));

  return (
    <PageShell
      title={datos.folio}
      description={`${REQUEST_TYPE_LABELS[datos.caseType].label} · ${NOMBRE_DE_DOMINIO[datos.domain]} · ${datos.legalEntityShortName}`}
      width="lectura"
    >
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={TONO_DE_PRIORIDAD[datos.priority]}>{NOMBRE_DE_PRIORIDAD[datos.priority]}</Badge>
          <Badge tone="neutral">{NOMBRE_DE_ESTADO[datos.status]}</Badge>
          <span className="text-sm text-[var(--color-ink-soft)]">Abierto el {fecha.format(datos.openedAt)}</span>
          {datos.dueAt !== null && (
            <span className="text-sm text-[var(--color-ink-soft)]">Plazo: {fecha.format(datos.dueAt)}</span>
          )}
        </div>

        <Section title="Lo que se contó" level={2}>
          <Card>
            <p className="whitespace-pre-wrap text-lg leading-relaxed">{datos.originalSummary}</p>
          </Card>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]" data-secondary>
            Es el relato original y no se puede modificar: la aplicación no tiene privilegio para alterarlo.
            {datos.folioDeLaSolicitud !== null && ` Viene del mensaje ${datos.folioDeLaSolicitud}.`}
          </p>
        </Section>

        <Section title="Quién lo lleva" level={2}>
          <Card>
            <ul className="space-y-3">
              {datos.equipo.map((integrante) => (
                <li key={integrante.id} className="border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0">
                  <span className="font-medium">{integrante.nombre}</span>
                  <span className="text-[var(--color-ink-soft)]"> · {NOMBRE_DE_ASIGNACION[integrante.rol]}</span>
                  {puedeAsignar && (
                    <div className="mt-3">
                      <UnassignCaseForm assignmentId={integrante.id} nombre={integrante.nombre} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Solo quien está asignado alcanza este expediente. Pertenecer al área no basta, y tu lectura de ahora
              queda registrada con tu nombre.
              {datos.territorio !== null && ` El expediente es de ${datos.territorio}.`}
            </p>
          </Card>
        </Section>

        {puedeAsignar && candidaturas.ok && (
          <Section title="Encomendarlo a alguien" level={2}>
            <Card>
              <AssignCaseForm caseId={datos.id} candidatas={candidaturas.data} />
            </Card>
          </Section>
        )}

        {datos.status === 'CLOSED' && datos.closeOutcome !== null && (
          <Notice title={`Cerrado: ${NOMBRE_DE_RESULTADO[datos.closeOutcome]}`} tone="neutral" live="none">
            <p>{datos.closeReason}</p>
            {datos.closedAt !== null && <p className="mt-2">Se cerró el {fecha.format(datos.closedAt)}.</p>}
            {datos.reopenCount > 0 && (
              <p className="mt-2">Se ha reabierto {datos.reopenCount} vez/veces.</p>
            )}
          </Notice>
        )}

        <Section title="Quién figura en el expediente" level={2}>
          <Card>
            {datos.participantes.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">Todavía no figura nadie.</p>
            ) : (
              <ul className="space-y-3">
                {datos.participantes.map((participante) => (
                  <li key={participante.id} className="border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0">
                    <span className="font-medium">{participante.nombre}</span>
                    <span className="block text-sm text-[var(--color-ink-soft)]">
                      {NOMBRE_DE_PAPEL[participante.papel]} · {NOMBRE_DE_CALIDAD[participante.calidad]} ·{' '}
                      {participante.veElExpediente ? 've el expediente' : 'no lo ve'}
                    </span>
                    {puedeValorar && participante.papel !== 'APPLICANT' && (
                      <div className="mt-3">
                        <RemoveParticipantForm participantId={participante.id} nombre={participante.nombre} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              La calidad se lee del padrón al agregar a cada persona y se conserva: si después pierde la membresía,
              el expediente sigue diciendo con qué calidad intervino.
            </p>
          </Card>
        </Section>

        {puedeValorar && (
          <Section title="Agregar a alguien" level={2}>
            <Card>
              <AddParticipantForm caseId={datos.id} personas={personas} />
            </Card>
          </Section>
        )}

        <Section title="Riesgo inmediato" level={2}>
          {protocolo !== null && (
            <Notice title={protocolo.titulo} tone="danger" live="alert">
              <p className="whitespace-pre-wrap">{protocolo.cuerpo}</p>
              <p className="mt-2">
                Estas rutas las atienden personas e instituciones, no este sistema. Marcar el riesgo aquí no llama a
                ninguna de ellas.
              </p>
            </Notice>
          )}
          <Card>
            {datos.riesgos.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">No hay marcas de riesgo en este expediente.</p>
            ) : (
              <ul className="space-y-4">
                {datos.riesgos.map((marca) => (
                  <li key={marca.id} className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={marca.cerradaEl === null ? 'danger' : 'neutral'}>
                        {NOMBRE_DE_RIESGO[marca.clase]}
                      </Badge>
                      <span className="text-sm text-[var(--color-ink-soft)]">
                        Marcado el {fecha.format(marca.levantadaEl)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      {marca.recogidaPor === null
                        ? 'Todavía nadie se ha hecho cargo.'
                        : `Se hizo cargo ${marca.recogidaPor}${marca.recogidaEl === null ? '' : ` el ${fecha.format(marca.recogidaEl)}`}.`}
                    </p>
                    {marca.resolucion !== null && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">{marca.resolucion}</p>
                    )}
                    {puedeComunicar && marca.cerradaEl === null && (
                      <div className="mt-4 space-y-4">
                        {marca.recogidaEl === null ? (
                          <AcknowledgeEmergencyForm flagId={marca.id} />
                        ) : (
                          <CloseEmergencyForm flagId={marca.id} />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>

        {puedeComunicar && (
          <Section title="Marcar riesgo inmediato" level={2}>
            <Card>
              <RaiseEmergencyForm caseId={datos.id} />
            </Card>
          </Section>
        )}

        <Section title="Canalizaciones" level={2}>
          <Card>
            {datos.canalizaciones.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">Este expediente no se ha canalizado a ningún sitio.</p>
            ) : (
              <ul className="space-y-4">
                {datos.canalizaciones.map((canalizacion) => (
                  <li
                    key={canalizacion.id}
                    className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {canalizacion.destinatarioExterno ?? canalizacion.haciaEntidad}
                      </span>
                      <Badge tone={canalizacion.estado === 'ACCEPTED' ? 'success' : 'neutral'}>
                        {NOMBRE_DE_CANALIZACION[canalizacion.estado]}
                      </Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{canalizacion.motivo}</p>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      Se transfieren: {canalizacion.camposCompartidos.join(', ')}
                      {canalizacion.archivosCompartidos > 0 &&
                        ` · ${canalizacion.archivosCompartidos} documento(s)`}
                    </p>
                    {canalizacion.motivoDeDevolucion !== null && (
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                        Motivo de la devolución: {canalizacion.motivoDeDevolucion}
                      </p>
                    )}
                    {puedeComunicar && !CANALIZACIONES_CERRADAS.includes(canalizacion.estado) && (
                      <div className="mt-4 space-y-4">
                        {canalizacion.estado === 'PROPOSED' && (
                          <RequestConsentForm
                            referralId={canalizacion.id}
                            explicacion={canalizacion.explicacion}
                          />
                        )}
                        {canalizacion.estado === 'AWAITING_CONSENT' && (
                          <SendReferralForm referralId={canalizacion.id} />
                        )}
                        {canalizacion.estado === 'SENT' && (
                          <>
                            <AcceptReferralForm referralId={canalizacion.id} />
                            <ReturnReferralForm referralId={canalizacion.id} />
                          </>
                        )}
                        {canalizacion.estado === 'ACCEPTED' && (
                          <>
                            <CloseReferralForm referralId={canalizacion.id} />
                            <ReturnReferralForm referralId={canalizacion.id} />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Aquí se ve en qué estado va cada canalización, no lo que se dice dentro de ella. Las notas reservadas
              no están entre lo que se puede transferir, así que no viajan ni por descuido.
            </p>
          </Card>
        </Section>

        {puedeComunicar && entidades !== null && entidades.ok && (
          <Section title="Canalizar el expediente" level={2}>
            <Card>
              <ProposeReferralForm
                caseId={datos.id}
                entidades={entidades.data}
                documentos={documentosCanalizables}
              />
            </Card>
          </Section>
        )}

        <Section title="Documentos" level={2}>
          <Card>
            {datos.documentos.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">Todavía no hay documentos.</p>
            ) : (
              <ul className="space-y-4">
                {datos.documentos.map((documento) => (
                  <li key={documento.id} className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{documento.descripcion}</span>
                      <Badge tone="neutral">{NOMBRE_DE_DOCUMENTO[documento.clase]}</Badge>
                      {documento.visibleParaLaPersona && <Badge tone="accent">La persona lo ve</Badge>}
                    </div>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {documento.nombreDeArchivo} · reserva {documento.clasificacion}
                    </p>
                    <div className="mt-3 space-y-3">
                      {documento.exigeMotivo ? (
                        <OpenClinicalDocumentForm fileObjectId={documento.archivoId} />
                      ) : (
                        <a
                          href={`/api/v1/files/${documento.archivoId}/pase`}
                          className="text-sm underline underline-offset-4"
                        >
                          Abrir el documento
                        </a>
                      )}
                      {puedeComunicar && (
                        <RemoveDocumentForm documentId={documento.id} descripcion={documento.descripcion} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Abrir un documento emite un pase de vigencia corta, y la política se vuelve a comprobar al canjearlo:
              un pase de hace un rato no sirve si entretanto dejaste de llevar el expediente.
            </p>
          </Card>
        </Section>

        {puedeComunicar && (
          <Section title="Agregar un documento" level={2}>
            <Card>
              <AttachDocumentForm caseId={datos.id} />
            </Card>
          </Section>
        )}

        <Section title="Comunicaciones" level={2}>
          <Card>
            {datos.comunicaciones.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">Todavía no hay comunicaciones.</p>
            ) : (
              <ul className="space-y-4">
                {datos.comunicaciones.map((mensaje) => (
                  <li key={mensaje.id} className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={mensaje.audiencia === 'SUPERVISION_ONLY' ? 'warning' : 'neutral'}>
                        {NOMBRE_DE_AUDIENCIA[mensaje.audiencia]}
                      </Badge>
                      <span className="text-sm text-[var(--color-ink-soft)]">
                        {mensaje.autor ?? 'Sin autor registrado'} · {fecha.format(mensaje.enviadaEl)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{mensaje.cuerpo}</p>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      {mensaje.corregidaEl !== null && 'Corregida antes de que nadie la leyera. '}
                      {mensaje.audiencia === 'PERSON_AND_TEAM' &&
                        (mensaje.acuses === 0 ? 'Todavía sin acuse de lectura.' : `Leída por ${mensaje.acuses}.`)}
                    </p>
                    {mensaje.corregible && (
                      <div className="mt-3">
                        <EditMessageForm messageId={mensaje.id} cuerpo={mensaje.cuerpo} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Lo que ves aquí es lo que te corresponde leer: el recorte se hace en la consulta, no al pintar la
              pantalla.
            </p>
          </Card>
        </Section>

        {puedeComunicar && (
          <Section title="Comunicar algo" level={2}>
            <Card>
              <SendMessageForm caseId={datos.id} puedeReservar={puedeReservar} />
            </Card>
          </Section>
        )}

        <Section title="Tareas y plazos" level={2}>
          <Card>
            {datos.tareas.length === 0 ? (
              <p className="text-[var(--color-ink-soft)]">Todavía no hay tareas abiertas.</p>
            ) : (
              <ul className="space-y-4">
                {datos.tareas.map((tarea) => (
                  <li key={tarea.id} className="border-b border-[var(--color-line)] pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tarea.titulo}</span>
                      <Badge tone={tarea.vencida ? 'danger' : 'neutral'}>{NOMBRE_DE_TAREA[tarea.estado]}</Badge>
                      {tarea.vencida && <Badge tone="danger">Fuera de plazo</Badge>}
                    </div>
                    <p className="text-sm text-[var(--color-ink-soft)]">
                      {tarea.responsable ?? 'Sin responsable'}
                      {tarea.plazo !== null && ` · para el ${fecha.format(tarea.plazo)}`}
                      {tarea.terminadaEl !== null && ` · terminada el ${fecha.format(tarea.terminadaEl)}`}
                    </p>
                    {tarea.descripcion !== null && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">{tarea.descripcion}</p>
                    )}
                    {tarea.motivo !== null && (
                      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Motivo: {tarea.motivo}</p>
                    )}
                    {puedeValorar && !TAREAS_CERRADAS.includes(tarea.estado) && (
                      <div className="mt-4 space-y-4">
                        <AdvanceTaskForm taskId={tarea.id} titulo={tarea.titulo} />
                        <AssignTaskForm taskId={tarea.id} equipo={equipo} actual={tarea.responsableId} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Estar fuera de plazo se compara al leer, no se guarda: una marca guardada envejecería mal y diría que
              hay tiempo cuando ya no lo hay.
            </p>
          </Card>
        </Section>

        {puedeValorar && (
          <Section title="Abrir una tarea" level={2}>
            <Card>
              <CreateTaskForm caseId={datos.id} equipo={equipo} />
            </Card>
          </Section>
        )}

        <Section title={datos.status === 'CLOSED' ? 'Reabrir el expediente' : 'Cerrar el expediente'} level={2}>
          <Card>
            {datos.status === 'CLOSED' ? (
              <ReopenCaseForm caseId={datos.id} veces={datos.reopenCount} />
            ) : (
              <CloseCaseForm caseId={datos.id} />
            )}
          </Card>
        </Section>

        <Section title="Valoración" level={2}>
          {puedeValorar ? (
            <Card>
              <AssessmentForm
                caseId={datos.id}
                valoracion={datos.humanAssessment}
                prioridad={datos.priority}
                estado={datos.status}
                plazo={datos.dueAt === null ? null : datos.dueAt.toISOString().slice(0, 10)}
              />
            </Card>
          ) : (
            <Card>
              <p className="whitespace-pre-wrap">{datos.humanAssessment ?? 'No se llegó a valorar.'}</p>
            </Card>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
