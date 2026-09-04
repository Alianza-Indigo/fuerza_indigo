import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, LinkButton, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { editorialPages } from '@/modules/content';

export const metadata = { title: 'Contenidos', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { etiqueta: string; tono: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  DRAFT: { etiqueta: 'Borrador', tono: 'neutral' },
  IN_REVIEW: { etiqueta: 'En revisión', tono: 'warning' },
  SCHEDULED: { etiqueta: 'Programado', tono: 'accent' },
  PUBLISHED: { etiqueta: 'Publicado', tono: 'success' },
  ARCHIVED: { etiqueta: 'Archivado', tono: 'neutral' },
};

const TIPO: Record<string, string> = {
  PAGE: 'Página',
  NEWS: 'Noticia',
  STATEMENT: 'Comunicado',
  RESOURCE: 'Recurso',
  FAQ: 'Pregunta frecuente',
  CALL_FOR_APPLICATIONS: 'Convocatoria',
  BANNER: 'Aviso',
  LEGAL: 'Página legal',
  DELEGATION_PROFILE: 'Perfil de delegación',
  PROTOCOL: 'Protocolo',
};

/**
 * Panel editorial (PRD §16.1).
 *
 * La columna que primero se lee no es el estado sino **si hay cambios sin
 * publicar**: es la pregunta que una persona editora se hace al abrir el panel,
 * y la que decide qué toca hacer hoy.
 */
export default async function ContenidosPage() {
  const actor = await currentActor();
  const paginas = await editorialPages(actor);
  const puedeCrear = can(actor, 'content.page.write', { kind: 'ContentPage' }).allowed;

  const formatter = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: actor.timeZone,
  });

  return (
    <PageShell
      title="Contenidos"
      description="Todo lo que vive en el sitio público, publicado o no. Editar no cambia el sitio hasta que alguien publica."
      width="ancha"
      actions={puedeCrear ? <LinkButton href="/gestion/contenidos/nuevo">Nuevo contenido</LinkButton> : undefined}
    >
      {!paginas.ok ? (
        <ErrorNotice title={paginas.error.message} />
      ) : paginas.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay ningún contenido"
          description="Cuando crees el primero aparecerá aquí, con su estado y su historial completo."
          action={puedeCrear ? <LinkButton href="/gestion/contenidos/nuevo">Crear el primero</LinkButton> : undefined}
        />
      ) : (
        <ScrollableTable caption="Contenidos del sitio, con su estado y si tienen cambios sin publicar">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Título</th>
              <th scope="col" className="p-3 font-medium">Tipo</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
              <th scope="col" className="p-3 font-medium">Última edición</th>
            </tr>
          </thead>
          <tbody>
            {paginas.data.map((pagina) => (
              <tr key={pagina.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                <td className="p-3">
                  <Link
                    href={`/gestion/contenidos/${pagina.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {pagina.title}
                  </Link>
                  <span className="block text-xs text-[var(--color-ink-faint)]">/{pagina.slug}</span>
                </td>
                <td className="p-3">{TIPO[pagina.kind] ?? pagina.kind}</td>
                <td className="p-3">
                  <Badge tone={ESTADO[pagina.status]?.tono ?? 'neutral'}>
                    {ESTADO[pagina.status]?.etiqueta ?? pagina.status}
                  </Badge>
                  {pagina.hasPendingChanges && (
                    <span className="mt-1 block text-xs font-medium text-[var(--color-warning)]">
                      Con cambios sin publicar
                    </span>
                  )}
                  {pagina.scheduledFor !== null && (
                    <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                      Sale el {formatter.format(pagina.scheduledFor)}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums text-sm">{formatter.format(pagina.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
