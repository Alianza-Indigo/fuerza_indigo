import { Card, ErrorNotice, ForbiddenNotice, Notice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { campaignTemplateOptions } from '@/modules/notifications';
import { CampaignForm } from './campaign-form';

export const metadata = { title: 'Campañas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Envío de campañas de comunicación (PRD §16.2, criterio 1).
 *
 * Una campaña sale de una plantilla ya publicada y alcanza a los miembros activos
 * de la entidad. Lo obligatorio no se envía así, y a quien silenció esa clase por
 * correo no se le envía: eso lo garantiza el caso de uso, no esta pantalla.
 */
export default async function CampanasPage() {
  const actor = await currentActor();
  const entidad = actor.legalEntityScope[0] ?? null;

  if (entidad === null) {
    return (
      <PageShell title="Campañas">
        <Notice tone="neutral" title="No tienes una entidad asignada">
          <p>Las campañas se envían a los miembros de una entidad. Habla con quien te otorgó tu cargo.</p>
        </Notice>
      </PageShell>
    );
  }

  // Sonda con motivo: enviar exige motivo, así que preguntar «¿podría enviar?» con
  // el actor pelado negaría a todos y el formulario no aparecería. El motivo real
  // lo captura el formulario y lo vuelve a validar el caso de uso.
  const sonda = { ...actor, reason: 'consulta del panel de campañas' };
  const puede = can(sonda, 'notifications.campaign.send', { kind: 'NotificationCampaign', legalEntityId: entidad }).allowed;
  if (!puede) {
    return (
      <PageShell title="Campañas">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const opciones = await campaignTemplateOptions(actor);

  return (
    <PageShell
      title="Campañas"
      description="Envía un aviso a los miembros activos de tu entidad, a partir de una plantilla publicada. Lo obligatorio no se envía por aquí."
    >
      {!opciones.ok ? (
        <ErrorNotice title={opciones.error.message} />
      ) : (
        <Card>
          <CampaignForm legalEntityId={entidad} plantillas={[...opciones.data]} />
        </Card>
      )}
    </PageShell>
  );
}
