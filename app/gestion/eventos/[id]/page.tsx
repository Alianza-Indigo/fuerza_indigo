import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, ForbiddenNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { eventDetailForStaff, eventRoster, listEventMaterials } from '@/modules/events';
import { formatDateTime } from '@/platform/i18n/format';
import { CLASE_DE_EVENTO, ESTADO_DE_EVENTO, MODALIDAD, VISIBILIDAD } from '../etiquetas';
import { EventLifecycle } from './lifecycle';
import { Roster } from './roster';
import { AddMaterialForm } from './add-material-form';

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
  const padron = await eventRoster(actor, id);
  const materiales = await listEventMaterials(actor, id);

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
              <div><dt className="text-sm text-[var(--color-ink-soft)]">Constancias</dt><dd>{e.issuesConstancy ? 'Este evento emite constancia' : 'Sin constancia'}</dd></div>
            </dl>
          </Card>
        </Section>

        <Section title={`Padrón, asistencia y constancias${padron.ok ? ` · ${padron.data.length}` : ''}`}>
          {!padron.ok ? (
            padron.error.code === 'FORBIDDEN' ? <ForbiddenNotice /> : <EmptyState title="Sin inscripciones" description="Nadie se ha inscrito todavía." />
          ) : padron.data.length === 0 ? (
            <EmptyState title="Sin inscripciones" description="Cuando alguien se inscriba aparecerá aquí para registrar su asistencia y, si procede, su constancia." />
          ) : (
            <Roster eventId={e.id} issuesConstancy={e.issuesConstancy} rows={padron.data} />
          )}
        </Section>

        <Section title="Materiales">
          <Card>
            <AddMaterialForm eventId={e.id} />
          </Card>
          <div className="mt-4">
            {!materiales.ok ? (
              materiales.error.code === 'FORBIDDEN' ? <ForbiddenNotice /> : <EmptyState title="Sin materiales" description="Aún no hay materiales." />
            ) : materiales.data.length === 0 ? (
              <EmptyState title="Sin materiales" description="Sube una lectura, una presentación o una guía; los reservados solo los descargan quienes se inscriban." />
            ) : (
              <ScrollableTable caption="Materiales de este evento">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left">
                    <th scope="col" className="p-3 font-medium">Material</th>
                    <th scope="col" className="p-3 font-medium">Acceso</th>
                    <th scope="col" className="p-3 font-medium">Descargar</th>
                  </tr>
                </thead>
                <tbody>
                  {materiales.data.map((m) => (
                    <tr key={m.id} className="border-b border-[var(--color-line)] last:border-0">
                      <td className="p-3">{m.title}</td>
                      <td className="p-3">
                        <Badge tone={m.membersOnly ? 'warning' : 'neutral'}>
                          {m.membersOnly ? 'Reservado a inscritos' : 'Abierto'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <a href={`/api/v1/files/${m.fileObjectId}/pase`} className="underline underline-offset-4">
                          Abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ScrollableTable>
            )}
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
