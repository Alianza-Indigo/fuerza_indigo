import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, ForbiddenNotice, LinkButton, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { listPrompts } from '@/modules/ai';

export const metadata = { title: 'Prompts de IA', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Panel de prompts (PRD §15.3).
 *
 * La columna que primero se lee es si hay una versión **publicada**: es lo que
 * decide si ese prompt se ejecuta hoy o si su flujo cae al camino humano.
 */
export default async function PromptsPage() {
  const actor = await currentActor();
  const puedeCrear = can(actor, 'ai.prompt.edit', { kind: 'AiPrompt', legalEntityId: null }).allowed;
  const lista = await listPrompts(actor);

  const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: actor.timeZone });

  return (
    <PageShell
      title="Prompts de IA"
      description="Cada prompt que la plataforma usa con el modelo, con su versión vigente y su historial. Ningún prompt vive en el código."
      width="ancha"
      actions={puedeCrear ? <LinkButton href="/gestion/ia/nuevo">Nuevo prompt</LinkButton> : undefined}
    >
      {!lista.ok ? (
        lista.error.code === 'FORBIDDEN' ? (
          <ForbiddenNotice />
        ) : (
          <ErrorNotice title={lista.error.message} />
        )
      ) : lista.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay ningún prompt"
          description="Cuando crees el primero aparecerá aquí, con sus versiones y su estado. Se prueba en el laboratorio antes de publicarlo."
          action={puedeCrear ? <LinkButton href="/gestion/ia/nuevo">Crear el primero</LinkButton> : undefined}
        />
      ) : (
        <ScrollableTable caption="Prompts del sistema, con su estado de publicación y su criticidad">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Código</th>
              <th scope="col" className="p-3 font-medium">Módulo</th>
              <th scope="col" className="p-3 font-medium">Criticidad</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
              <th scope="col" className="p-3 font-medium">Última edición</th>
            </tr>
          </thead>
          <tbody>
            {lista.data.map((prompt) => (
              <tr key={prompt.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                <td className="p-3">
                  <Link href={`/gestion/ia/${prompt.id}`} className="font-medium underline underline-offset-4">
                    {prompt.code}
                  </Link>
                  <span className="block text-xs text-[var(--color-ink-faint)]">v{prompt.latestVersion}</span>
                </td>
                <td className="p-3">{prompt.module}</td>
                <td className="p-3">
                  <Badge tone={prompt.criticality === 'CRITICAL' ? 'warning' : 'neutral'}>
                    {prompt.criticality === 'CRITICAL' ? 'Crítico' : 'Estándar'}
                  </Badge>
                </td>
                <td className="p-3">
                  <Badge tone={prompt.published ? 'success' : 'neutral'}>
                    {prompt.published ? 'Publicado' : 'Sin publicar'}
                  </Badge>
                  {prompt.hasPendingDraft && (
                    <span className="mt-1 block text-xs font-medium text-[var(--color-warning)]">
                      Con borrador sin publicar
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums text-sm">{formatter.format(prompt.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
