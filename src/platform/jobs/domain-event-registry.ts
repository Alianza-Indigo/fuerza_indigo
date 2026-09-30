import { dispatchOutbox, onDomainEvent } from '@/platform/jobs/queue';
import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { PAYMENT_SUCCEEDED } from '@/modules/billing/application/payment-events';
import { activateFromConfirmedPayment } from '@/modules/membership/application/memberships';
import { confirmEventRegistrationFromPayment } from '@/modules/events';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';

/**
 * Quién escucha qué (ADR-0082).
 *
 * Existe este archivo, y no una llamada suelta en cada módulo, por una razón
 * que no se ve leyendo `queue.ts`: el registro de manejadores vive en memoria
 * del proceso, y en un entorno sin servidor cada invocación arranca en frío.
 * Si el registro ocurriera como efecto de importar el módulo que lo hace, el
 * despachador entregaría los mensajes **sin manejadores** en cualquier
 * invocación donde ese módulo no se hubiera importado por otra razón —y los
 * marcaría como entregados, con la nota «sin manejadores registrados»—.
 *
 * Es decir: el hecho se perdería en silencio y la bandeja diría que todo fue
 * bien. Por eso el despachador llama a `registerDomainEventHandlers()` antes de
 * repartir, y por eso la lista de suscripciones está en un solo sitio donde se
 * puede leer entera.
 */
let registrado = false;

export function registerDomainEventHandlers(): Promise<void> {
  if (registrado) return Promise.resolve();
  registrado = true;

  onDomainEvent(PAYMENT_SUCCEEDED, 'membership-activation', async (payload, correlationId) => {
    const paymentId = payload['paymentId'];
    if (typeof paymentId !== 'string' || paymentId === '') {
      throw new Error('El aviso de cobro confirmado no trae identificador de cobro.');
    }

    const actorId = await systemActorId('domain-events');
    await activateFromConfirmedPayment(
      systemContext({ actorId, jobType: 'domain-events', correlationId }),
      paymentId,
    );
  });

  // Un pago confirmado que corresponde a una inscripción de evento la confirma.
  // Convive con la activación de membresía: cada manejador toca solo lo suyo y
  // no hace nada con un pago que no le corresponde.
  onDomainEvent(PAYMENT_SUCCEEDED, 'event-registration-confirmation', async (payload, correlationId) => {
    const paymentId = payload['paymentId'];
    if (typeof paymentId !== 'string' || paymentId === '') {
      throw new Error('El aviso de cobro confirmado no trae identificador de cobro.');
    }

    const actorId = await systemActorId('domain-events');
    await confirmEventRegistrationFromPayment(
      systemContext({ actorId, jobType: 'domain-events', correlationId }),
      paymentId,
    );
  });
  return Promise.resolve();
}

/** Solo para pruebas: permite volver a registrar tras limpiar el registro. */
export function resetRegistryForTests(): void {
  registrado = false;
}

/** Entrega solo los efectos del pago confirmado; el cron conserva los reintentos. */
export async function deliverConfirmedPayment(paymentId: string, correlationId: string): Promise<void> {
  try {
    await registerDomainEventHandlers();
    const messages = await db().outboxMessage.findMany({
      where: { eventName: PAYMENT_SUCCEEDED, payload: { path: ['paymentId'], equals: paymentId }, status: { in: ['PENDING', 'DELIVERING'] } },
      select: { id: true },
      take: 25,
    });
    if (messages.length > 0) await dispatchOutbox(messages.length, messages.map((message) => message.id));
  } catch (error) {
    // El ingreso confirmado se conserva aunque falle un efecto; su evento sigue persistido.
    logger.error('No se pudieron entregar los efectos del pago; la cola los reintentará', {
      module: 'billing', correlationId, outcome: 'failed', context: { paymentId, error: String(error) },
    });
  }
}
