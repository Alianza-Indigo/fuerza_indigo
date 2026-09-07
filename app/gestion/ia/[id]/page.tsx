import { notFound } from 'next/navigation';
import { ForbiddenNotice, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { promptModels, readPrompt } from '@/modules/ai';
import { PromptEditor } from './prompt-editor';

export const metadata = { title: 'Prompt', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PromptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  const detalle = await readPrompt(actor, id);
  if (!detalle.ok) {
    if (detalle.error.code === 'FORBIDDEN') {
      return (
        <PageShell title="Prompt">
          <ForbiddenNotice />
        </PageShell>
      );
    }
    notFound();
  }

  const modelos = await promptModels(actor);
  const canEdit = can(actor, 'ai.prompt.edit', { kind: 'AiPrompt', id, legalEntityId: null }).allowed;
  const canPublish = can(actor, 'ai.prompt.publish', { kind: 'AiPrompt', id, legalEntityId: null }).allowed;

  return (
    <PageShell
      title={detalle.data.code}
      description={detalle.data.purpose}
      width="ancha"
    >
      <PromptEditor
        prompt={detalle.data}
        canEdit={canEdit}
        canPublish={canPublish}
        modelos={modelos.ok ? modelos.data.models : []}
        timeZone={actor.timeZone}
      />
    </PageShell>
  );
}
