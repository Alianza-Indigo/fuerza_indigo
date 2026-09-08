import { z } from 'zod';
import type { Prisma } from '@prisma-client/client';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { webPushPort, type WebPushSubscription } from '@/platform/push/web-push-port';

/**
 * Notificaciones web con autorización explícita (PRD §16.2, §24 Fase 9 bloque D;
 * ADR-0172).
 *
 * **La web no llega a quien no la pidió.** A diferencia del centro —que es un
 * derecho de la cuenta— y del correo —que la persona ya dio al registrarse—, la
 * notificación web exige que el navegador de la persona se **suscriba
 * explícitamente**: un permiso que solo la persona concede, en su dispositivo.
 * Sin esa suscripción no hay entrega web posible, y este módulo lo garantiza:
 * la entrega solo alcanza a quien tiene una suscripción guardada.
 *
 * La suscripción se guarda en la propia persona (`webPushSubscriptions`), no en
 * una tabla nueva: el contrato de fases no admite una entidad más. Es material
 * público del navegador; la clave privada que firma los envíos vive en el
 * entorno.
 */

const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type SaveWebPushInput = z.infer<typeof subscriptionSchema>;

function subscriptionsOf(value: unknown): WebPushSubscription[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is WebPushSubscription =>
      typeof s === 'object' && s !== null && typeof (s as { endpoint?: unknown }).endpoint === 'string',
  );
}

/**
 * Las suscripciones son objetos planos y serializables, pero su interfaz
 * tipada no satisface por sí sola el `InputJsonValue` de Prisma (le falta la
 * firma de índice). Se guardan como el JSON que son.
 */
function comoJson(subs: WebPushSubscription[]): Prisma.InputJsonValue {
  return subs.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }));
}

/**
 * Guarda la suscripción del navegador de la persona: su autorización explícita
 * para recibir avisos web. Una suscripción por endpoint —volver a suscribir el
 * mismo dispositivo reemplaza, no duplica—.
 */
export async function saveWebPushSubscription(
  actor: ActorContext,
  input: SaveWebPushInput,
): Promise<UseCaseResult<{ saved: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ subscription: ['La suscripción del navegador no es válida.'] }));

  const persona = await db().person.findUnique({ where: { id: actor.personId }, select: { webPushSubscriptions: true } });
  if (persona === null) return fail(errors.notFound('No encontramos tu persona.'));

  const actuales = subscriptionsOf(persona.webPushSubscriptions).filter((s) => s.endpoint !== parsed.data.endpoint);
  actuales.push({ endpoint: parsed.data.endpoint, keys: parsed.data.keys });

  await db().person.update({
    where: { id: actor.personId },
    data: { webPushSubscriptions: comoJson(actuales) },
  });
  return ok({ saved: true });
}

/** Olvida la suscripción de un dispositivo: la persona retira su autorización. */
export async function removeWebPushSubscription(
  actor: ActorContext,
  input: { endpoint: string },
): Promise<UseCaseResult<{ removed: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const persona = await db().person.findUnique({ where: { id: actor.personId }, select: { webPushSubscriptions: true } });
  if (persona === null) return fail(errors.notFound('No encontramos tu persona.'));

  const antes = subscriptionsOf(persona.webPushSubscriptions);
  const despues = antes.filter((s) => s.endpoint !== input.endpoint);
  if (despues.length === antes.length) return ok({ removed: false });

  await db().person.update({
    where: { id: actor.personId },
    data: { webPushSubscriptions: comoJson(despues) },
  });
  return ok({ removed: true });
}

/**
 * Entrega un aviso ya creado por el canal web.
 *
 * **La puerta de la autorización explícita.** Si la persona no tiene ninguna
 * suscripción, no hay entrega web: se registra un intento `SUPPRESSED` y no se
 * llama al servicio de push. Si la tiene, se respeta además su preferencia por
 * el canal web —una clase silenciada no se envía, salvo la obligatoria de
 * gobierno, que no se puede silenciar—. Un endpoint que el navegador ya retiró
 * (410/404) se olvida.
 */
export async function deliverWebPushForNotification(
  notificationId: string,
): Promise<UseCaseResult<{ sent: number; suppressed: boolean }>> {
  const aviso = await db().notification.findUnique({
    where: { id: notificationId },
    select: { id: true, personId: true, category: true, title: true, body: true, linkPath: true },
  });
  if (aviso === null) return fail(errors.notFound('Ese aviso no existe.'));

  async function registrar(status: 'SENT' | 'SUPPRESSED' | 'FAILED'): Promise<void> {
    await db().deliveryAttempt.create({
      data: { notificationId: aviso!.id, channel: 'WEB_PUSH', attemptNumber: 1, status },
    });
  }

  // La preferencia del canal web: una clase silenciada no se envía.
  const silenciada = await db().notificationPreference.findFirst({
    where: { personId: aviso.personId, channel: 'WEB_PUSH', category: aviso.category, suppressed: true },
    select: { id: true },
  });
  if (silenciada !== null) {
    await registrar('SUPPRESSED');
    return ok({ sent: 0, suppressed: true });
  }

  const persona = await db().person.findUnique({ where: { id: aviso.personId }, select: { webPushSubscriptions: true } });
  const suscripciones = subscriptionsOf(persona?.webPushSubscriptions);
  if (suscripciones.length === 0) {
    // La puerta: sin suscripción no hay entrega web.
    await registrar('SUPPRESSED');
    return ok({ sent: 0, suppressed: true });
  }

  const port = webPushPort();
  const message = { title: aviso.title, body: aviso.body, url: aviso.linkPath ?? '/mi/notificaciones' };
  let sent = 0;
  const vivas: WebPushSubscription[] = [];
  for (const suscripcion of suscripciones) {
    const resultado = await port.send(suscripcion, message);
    if (resultado.delivered) sent += 1;
    if (!resultado.gone) vivas.push(suscripcion);
  }

  // Se olvidan las suscripciones que el navegador ya retiró.
  if (vivas.length !== suscripciones.length) {
    await db().person.update({
      where: { id: aviso.personId },
      data: { webPushSubscriptions: comoJson(vivas) },
    });
  }

  await registrar(sent > 0 ? 'SENT' : 'FAILED');
  return ok({ sent, suppressed: false });
}
