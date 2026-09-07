import type { NotificationCategory } from '@prisma-client/enums';
import type { PrismaClient } from '@prisma-client/client';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * El centro de notificaciones dentro de la plataforma (PRD §16.2).
 *
 * Cada persona lee **sus** avisos, los marca como leídos y los archiva. No hace
 * falta ningún permiso: leer el propio buzón no es una facultad que un cargo
 * conceda, se tiene por tener cuenta —igual que ver las sesiones propias—. Todo
 * lo que se consulta y se escribe se ancla a `actor.personId`; un aviso de otra
 * persona responde «no encontrado», nunca «prohibido»: en el buzón propio,
 * confirmar que un identificador ajeno existe ya sería revelar de más.
 *
 * El centro respeta las preferencias: una clase que la persona silenció para su
 * centro no aparece aquí. La obligatoria de gobierno no se puede silenciar, así
 * que siempre está.
 */

export interface NotificationRow {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
  readonly linkPath: string | null;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export interface NotificationCenter {
  readonly items: NotificationRow[];
  readonly unreadCount: number;
}

/** Cuántos avisos trae el centro de una vez. Los más recientes primero. */
const CENTER_PAGE_SIZE = 100;

async function suppressedInAppCategories(
  client: PrismaClient,
  personId: string,
): Promise<NotificationCategory[]> {
  const rows = await client.notificationPreference.findMany({
    where: { personId, channel: 'IN_APP', suppressed: true },
    select: { category: true },
  });
  return rows.map((row) => row.category);
}

/** Los avisos vivos de la persona, con cuántos quedan sin leer. */
export async function myNotifications(actor: ActorContext): Promise<UseCaseResult<NotificationCenter>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const silenciadas = await suppressedInAppCategories(db(), actor.personId);
  const items = await db().notification.findMany({
    where: {
      personId: actor.personId,
      archivedAt: null,
      channels: { has: 'IN_APP' },
      ...(silenciadas.length > 0 ? { category: { notIn: silenciadas } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: CENTER_PAGE_SIZE,
    select: {
      id: true,
      category: true,
      title: true,
      body: true,
      linkPath: true,
      createdAt: true,
      readAt: true,
    },
  });

  const unreadCount = items.reduce((total, item) => (item.readAt === null ? total + 1 : total), 0);
  return ok({ items, unreadCount });
}

/** Marca un aviso propio como leído. Idempotente: leído dos veces no cambia nada. */
export async function markNotificationRead(
  actor: ActorContext,
  notificationId: string,
): Promise<UseCaseResult<{ read: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const aviso = await db().notification.findUnique({
    where: { id: notificationId },
    select: { id: true, personId: true, readAt: true },
  });
  if (aviso === null || aviso.personId !== actor.personId) {
    return fail(errors.notFound('el aviso no pertenece a quien lo lee'));
  }
  if (aviso.readAt !== null) return ok({ read: false });

  await db().notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  return ok({ read: true });
}

/** Marca como leídos todos los avisos vivos y sin leer de la persona. */
export async function markAllNotificationsRead(actor: ActorContext): Promise<UseCaseResult<{ read: number }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const resultado = await db().notification.updateMany({
    where: { personId: actor.personId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  return ok({ read: resultado.count });
}

/** Archiva un aviso propio: sale del centro sin borrarse. Idempotente. */
export async function archiveNotification(
  actor: ActorContext,
  notificationId: string,
): Promise<UseCaseResult<{ archived: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const aviso = await db().notification.findUnique({
    where: { id: notificationId },
    select: { id: true, personId: true, archivedAt: true },
  });
  if (aviso === null || aviso.personId !== actor.personId) {
    return fail(errors.notFound('el aviso no pertenece a quien lo archiva'));
  }
  if (aviso.archivedAt !== null) return ok({ archived: false });

  await db().notification.update({ where: { id: notificationId }, data: { archivedAt: new Date() } });
  return ok({ archived: true });
}
