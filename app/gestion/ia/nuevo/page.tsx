import { Card, ForbiddenNotice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { promptModels } from '@/modules/ai';
import { NewPromptForm } from './new-prompt-form';

export const metadata = { title: 'Nuevo prompt', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NuevoPromptPage() {
  const actor = await currentActor();
  if (!can(actor, 'ai.prompt.edit', { kind: 'AiPrompt', legalEntityId: null }).allowed) {
    return (
      <PageShell title="Nuevo prompt">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const modelos = await promptModels(actor);

  return (
    <PageShell
      title="Nuevo prompt"
      description="Nace como borrador. No se ejecuta hasta que se pruebe en el laboratorio y otra persona lo publique."
      width="lectura"
    >
      <Card>
        <NewPromptForm modelos={modelos.ok ? modelos.data.models.map((m) => ({ value: m, label: m })) : []} />
      </Card>
    </PageShell>
  );
}
