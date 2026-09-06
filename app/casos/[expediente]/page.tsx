import Link from 'next/link';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { assignableUsers, caseDetail, peopleForCase } from '@/modules/cases';
import {
  NOMBRE_DE_ASIGNACION,
  NOMBRE_DE_TAREA,
  TAREAS_CERRADAS,
  NOMBRE_DE_DOMINIO,
  NOMBRE_DE_ESTADO,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_PAPEL,
  NOMBRE_DE_RESULTADO,
  TONO_DE_PRIORIDAD,
} from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../../(publico)/contacto/labels';
import { AssessmentForm } from './assessment-form';
import { AddParticipantForm, RemoveParticipantForm } from './participants-forms';
import { AssignCaseForm, UnassignCaseForm } from './assignment-forms';
import { AdvanceTaskForm, AssignTaskForm, CreateTaskForm } from './task-forms';

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
