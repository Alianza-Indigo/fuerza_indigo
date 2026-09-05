import Link from 'next/link';
import {
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ErrorNotice,
  PageShell,
  type Tone,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { resolutionList } from '@/modules/assembly';
import { FollowUpForm } from '../asambleas/session-forms';

export const metadata = { title: 'Seguimiento de acuerdos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const SEGUIMIENTO: Record<string, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: 'Sin seguimiento', tone: 'neutral' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  IN_PROGRESS: { label: 'En curso', tone: 'accent' },
  COMPLETED: { label: 'Cumplido', tone: 'success' },
  OVERDUE: { label: 'Vencido', tone: 'danger' },
};

/**
 * Seguimiento de acuerdos (PRD §9.4; F5-ASA-007).
 *
 * Un acuerdo sin seguimiento es una declaración; con seguimiento es un
 * compromiso con responsable, plazo y evidencia. La pantalla ordena por lo que
 * está por vencer, que es lo que hace falta mirar.
 */
export default async function AcuerdosPage() {
  const actor = await currentActor();

  const acuerdos = await resolutionList(actor, { pendingFollowUp: true });
  const puedeSeguir = can({ ...actor, reason: 'seguimiento de acuerdos' }, 'assembly.followup.manage', {
    kind: 'Resolution',
  }).allowed;

  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const ahora = new Date();

  return (
    <PageShell
      title="Seguimiento de acuerdos"
      description="Lo que la asamblea acordó y qué se ha hecho con ello. Dar por cumplido un acuerdo exige evidencia."
      width="ancha"
    >
      <div className="space-y-6">
        {!acuerdos.ok ? (
          <ErrorNotice title={acuerdos.error.message} />
        ) : acuerdos.data.length === 0 ? (
          <EmptyState
            title="No hay acuerdos pendientes de seguimiento"
            description="Aparecerán aquí los que la asamblea apruebe con responsable y plazo."
          />
        ) : (
          acuerdos.data.map((acuerdo) => {
            const estado = SEGUIMIENTO[acuerdo.followUpStatus] ?? {
              label: acuerdo.followUpStatus,
              tone: 'neutral' as Tone,
            };
            const vencido = acuerdo.followUpDueAt !== null && acuerdo.followUpDueAt < ahora;
            return (
              <Card key={acuerdo.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-mono text-sm font-semibold">{acuerdo.number}</h2>
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                  {vencido && acuerdo.followUpStatus !== 'COMPLETED' && <Badge tone="danger">Fuera de plazo</Badge>}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  Asamblea{' '}
                  <Link
                    href={`/institucional/asambleas/${acuerdo.assemblyPublicId}`}
                    className="underline underline-offset-4"
                  >
                    {acuerdo.assemblyPublicId}
                  </Link>{' '}
                  del {fecha.format(acuerdo.assemblyScheduledAt)}
                  {acuerdo.followUpOwner !== null && ` · responsable ${acuerdo.followUpOwner}`}
                  {acuerdo.followUpDueAt !== null && ` · plazo ${fecha.format(acuerdo.followUpDueAt)}`}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm">{acuerdo.text}</p>

                {puedeSeguir && (
                  <div className="mt-3">
                    <Disclosure summary="Actualizar el seguimiento">
                      <FollowUpForm resolutionId={acuerdo.id} />
                    </Disclosure>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
