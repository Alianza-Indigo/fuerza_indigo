import { onDomainEvent } from '@/platform/jobs/queue';
import { PAYMENT_SUCCEEDED } from '@/modules/billing/application/payment-events';
import { activateFromConfirmedPayment } from '@/modules/membership/application/memberships';
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

export async function registerDomainEventHandlers(): Promise<void> {
  if (registrado) return;
  registrado = true;

  const actorId = await systemActorId('domain-events');

  onDomainEvent(PAYMENT_SUCCEEDED, 'membership-activation', async (payload, correlationId) => {
    const paymentId = payload['paymentId'];
    if (typeof paymentId !== 'string' || paymentId === '') {
      throw new Error('El aviso de cobro confirmado no trae identificador de cobro.');
    }

    await activateFromConfirmedPayment(
      systemContext({ actorId, jobType: 'domain-events', correlationId }),
      paymentId,
    );
  });
}

/** Solo para pruebas: permite volver a registrar tras limpiar el registro. */
export function resetRegistryForTests(): void {
  registrado = false;
}
