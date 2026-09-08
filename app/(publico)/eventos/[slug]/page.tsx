import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Badge, EmptyState, LinkButton, PageShell, Prose, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { eventDetailBySlug, eventMaterialsForViewer } from '@/modules/events';
import { formatDateTime } from '@/platform/i18n/format';

export const metadata: Metadata = { title: 'Evento', robots: { index: true, follow: true } };
export const dynamic = 'force-dynamic';

const CLASE: Record<string, string> = {
  ASSEMBLY_PUBLIC: 'Asamblea pública',
  COURSE: 'Curso',
  WORKSHOP: 'Taller',
  DIPLOMA: 'Diplomado',
  MEETING: 'Reunión',
  CAMPAIGN: 'Campaña',
};

/**
 * Detalle público de un evento (PRD §16.3).
 *
 * Respeta la visibilidad: un evento para agremiados o por invitación no se ve
 * desde aquí sin la sesión o la inscripción que corresponde —lo decide el caso de
 * uso, que responde «no existe» a quien no puede verlo—.
 */
export default async function EventoPublicoDetallePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await currentActor();
  const detalle = await eventDetailBySlug(actor, slug);
  if (!detalle.ok) notFound();
  const e = detalle.data;
  const materiales = await eventMaterialsForViewer(actor, e.eventId);

  return (
    <PageShell title={e.title} description={`${CLASE[e.kind] ?? e.kind} · ${formatDateTime(e.startsAt)}`}>
      <Section title="Sobre el evento">
        <Prose>
          <p>
            <Badge tone="neutral">{CLASE[e.kind] ?? e.kind}</Badge>{' '}
            {e.registrationOpen && <Badge tone="success">Inscripción abierta</Badge>}
          </p>
          <p>Empieza el {formatDateTime(e.startsAt)} y termina el {formatDateTime(e.endsAt)}.</p>
          {e.venue !== null && <p>Lugar: {e.venue}.</p>}
          {e.capacity !== null && <p>Aforo: {e.capacity} personas.</p>}
          {e.membersOnly && <p>Este evento es para personas agremiadas con membresía activa.</p>}
          {e.issuesConstancy && <p>Al completarlo se emite una constancia verificable.</p>}
        </Prose>
      </Section>

      <Section title="Inscripción">
        {e.myStatus !== null ? (
          <p>Ya tienes una inscripción en este evento. Puedes gestionarla desde tu cuenta.</p>
        ) : (
          <div className="space-y-3">
            <p>Para inscribirte entra con tu cuenta y ve a tus eventos.</p>
            <LinkButton href="/mi/eventos">Ir a mis eventos</LinkButton>
          </div>
        )}
      </Section>

      {materiales.ok && materiales.data.length > 0 && (
        <Section title="Materiales">
          <ul className="space-y-2">
            {materiales.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3">
                <a href={`/api/v1/files/${m.fileObjectId}/pase`} className="underline underline-offset-4">
                  {m.title}
                </a>
                {m.membersOnly && <Badge tone="warning">Reservado a inscritos</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {materiales.ok && materiales.data.length === 0 && e.myStatus !== null && (
        <Section title="Materiales">
          <EmptyState title="Sin materiales todavía" description="Cuando la organización publique lecturas o presentaciones, aparecerán aquí." />
        </Section>
      )}
    </PageShell>
  );
}
