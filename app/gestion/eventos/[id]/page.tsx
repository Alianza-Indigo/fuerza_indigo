import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, ForbiddenNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { eventDetailForStaff, eventRegistrations } from '@/modules/events';
import { formatDateTime } from '@/platform/i18n/format';
import { CLASE_DE_EVENTO, ESTADO_DE_EVENTO, ESTADO_DE_INSCRIPCION, MODALIDAD, VISIBILIDAD } from '../etiquetas';
import { EventLifecycle } from './lifecycle';

export const metadata = { title: 'Evento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EventoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await eventDetailForStaff(actor, id);
  if (!detalle.ok) {
    if (detalle.error.code === 'FORBIDDEN') return <PageShell title="Evento"><ForbiddenNotice /></PageShell>;
    notFound();
  }
  const e = detalle.data;
  const estado = ESTADO_DE_EVENTO[e.status];
  const inscripciones = await eventRegistrations(actor, id);

  return (
    <PageShell title={e.title} description={`${CLASE_DE_EVENTO[e.kind]} · ${MODALIDAD[e.modality]} · ${VISIBILIDAD[e.visibility]}`} width="ancha">
      <div className="space-y-8">
        <Section title="Estado">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={estado.tone}>{estado.label}</Badge>
            <span className="text-sm text-[var(--color-ink-soft)]">
              {formatDateTime(e.startsAt)} — {formatDateTime(e.endsAt)}
            </span>
          </div>
          <div className="mt-4"><EventLifecycle eventId={e.id} status={e.status} /></div>
        </Section>

        <Section title="Ficha">
          <Card>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Lugar</dt><dd>{e.venue ?? '—'}</dd></div>
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Aforo</dt><dd>{e.capacity === null ? 'Sin límite' : e.capacity}</dd></div>
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Inscritos</dt><dd>{e.registeredCount}{e.waitlistCount > 0 ? ` · ${e.waitlistCount} en espera` : ''}</dd></div>
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Solo agremiados</dt><dd>{e.membersOnly ? 'Sí' : 'No'}</dd></div>
            </dl>
          </Card>
        </Section>

        <Section title={`Inscripciones${inscripciones.ok ? ` · ${inscripciones.data.length}` : ''}`}>
          {!inscripciones.ok ? (
            inscripciones.error.code === 'FORBIDDEN' ? <ForbiddenNotice /> : <EmptyState title="Sin inscripciones" description="Nadie se ha inscrito todavía." />
          ) : inscripciones.data.length === 0 ? (
            <EmptyState title="Sin inscripciones" description="Cuando alguien se inscriba aparecerá aquí, con su lugar o su sitio en la lista de espera." />
          ) : (
            <ScrollableTable caption="Personas inscritas a este evento">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left">
                  <th scope="col" className="p-3 font-medium">Persona</th>
                  <th scope="col" className="p-3 font-medium">Estado</th>
                  <th scope="col" className="p-3 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {inscripciones.data.map((r, i) => {
                  const est = ESTADO_DE_INSCRIPCION[r.status];
                  return (
                    <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="p-3">{r.personName}</td>
                      <td className="p-3"><Badge tone={est.tone}>{est.label}</Badge></td>
                      <td className="p-3 text-sm">{formatDateTime(r.registeredAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollableTable>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
