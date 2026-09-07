import type { Metadata } from 'next';
import { Badge, Card, EmptyState, PageShell, Section } from '@/design-system/primitives';
import { publicEventCalendar } from '@/modules/events';
import { formatDateTime } from '@/platform/i18n/format';

export const metadata: Metadata = {
  title: 'Eventos',
  description: 'Los eventos públicos de Fuerza Índigo: asambleas, cursos y talleres abiertos.',
};

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
 * Calendario público de eventos (PRD §16.3).
 *
 * Solo aparecen los eventos marcados como públicos. Para inscribirse, quien tiene
 * cuenta entra a su portal; los demás ven que existen y cuándo.
 */
export default async function EventosPublicosPage() {
  const eventos = await publicEventCalendar();

  return (
    <PageShell
      title="Eventos"
      description="Las actividades abiertas de la organización. Para inscribirte, entra con tu cuenta."
    >
      <Section title="Próximos eventos">
        {eventos.length === 0 ? (
          <EmptyState title="No hay eventos públicos próximos" description="Cuando se anuncie uno abierto al público aparecerá aquí." />
        ) : (
          <ul className="space-y-3">
            {eventos.map((e) => (
              <li key={e.slug}>
                <Card>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{CLASE[e.kind] ?? e.kind}</Badge>
                      {e.registrationOpen && <Badge tone="success">Inscripción abierta</Badge>}
                      <span className="ml-auto text-sm text-[var(--color-ink-soft)]">{formatDateTime(e.startsAt)}</span>
                    </div>
                    <p className="font-semibold">{e.title}</p>
                    {e.venue !== null && <p className="text-sm text-[var(--color-ink-soft)]">{e.venue}</p>}
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
