import { Card, PageShell } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { ForbiddenNotice } from '@/design-system/primitives';
import { listLegalEntities } from '@/modules/admin';
import { territoryOptions } from '@/modules/access';
import { NewContentForm } from './new-content-form';

export const metadata = { title: 'Nuevo contenido', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NuevoContenidoPage() {
  const actor = await currentActor();
  if (!can(actor, 'content.page.write', { kind: 'ContentPage' }).allowed) {
    return (
      <PageShell title="Nuevo contenido">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const [entidades, territorios] = await Promise.all([listLegalEntities(actor), territoryOptions(actor)]);

  return (
    <PageShell
      title="Nuevo contenido"
      description="Nace como borrador. No aparece en el sitio hasta que pase por revisión y alguien lo publique."
      width="lectura"
    >
      <Card>
        <NewContentForm
          entidades={entidades.ok ? entidades.data.map((e) => ({ value: e.id, label: e.shortName })) : []}
          territorios={
            territorios.ok
              ? territorios.data.map((t) => ({
                  value: t.id,
                  label: `${'· '.repeat(Math.max(0, t.depth))}${t.name}`,
                }))
              : []
          }
        />
      </Card>
    </PageShell>
  );
}
