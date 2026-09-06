import Link from 'next/link';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { caseDetail } from '@/modules/cases';
import {
  NOMBRE_DE_DOMINIO,
  NOMBRE_DE_ESTADO,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_RESULTADO,
  TONO_DE_PRIORIDAD,
} from '@/modules/cases/domain';
import { REQUEST_TYPE_LABELS } from '../../(publico)/contacto/labels';
import { AssessmentForm } from './assessment-form';

export const metadata = { title: 'Expediente', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ROL_EN_EL_EQUIPO: Record<string, string> = {
  OWNER: 'Responsable',
  SUPPORT: 'Apoyo',
  SUPERVISOR: 'Supervisión',
  OBSERVER: 'Observa',
};

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
            <ul className="space-y-2">
              {datos.equipo.map((integrante) => (
                <li key={`${integrante.nombre}-${integrante.rol}`}>
                  <span className="font-medium">{integrante.nombre}</span>
                  <span className="text-[var(--color-ink-soft)]"> · {ROL_EN_EL_EQUIPO[integrante.rol] ?? integrante.rol}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]" data-secondary>
              Solo quien está asignado alcanza este expediente. Pertenecer al área no basta, y tu lectura de ahora
              queda registrada con tu nombre.
            </p>
          </Card>
        </Section>

        {datos.status === 'CLOSED' && datos.closeOutcome !== null && (
          <Notice title={`Cerrado: ${NOMBRE_DE_RESULTADO[datos.closeOutcome]}`} tone="neutral" live="none">
            <p>{datos.closeReason}</p>
            {datos.closedAt !== null && <p className="mt-2">Se cerró el {fecha.format(datos.closedAt)}.</p>}
            {datos.reopenCount > 0 && (
              <p className="mt-2">Se ha reabierto {datos.reopenCount} vez/veces.</p>
            )}
          </Notice>
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
