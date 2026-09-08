import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { crearPersonaConCuenta } from './helpers/fixtures';
import { deliverWebPushForNotification } from '@/modules/notifications';
import {
  setWebPushForTests,
  type WebPushMessage,
  type WebPushPort,
  type WebPushSendResult,
  type WebPushSubscription,
} from '@/platform/push/web-push-port';

/**
 * La puerta de la autorización explícita del aviso web (PRD §16.2, Fase 9 bloque
 * D; ADR-0172).
 *
 * **El aviso web no llega a quien no lo pidió.** Se prueba con un puerto falso
 * que cuenta cada envío, y con el método de romper: la persona sin suscripción
 * no recibe —el puerto no se llama y el intento queda `SUPPRESSED`—; la persona
 * suscrita sí —el puerto se llama y el intento queda `SENT`—; y una clase
 * silenciada por el canal web tampoco sale, aunque haya suscripción.
 */

let base: TestDatabase;

interface PuertoFalso extends WebPushPort {
  llamadas: WebPushSubscription[];
  respuesta: WebPushSendResult;
}

function puertoFalso(respuesta: Partial<WebPushSendResult> = {}): PuertoFalso {
  const llamadas: WebPushSubscription[] = [];
  const salida: WebPushSendResult = { delivered: true, gone: false, statusCode: 201, ...respuesta };
  return {
    llamadas,
    respuesta: salida,
    name: 'falso',
    capability: 'DELIVERS',
    capabilityDetail: 'puerto de prueba',
    send(subscription: WebPushSubscription, _message: WebPushMessage): Promise<WebPushSendResult> {
      llamadas.push(subscription);
      return Promise.resolve(salida);
    },
  };
}

const SUSCRIPCION: WebPushSubscription = {
  endpoint: 'https://push.ejemplo.invalid/enviar/abc123',
  keys: { p256dh: 'BOx', auth: 'YXV0aA' },
};

async function crearAviso(
  personId: string,
  category: 'MEMBERSHIP' | 'GOVERNANCE_MANDATORY' = 'MEMBERSHIP',
): Promise<string> {
  const aviso = await base.prisma.notification.create({
    data: {
      personId,
      category,
      title: 'Tu membresía vence pronto',
      body: 'Renuévala antes de la fecha.',
      linkPath: '/mi/membresia',
      channels: ['IN_APP', 'WEB_PUSH'],
    },
    select: { id: true },
  });
  return aviso.id;
}

async function suscribir(personId: string): Promise<void> {
  await base.prisma.person.update({
    where: { id: personId },
    data: { webPushSubscriptions: [{ endpoint: SUSCRIPCION.endpoint, keys: { ...SUSCRIPCION.keys } }] },
  });
}

async function intentosWeb(notificationId: string) {
  return base.prisma.deliveryAttempt.findMany({
    where: { notificationId, channel: 'WEB_PUSH' },
    select: { status: true },
  });
}

beforeAll(async () => {
  base = await createTestDatabase('avisos_web');
  await base.seed();
}, 180_000);

afterEach(() => {
  setWebPushForTests(null);
});

afterAll(async () => {
  await base?.destroy();
});

describe('entrega de avisos web', () => {
  it('la persona suscrita sí recibe: el puerto se llama y el intento queda SENT', async () => {
    const puerto = puertoFalso();
    setWebPushForTests(puerto);

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Suscrita' });
    await suscribir(persona.personId);
    const avisoId = await crearAviso(persona.personId);

    const resultado = await deliverWebPushForNotification(avisoId);

    expect(resultado.ok && resultado.data.sent).toBe(1);
    expect(resultado.ok && resultado.data.suppressed).toBe(false);
    expect(puerto.llamadas).toHaveLength(1);
    expect(puerto.llamadas[0]?.endpoint).toBe(SUSCRIPCION.endpoint);
    expect(await intentosWeb(avisoId)).toEqual([{ status: 'SENT' }]);
  });

  it('LA PUERTA: la persona sin suscripción no recibe; el puerto no se llama y el intento queda SUPPRESSED', async () => {
    const puerto = puertoFalso();
    setWebPushForTests(puerto);

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'SinSuscripcion' });
    const avisoId = await crearAviso(persona.personId);

    const resultado = await deliverWebPushForNotification(avisoId);

    expect(resultado.ok && resultado.data.sent).toBe(0);
    expect(resultado.ok && resultado.data.suppressed).toBe(true);
    // La garantía: sin suscripción, nunca se toca el servicio de push.
    expect(puerto.llamadas).toHaveLength(0);
    expect(await intentosWeb(avisoId)).toEqual([{ status: 'SUPPRESSED' }]);
  });

  it('una clase silenciada por el canal web no sale, aunque haya suscripción', async () => {
    const puerto = puertoFalso();
    setWebPushForTests(puerto);

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Silenciada' });
    await suscribir(persona.personId);
    await base.prisma.notificationPreference.create({
      data: {
        personId: persona.personId,
        category: 'MEMBERSHIP',
        channel: 'WEB_PUSH',
        suppressed: true,
        createdByActorId: persona.actorId,
      },
    });
    const avisoId = await crearAviso(persona.personId, 'MEMBERSHIP');

    const resultado = await deliverWebPushForNotification(avisoId);

    expect(resultado.ok && resultado.data.suppressed).toBe(true);
    expect(puerto.llamadas).toHaveLength(0);
    expect(await intentosWeb(avisoId)).toEqual([{ status: 'SUPPRESSED' }]);
  });

  it('el aviso obligatorio de gobierno sale aunque el canal web se haya intentado silenciar', async () => {
    const puerto = puertoFalso();
    setWebPushForTests(puerto);

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Gobierno' });
    await suscribir(persona.personId);
    const avisoId = await crearAviso(persona.personId, 'GOVERNANCE_MANDATORY');

    const resultado = await deliverWebPushForNotification(avisoId);

    expect(resultado.ok && resultado.data.sent).toBe(1);
    expect(puerto.llamadas).toHaveLength(1);
    expect(await intentosWeb(avisoId)).toEqual([{ status: 'SENT' }]);
  });

  it('un endpoint que el navegador ya retiró (410) se olvida', async () => {
    const puerto = puertoFalso({ delivered: false, gone: true, statusCode: 410 });
    setWebPushForTests(puerto);

    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Retirada' });
    await suscribir(persona.personId);
    const avisoId = await crearAviso(persona.personId);

    await deliverWebPushForNotification(avisoId);

    const despues = await base.prisma.person.findUnique({
      where: { id: persona.personId },
      select: { webPushSubscriptions: true },
    });
    expect(despues?.webPushSubscriptions).toEqual([]);
    expect(await intentosWeb(avisoId)).toEqual([{ status: 'FAILED' }]);
  });
});
