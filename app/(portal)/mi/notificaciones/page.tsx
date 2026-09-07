import Link from 'next/link';
import { Badge, Card, EmptyState, ErrorNotice, PageShell, Section, SubmitButton } from '@/design-system/primitives';
import { currentActor } from '@/platform/http/request-context';
import { formatRelative } from '@/platform/i18n/format';
import { myNotifications, myNotificationPreferences } from '@/modules/notifications';
import { CLASE_DE_AVISO } from './etiquetas';
import { archiveAction, markAllReadAction, markReadAction } from './actions';
import { PreferencesForm } from './preferences-form';

export const metadata = { title: 'Notificaciones', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * El centro de notificaciones de la persona (PRD §16.2).
 *
 * Primero los avisos —lo que la persona vino a leer—, y debajo qué quiere
 * recibir. El centro respeta esa decisión: una clase silenciada no aparece
 * arriba, y la obligatoria de gobierno está siempre, porque no se puede apagar.
 */
export default async function MisNotificacionesPage() {
  const actor = await currentActor();
  if (actor.personId === null) {
    return (
      <PageShell title="Notificaciones">
        <ErrorNotice title="Para ver tus avisos necesitas entrar con tu cuenta." />
      </PageShell>
    );
  }

  const [centro, preferencias] = await Promise.all([myNotifications(actor), myNotificationPreferences(actor)]);
  if (!centro.ok) {
    return (
      <PageShell title="Notificaciones">
        <ErrorNotice title={centro.error.message} />
      </PageShell>
    );
  }
  if (!preferencias.ok) {
    return (
      <PageShell title="Notificaciones">
        <ErrorNotice title={preferencias.error.message} />
      </PageShell>
    );
  }

  const { items, unreadCount } = centro.data;

  return (
    <PageShell
      title="Notificaciones"
      description="Lo que la organización te ha hecho llegar, y qué clases de aviso quieres ver aquí."
    >
      <div className="space-y-8">
        <Section
          title={unreadCount === 0 ? 'Tus avisos' : `Tus avisos · ${unreadCount} sin leer`}
          description="Los más recientes primero. Marcar como leído o archivar no borra nada."
        >
          {unreadCount > 0 && (
            <form action={markAllReadAction} className="mb-4">
              <SubmitButton variant="secondary">Marcar todo como leído</SubmitButton>
            </form>
          )}
          {items.length === 0 ? (
            <EmptyState
              title="No tienes avisos"
              description="Cuando la organización te envíe algo, aparecerá aquí. Lo que silencies en tus preferencias no se mostrará."
            />
          ) : (
            <ul className="space-y-3">
              {items.map((aviso) => {
                const meta = CLASE_DE_AVISO[aviso.category];
                const sinLeer = aviso.readAt === null;
                return (
                  <li key={aviso.id}>
                    <Card>
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {sinLeer && <Badge tone="accent">Sin leer</Badge>}
                          <span className="ml-auto text-sm text-[var(--color-ink-soft)]">
                            {formatRelative(aviso.createdAt)}
                          </span>
                        </div>
                        <div>
                          <p className={sinLeer ? 'font-semibold' : 'font-medium'}>{aviso.title}</p>
                          <p className="mt-1 whitespace-pre-line text-[var(--color-ink)]">{aviso.body}</p>
                          {aviso.linkPath !== null && (
                            <p className="mt-2">
                              <Link href={aviso.linkPath} className="font-medium underline underline-offset-4">
                                Ver más
                              </Link>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sinLeer && (
                            <form action={markReadAction}>
                              <input type="hidden" name="notificationId" value={aviso.id} />
                              <SubmitButton variant="secondary">Marcar como leído</SubmitButton>
                            </form>
                          )}
                          <form action={archiveAction}>
                            <input type="hidden" name="notificationId" value={aviso.id} />
                            <SubmitButton variant="secondary">Archivar</SubmitButton>
                          </form>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Qué quieres recibir"
          description="Elige qué clases de aviso ves en tu centro. Los obligatorios de gobierno no se pueden silenciar."
        >
          <Card>
            <PreferencesForm categories={preferencias.data.categories} />
          </Card>
        </Section>
      </div>
    </PageShell>
  );
}
