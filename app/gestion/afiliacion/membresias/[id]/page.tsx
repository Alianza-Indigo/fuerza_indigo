import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, ErrorNotice, Notice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { membershipDetail } from '@/modules/membership';
import { can } from '@/platform/authz/policy';
import { ESTADO_DE_MEMBRESIA, MOTIVOS_DE_BAJA } from '../etiquetas';
import { EndForm, ReinstateForm, SuspendForm } from './membership-forms';

export const metadata = { title: 'Membresía', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Expediente de una membresía (PRD §3.6).
 *
 * Lo primero que se ve es el historial entero de estados, no el estado actual
 * a secas: la pregunta que se hace sobre una membresía casi nunca es «cómo
 * está» sino «qué le pasó», y esa solo la contesta la sucesión de cambios con
 * su motivo y su fecha.
 */
export default async function MembresiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await membershipDetail(actor, id);
  if (!detalle.ok) {
    if (detalle.error.code === 'NOT_FOUND') notFound();
    return (
      <PageShell title="Membresía">
        <ErrorNotice title={detalle.error.message} />
      </PageShell>
    );
  }

  const membresia = detalle.data;
  const motivo = 'comprobación de facultades para mostrar la sección';
  const puedeSuspender = can({ ...actor, reason: motivo }, 'membership.record.suspend', {
    kind: 'Membership',
    id: membresia.id,
  }).allowed;
  const puedeTerminar = can({ ...actor, reason: motivo }, 'membership.record.terminate', {
    kind: 'Membership',
    id: membresia.id,
  }).allowed;

  const viva = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'DISCIPLINARY_PROCESS'].includes(membresia.status);
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: actor.timeZone });
  const fechaHora = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });
  const nombreDelMotivo = (codigo: string | null): string =>
    MOTIVOS_DE_BAJA.find((uno) => uno.value === codigo)?.label ?? codigo ?? '';

  return (
    <PageShell
      title={`Membresía ${membresia.memberNumber}`}
      description={`${membresia.personName} · ${membresia.membershipType}`}
    >
      <div className="space-y-8">
        <p>
          <Link href={`/gestion/registro/${membresia.personId}`} className="underline underline-offset-4">
            ← Ver el registro maestro de la persona
          </Link>
        </p>

        <Section title="Estado">
          <p className="text-lg">
            <Badge
              tone={
                membresia.status === 'ACTIVE'
                  ? 'success'
                  : membresia.status === 'SUSPENDED' || membresia.status === 'EXPIRED'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {ESTADO_DE_MEMBRESIA[membresia.status] ?? membresia.status}
            </Badge>
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            {membresia.legalEntity} · activa desde el {fecha.format(membresia.startedAt)}
            {membresia.expiresAt === null
              ? ' · sin fecha de vencimiento'
              : ` · vigencia hasta el ${fecha.format(membresia.expiresAt)}`}
            {membresia.territory === null ? '' : ` · ${membresia.territory}`}
          </p>
          <p className="mt-2 text-sm">
            {membresia.grantsPoliticalRights
              ? 'Esta calidad da voz y voto en asambleas.'
              : 'Esta calidad no da derechos electorales sindicales.'}
          </p>

          {membresia.endedAt !== null && (
            <Notice tone="neutral" title={`Terminó el ${fecha.format(membresia.endedAt)}`}>
              <p>Motivo: {nombreDelMotivo(membresia.endReason)}.</p>
            </Notice>
          )}
        </Section>

        <Section title="Qué le ha pasado" description="Cada cambio con su motivo, su autor y su fecha.">
          <ol className="space-y-3">
            {membresia.events.map((evento) => (
              <li key={evento.id} className="rounded-lg border border-[var(--color-line)] p-4">
                <p className="font-medium">
                  {evento.fromStatus === null
                    ? `Nació ${ESTADO_DE_MEMBRESIA[evento.toStatus]?.toLowerCase() ?? evento.toStatus}`
                    : `${ESTADO_DE_MEMBRESIA[evento.fromStatus] ?? evento.fromStatus} → ${ESTADO_DE_MEMBRESIA[evento.toStatus] ?? evento.toStatus}`}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{evento.reason}</p>
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                  {fechaHora.format(evento.occurredAt)}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {viva && (puedeSuspender || puedeTerminar) && (
          <Section title="Cambiar el estado" description="Todo cambio exige motivo escrito.">
            <div className="space-y-6">
              {puedeSuspender && membresia.status === 'ACTIVE' && (
                <Card>
                  <h3 className="mb-3 font-semibold">Suspender</h3>
                  <SuspendForm membershipId={membresia.id} />
                </Card>
              )}
              {puedeSuspender && membresia.status === 'SUSPENDED' && (
                <Card>
                  <h3 className="mb-3 font-semibold">Levantar la suspensión</h3>
                  <ReinstateForm membershipId={membresia.id} />
                </Card>
              )}
              {puedeTerminar && (
                <Card>
                  <h3 className="mb-3 font-semibold">Terminar</h3>
                  <EndForm membershipId={membresia.id} />
                </Card>
              )}
            </div>
          </Section>
        )}
      </div>
    </PageShell>
  );
}
