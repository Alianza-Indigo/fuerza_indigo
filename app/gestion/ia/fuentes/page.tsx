import { Badge, Card, EmptyState, ErrorNotice, ForbiddenNotice, PageShell, ScrollableTable, Section } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { listSources, permissionOptions } from '@/modules/ai';
import { editorialPages } from '@/modules/content';
import { DisableButton, IndexButton, RegisterSourceForm } from './fuentes-forms';

export const metadata = { title: 'Base documental de IA', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { etiqueta: string; tono: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  PENDING: { etiqueta: 'Sin indexar', tono: 'neutral' },
  INDEXED: { etiqueta: 'Indexada', tono: 'success' },
  STALE: { etiqueta: 'Desfasada', tono: 'warning' },
  DISABLED: { etiqueta: 'Deshabilitada', tono: 'neutral' },
};

const TIPO: Record<string, string> = {
  STATUTE: 'Estatuto',
  POLICY: 'Política',
  PROCEDURE_GUIDE: 'Guía de trámite',
  PUBLIC_CONTENT: 'Contenido público',
};

export default async function FuentesPage() {
  const actor = await currentActor();
  if (!can(actor, 'ai.knowledge.manage', { kind: 'KnowledgeSource', legalEntityId: null }).allowed) {
    return (
      <PageShell title="Base documental de IA">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const [fuentes, paginas, permisos] = await Promise.all([listSources(actor), editorialPages(actor), permissionOptions(actor)]);
  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: actor.timeZone });

  const paginasOptions = paginas.ok ? paginas.data.map((p) => ({ value: p.id, label: `${p.title} (/${p.slug})` })) : [];
  const permisosOptions = permisos.ok ? permisos.data.map((p) => ({ value: p.code, label: `${p.code} — ${p.description}` })) : [];

  return (
    <PageShell
      title="Base documental de IA"
      description="Las fuentes que la IA puede consultar. Cada una exige el permiso con el que se lee: un fragmento nunca alcanza a quien no puede leer su origen."
      width="ancha"
    >
      <Section title="Registrar una fuente" description="Una fuente es una página del gestor de contenidos. Después de registrarla, indéxala para que la IA la pueda consultar.">
        <Card>
          <RegisterSourceForm paginas={paginasOptions} permisos={permisosOptions} />
        </Card>
      </Section>

      <Section title="Fuentes" description="El estado de indexación de cada fuente y el permiso que exige.">
        {!fuentes.ok ? (
          <ErrorNotice title={fuentes.error.message} />
        ) : fuentes.data.length === 0 ? (
          <EmptyState
            title="Todavía no hay ninguna fuente"
            description="Registra la primera arriba: una página con los estatutos o una guía de trámite, con el permiso que exige para leerse."
          />
        ) : (
          <ScrollableTable caption="Fuentes documentales, con su estado de indexación y el permiso que exigen">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left">
                <th scope="col" className="p-3 font-medium">Código</th>
                <th scope="col" className="p-3 font-medium">Tipo</th>
                <th scope="col" className="p-3 font-medium">Permiso que exige</th>
                <th scope="col" className="p-3 font-medium">Estado</th>
                <th scope="col" className="p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.data.map((fuente) => (
                <tr key={fuente.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="p-3">
                    <span className="font-medium">{fuente.code}</span>
                    <span className="block text-xs text-[var(--color-ink-faint)]">{fuente.name}</span>
                  </td>
                  <td className="p-3 text-sm">{TIPO[fuente.sourceKind] ?? fuente.sourceKind}</td>
                  <td className="p-3 text-sm">{fuente.requiredPermissionCode ?? 'Pública'}</td>
                  <td className="p-3">
                    <Badge tone={ESTADO[fuente.status]?.tono ?? 'neutral'}>{ESTADO[fuente.status]?.etiqueta ?? fuente.status}</Badge>
                    {fuente.status === 'INDEXED' && (
                      <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                        {fuente.chunkCount} fragmento(s) · {fuente.indexedAt !== null ? formatter.format(fuente.indexedAt) : ''}
                      </span>
                    )}
                  </td>
                  <td className="p-3 space-x-4">
                    {fuente.status !== 'DISABLED' && <IndexButton sourceId={fuente.id} />}
                    {fuente.status !== 'DISABLED' && <DisableButton sourceId={fuente.id} />}
                    {fuente.status === 'DISABLED' && <span className="text-xs text-[var(--color-ink-faint)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollableTable>
        )}
      </Section>
    </PageShell>
  );
}
