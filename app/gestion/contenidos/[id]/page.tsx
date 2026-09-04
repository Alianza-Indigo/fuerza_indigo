import { notFound } from 'next/navigation';
import {
  Badge,
  ForbiddenNotice,
  PageShell,
  Section,
} from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { db } from '@/platform/db/client';
import { versionHistory } from '@/modules/content';
import { EditorForms } from './editor-forms';

export const metadata = { title: 'Editar contenido', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { etiqueta: string; tono: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  DRAFT: { etiqueta: 'Borrador', tono: 'neutral' },
  IN_REVIEW: { etiqueta: 'En revisión', tono: 'warning' },
  SCHEDULED: { etiqueta: 'Programado', tono: 'accent' },
  PUBLISHED: { etiqueta: 'Publicado', tono: 'success' },
  ARCHIVED: { etiqueta: 'Archivado', tono: 'neutral' },
};

/**
 * Editor de un contenido, con su historial completo.
 *
 * El historial no es un apartado escondido: está en la misma pantalla que la
 * edición porque es lo que permite decidir. Ver que la versión 3 la revisó otra
 * persona y que la 4 la escribió una misma es lo que dice si toca enviar a
 * revisión o si ya se puede publicar.
 */
export default async function EditarContenidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();

  if (!can(actor, 'content.page.read', { kind: 'ContentPage', id }).allowed) {
    return (
      <PageShell title="Contenido">
        <ForbiddenNotice />
      </PageShell>
    );
  }

  const pagina = await db().contentPage.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      kind: true,
      status: true,
      publishedAt: true,
      scheduledFor: true,
      accessLevel: true,
      legalEntityId: true,
      currentVersionId: true,
      draftVersionId: true,
      draftVersion: {
        select: {
          id: true,
          version: true,
          title: true,
          summary: true,
          bodyMarkdown: true,
          seoTitle: true,
          seoDescription: true,
          reviewedAt: true,
          authorId: true,
        },
      },
      currentVersion: {
        select: { id: true, version: true, title: true, summary: true, bodyMarkdown: true, seoTitle: true, seoDescription: true },
      },
    },
  });
  if (pagina === null) notFound();

  const historial = await versionHistory(actor, id);
  const editable = pagina.draftVersion ?? pagina.currentVersion;

  const puede = {
    escribir: can(actor, 'content.page.write', { kind: 'ContentPage', id, legalEntityId: pagina.legalEntityId }).allowed,
    revisar: can(actor, 'content.page.review', { kind: 'ContentPage', id, legalEntityId: pagina.legalEntityId }).allowed,
    publicar: can(actor, 'content.page.publish', { kind: 'ContentPage', id, legalEntityId: pagina.legalEntityId })
      .allowed,
    revertir: can({ ...actor, reason: 'consulta de facultades' }, 'content.page.revert', {
      kind: 'ContentPage',
      id,
      legalEntityId: pagina.legalEntityId,
    }).allowed,
  };

  const hayPendientes = pagina.draftVersionId !== null && pagina.draftVersionId !== pagina.currentVersionId;
  const revisada = pagina.draftVersion?.reviewedAt !== null && pagina.draftVersion?.reviewedAt !== undefined;
  const esAutoria = pagina.draftVersion?.authorId === actor.userId;

  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title={editable?.title ?? '(sin título)'}
      description={`/${pagina.slug}`}
      width="ancha"
      actions={
        <>
          <Badge tone={ESTADO[pagina.status]?.tono ?? 'neutral'}>
            {ESTADO[pagina.status]?.etiqueta ?? pagina.status}
          </Badge>
          {hayPendientes && <Badge tone="warning">Cambios sin publicar</Badge>}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <EditorForms
            pageId={pagina.id}
            puede={puede}
            estado={pagina.status}
            hayPendientes={hayPendientes}
            revisada={revisada}
            esAutoriaDelBorrador={esAutoria}
            valores={{
              title: editable?.title ?? '',
              summary: editable?.summary ?? '',
              bodyMarkdown: editable?.bodyMarkdown ?? '',
              seoTitle: editable?.seoTitle ?? '',
              seoDescription: editable?.seoDescription ?? '',
            }}
            versiones={
              historial.ok
                ? historial.data
                    .filter((version) => version.publishedAt !== null)
                    .map((version) => ({
                      value: version.id,
                      label: `Versión ${version.version} · ${version.title}`,
                    }))
                : []
            }
          />
        </div>

        <aside className="space-y-6" data-secondary>
          <Section title="Estado" level={3}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[var(--color-ink-soft)]">Publicado</dt>
                <dd className="font-medium">
                  {pagina.publishedAt === null ? 'Nunca' : formatter.format(pagina.publishedAt)}
                </dd>
              </div>
              {pagina.scheduledFor !== null && (
                <div>
                  <dt className="text-[var(--color-ink-soft)]">Programado para</dt>
                  <dd className="font-medium">{formatter.format(pagina.scheduledFor)}</dd>
                </div>
              )}
              <div>
                <dt className="text-[var(--color-ink-soft)]">Quién puede verlo</dt>
                <dd className="font-medium">
                  {pagina.accessLevel === 'PUBLIC'
                    ? 'Cualquier persona'
                    : pagina.accessLevel === 'MEMBERS'
                      ? 'Agremiadas con sesión'
                      : 'Solo dentro de la plataforma'}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Historial" level={3} description="Cada versión, con quién la escribió y quién la revisó.">
            {!historial.ok ? (
              <p className="text-sm text-[var(--color-danger)]">{historial.error.message}</p>
            ) : (
              <ol className="space-y-4">
                {historial.data.map((version) => (
                  <li key={version.id} className="border-l-2 border-[var(--color-line)] pl-4">
                    <p className="font-medium">
                      Versión {version.version}
                      {version.isCurrent && (
                        <span className="ml-2">
                          <Badge tone="success">En el sitio</Badge>
                        </span>
                      )}
                    </p>
                    {version.changeNote !== null && (
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{version.changeNote}</p>
                    )}
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                      Escribió {version.authorName}
                      {version.reviewerName !== null && ` · Revisó ${version.reviewerName}`}
                      {version.revertedFromVersion !== null && ` · Revierte a la versión ${version.revertedFromVersion}`}
                    </p>
                    <p className="text-xs text-[var(--color-ink-faint)]">{formatter.format(version.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>
    </PageShell>
  );
}
