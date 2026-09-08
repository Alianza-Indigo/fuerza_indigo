import { Card, ForbiddenNotice, Notice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { constancyTemplateOptions } from '@/modules/events';
import { NewEventForm } from './new-event-form';

export const metadata = { title: 'Nuevo evento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NuevoEventoPage() {
  const actor = await currentActor();
  const entidad = actor.legalEntityScope[0] ?? null;
  const puede = entidad !== null && can(actor, 'events.event.manage', { kind: 'Event', legalEntityId: entidad }).allowed;
  const plantillas = puede ? await constancyTemplateOptions(actor) : null;

  return (
    <PageShell title="Nuevo evento" description="Se crea como borrador. Después lo publicas y abres la inscripción.">
      {entidad === null ? (
        <Notice tone="neutral" title="No tienes una entidad asignada">
          <p>Los eventos pertenecen a una entidad. Habla con quien te otorgó tu cargo.</p>
        </Notice>
      ) : puede ? (
        <Card>
          <NewEventForm
            legalEntityId={entidad}
            constancyTemplates={plantillas !== null && plantillas.ok ? plantillas.data : []}
          />
        </Card>
      ) : (
        <ForbiddenNotice />
      )}
    </PageShell>
  );
}
