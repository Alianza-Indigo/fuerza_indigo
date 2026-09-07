import { Card, ForbiddenNotice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { NewTemplateForm } from './new-template-form';

export const metadata = { title: 'Nueva plantilla de aviso', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NuevaPlantillaPage() {
  const actor = await currentActor();
  const puede = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null }).allowed;

  return (
    <PageShell
      title="Nueva plantilla de aviso"
      description="Se guarda como borrador. La revisa y publica la Secretaría; entonces empieza a usarse."
    >
      {puede ? (
        <Card>
          <NewTemplateForm />
        </Card>
      ) : (
        <ForbiddenNotice />
      )}
    </PageShell>
  );
}
