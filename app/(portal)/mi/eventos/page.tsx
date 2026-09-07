import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { memberEventCalendar, myEventRegistrations } from '@/modules/events';
import { formatDateTime } from '@/platform/i18n/format';
import { CLASE_DE_EVENTO, MI_ESTADO } from './etiquetas';
import { CancelButton, RegisterButton } from './event-buttons';

export const metadata = { title: 'Eventos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Los eventos que la persona puede ver y a los que puede inscribirse (PRD §16.3).
 */
export default async function MisEventosPage() {
  const actor = await currentActor();
  if (actor.personId === null) {
    return (
      <PageShell title="Eventos">
        <ErrorNotice title="Para ver e inscribirte en eventos necesitas entrar con tu cuenta." />
      </PageShell>
    );
  }

  const [calendario, mias] = await Promise.all([memberEventCalendar(actor), myEventRegistrations(actor)]);
  if (!calendario.ok) {
    return <PageShell title="Eventos"><ErrorNotice title={calendario.error.message} /></PageShell>;
  }

  return (
    <PageShell title="Eventos" description="El calendario de la organización. Inscríbete a lo que te interese; si el cupo está lleno, quedas en lista de espera.">
      {mias.ok && mias.data.length > 0 && (
        <Section title="Mis inscripciones">
          <ul className="space-y-2">
            {mias.data.map((r) => (
              <li key={r.eventId}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/eventos/${r.slug}`} className="font-medium underline underline-offset-4">{r.title}</Link>
                    <Badge tone={MI_ESTADO[r.status].tone}>{MI_ESTADO[r.status].label}</Badge>
                    <span className="ml-auto text-sm text-[var(--color-ink-soft)]">{formatDateTime(r.startsAt)}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Próximos eventos">
        {calendario.data.length === 0 ? (
          <EmptyState title="No hay eventos próximos" description="Cuando se publique un evento abierto aparecerá aquí." />
        ) : (
          <ul className="space-y-3">
            {calendario.data.map((e) => (
              <li key={e.eventId}>
                <Card>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{CLASE_DE_EVENTO[e.kind]}</Badge>
                      {e.myStatus !== null && <Badge tone={MI_ESTADO[e.myStatus].tone}>{MI_ESTADO[e.myStatus].label}</Badge>}
                      <span className="ml-auto text-sm text-[var(--color-ink-soft)]">{formatDateTime(e.startsAt)}</span>
                    </div>
                    <div>
                      <p className="font-semibold">{e.title}</p>
                      {e.venue !== null && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{e.venue}</p>}
                    </div>
                    <div>
                      {e.myStatus === null && e.registrationOpen && <RegisterButton eventId={e.eventId} />}
                      {e.myStatus === null && !e.registrationOpen && (
                        <p className="text-sm text-[var(--color-ink-soft)]">La inscripción todavía no está abierta.</p>
                      )}
                      {(e.myStatus === 'REGISTERED' || e.myStatus === 'WAITLISTED' || e.myStatus === 'CONFIRMED') && (
                        <CancelButton eventId={e.eventId} />
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
