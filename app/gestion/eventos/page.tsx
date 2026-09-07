import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, ForbiddenNotice, LinkButton, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { eventList } from '@/modules/events';
import { formatDate } from '@/platform/i18n/format';
import { CLASE_DE_EVENTO, ESTADO_DE_EVENTO, VISIBILIDAD } from './etiquetas';

export const metadata = { title: 'Eventos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EventosPage() {
  const actor = await currentActor();
  const puedeCrear = can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: null }).allowed;
  const lista = await eventList(actor);

  return (
    <PageShell
      title="Eventos"
      description="Los eventos, cursos y talleres de la organización, con su estado y cuántas personas van inscritas."
      width="ancha"
      actions={puedeCrear ? <LinkButton href="/gestion/eventos/nuevo">Nuevo evento</LinkButton> : undefined}
    >
      {!lista.ok ? (
        lista.error.code === 'FORBIDDEN' ? <ForbiddenNotice /> : <ErrorNotice title={lista.error.message} />
      ) : lista.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay eventos"
          description="Cuando crees el primero aparecerá aquí, con su calendario y sus inscripciones."
          action={puedeCrear ? <LinkButton href="/gestion/eventos/nuevo">Crear el primero</LinkButton> : undefined}
        />
      ) : (
        <ScrollableTable caption="Eventos de la organización con su estado e inscripciones">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Evento</th>
              <th scope="col" className="p-3 font-medium">Cuándo</th>
              <th scope="col" className="p-3 font-medium">Visibilidad</th>
              <th scope="col" className="p-3 font-medium">Inscritos</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.data.map((e) => {
              const estado = ESTADO_DE_EVENTO[e.status];
              return (
                <tr key={e.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="p-3">
                    <Link href={`/gestion/eventos/${e.id}`} className="font-medium underline underline-offset-4">{e.title}</Link>
                    <span className="block text-xs text-[var(--color-ink-soft)]">{CLASE_DE_EVENTO[e.kind]}</span>
                  </td>
                  <td className="p-3 text-sm">{formatDate(e.startsAt)}</td>
                  <td className="p-3 text-sm">{VISIBILIDAD[e.visibility]}</td>
                  <td className="p-3 text-sm tabular-nums">
                    {e.registeredCount}{e.capacity === null ? '' : ` / ${e.capacity}`}
                    {e.waitlistCount > 0 && <span className="block text-xs text-[var(--color-ink-soft)]">{e.waitlistCount} en espera</span>}
                  </td>
                  <td className="p-3"><Badge tone={estado.tone}>{estado.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
