import type { Tx } from '@/platform/db/unit-of-work';
import { publishDomainEvent } from '@/platform/jobs/queue';

/**
 * El aviso de que un cobro quedó confirmado (ADR-0082).
 *
 * Un cobro pasa a `SUCCEEDED` desde cinco sitios: dos webhooks de pasarela, la
 * factura de una renovación, la aprobación de un pago manual y la exención
 * total. Lo que ocurre después —activar una membresía, por ejemplo— no le
 * incumbe a ninguno de los cinco: si cada uno llamara a la activación, añadir
 * un sexto camino significaría acordarse de llamarla otra vez, y olvidarlo
 * dejaría a alguien pagado y sin membresía sin que nada fallara.
 *
 * Por eso se publica un hecho, dentro de la **misma transacción** que lo
 * produce, y quien tenga algo que hacer con él se suscribe. Es la bandeja de
 * salida de la Fase 1 (ADR-0025), que hasta aquí existía sin que nadie la
 * usara.
 */
export const PAYMENT_SUCCEEDED = 'billing.payment.succeeded';

export async function announcePaymentSucceeded(
  tx: Tx,
  input: {
    paymentId: string;
    legalEntityId: string | null;
    origen: string;
    correlationId: string;
    actorId: string;
  },
): Promise<void> {
  await publishDomainEvent(tx, {
    eventName: PAYMENT_SUCCEEDED,
    // Solo identificadores: el PRD §17.5 pide que la bandeja no lleve
    // contenido personal, y quien consume puede leer lo que necesite.
    payload: { paymentId: input.paymentId, origen: input.origen },
    legalEntityId: input.legalEntityId,
    correlationId: input.correlationId,
    actorId: input.actorId,
  });
}
