import Link from 'next/link';
import { Badge, EmptyState, ErrorNotice, ForbiddenNotice, LinkButton, PageShell, ScrollableTable } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { can } from '@/platform/authz/policy';
import { notificationTemplateList } from '@/modules/notifications';
import { CANAL, CLASE, ESTADO_DE_PLANTILLA } from './etiquetas';

export const metadata = { title: 'Plantillas de aviso', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Panel de plantillas de aviso (PRD §16.2, criterio 2).
 *
 * Cada aviso parte de una plantilla versionada; ninguna vive en el código. La
 * columna que primero se lee es el estado: es lo que decide si una versión es la
 * que se envía hoy.
 */
export default async function PlantillasPage() {
  const actor = await currentActor();
  const puedeCrear = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null }).allowed;
  const lista = await notificationTemplateList(actor);

  return (
    <PageShell
      title="Plantillas de aviso"
      description="Cada texto que la organización envía, con su versión vigente y su historial. Redactar es de Prensa; publicar, la revisión de la Secretaría."
      width="ancha"
      actions={puedeCrear ? <LinkButton href="/gestion/comunicaciones/plantillas/nueva">Nueva plantilla</LinkButton> : undefined}
    >
      {!lista.ok ? (
        lista.error.code === 'FORBIDDEN' ? (
          <ForbiddenNotice />
        ) : (
          <ErrorNotice title={lista.error.message} />
        )
      ) : lista.data.length === 0 ? (
        <EmptyState
          title="Todavía no hay ninguna plantilla"
          description="Cuando redactes la primera aparecerá aquí, con su versión y su estado. Se publica en una revisión aparte de quien la redacta."
          action={puedeCrear ? <LinkButton href="/gestion/comunicaciones/plantillas/nueva">Redactar la primera</LinkButton> : undefined}
        />
      ) : (
        <ScrollableTable caption="Plantillas de aviso, con su canal, su clase y su estado de publicación">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left">
              <th scope="col" className="p-3 font-medium">Código</th>
              <th scope="col" className="p-3 font-medium">Canal</th>
              <th scope="col" className="p-3 font-medium">Clase</th>
              <th scope="col" className="p-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.data.map((plantilla) => {
              const estado = ESTADO_DE_PLANTILLA[plantilla.status];
              return (
                <tr key={plantilla.id} className="border-b border-[var(--color-line)] align-top last:border-0">
                  <td className="p-3">
                    <Link href={`/gestion/comunicaciones/plantillas/${plantilla.id}`} className="font-medium underline underline-offset-4">
                      {plantilla.code}
                    </Link>
                    <span className="block text-xs text-[var(--color-ink-soft)]">v{plantilla.version} · {plantilla.locale}</span>
                  </td>
                  <td className="p-3">{CANAL[plantilla.channel]}</td>
                  <td className="p-3">{CLASE[plantilla.category]}</td>
                  <td className="p-3">
                    <Badge tone={estado.tone}>{estado.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ScrollableTable>
      )}
    </PageShell>
  );
}
