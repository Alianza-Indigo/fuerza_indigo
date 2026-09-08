import { currentActor } from '@/platform/http/request-context';
import { isAuthenticated } from '@/platform/kernel/actor-context';
import { removeWebPushSubscription, saveWebPushSubscription } from '@/modules/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recibe la suscripción del navegador (PRD §16.2, Fase 9 bloque D).
 *
 * Es la autorización explícita de la persona para recibir avisos web: solo su
 * propia sesión puede guardarla, anclada a su `personId`. El cuerpo es la
 * suscripción que el navegador produjo con `PushManager.subscribe`.
 */
export async function POST(request: Request): Promise<Response> {
  const actor = await currentActor();
  if (!isAuthenticated(actor)) return Response.json({ error: 'sesión requerida' }, { status: 401 });

  const cuerpo = (await request.json().catch(() => null)) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | null;
  if (cuerpo === null || typeof cuerpo.endpoint !== 'string' || cuerpo.keys === undefined) {
    return Response.json({ error: 'suscripción inválida' }, { status: 400 });
  }

  const resultado = await saveWebPushSubscription(actor, {
    endpoint: cuerpo.endpoint,
    keys: { p256dh: cuerpo.keys.p256dh ?? '', auth: cuerpo.keys.auth ?? '' },
  });
  if (!resultado.ok) return Response.json(resultado.error.toPublicJSON(), { status: resultado.error.httpStatus });
  return Response.json(resultado.data);
}

/** Olvida la suscripción de este dispositivo: la persona retira su autorización. */
export async function DELETE(request: Request): Promise<Response> {
  const actor = await currentActor();
  if (!isAuthenticated(actor)) return Response.json({ error: 'sesión requerida' }, { status: 401 });

  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (cuerpo === null || typeof cuerpo.endpoint !== 'string') {
    return Response.json({ error: 'falta el endpoint' }, { status: 400 });
  }

  const resultado = await removeWebPushSubscription(actor, { endpoint: cuerpo.endpoint });
  if (!resultado.ok) return Response.json(resultado.error.toPublicJSON(), { status: resultado.error.httpStatus });
  return Response.json(resultado.data);
}
