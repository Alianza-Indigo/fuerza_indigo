import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { startCheckout } from '@/modules/billing';

/**
 * Cobro de eventos, conectado al catálogo financiero (PRD §16.3, §11).
 *
 * Un evento con costo tiene un concepto del catálogo (`Event.catalogProductId`).
 * Inscribirse a él reserva el lugar, pero **no se confirma hasta que el pago se
 * confirma**: el cobro va por la pasarela de la Fase 3, y cuando el pago se
 * confirma —por su webhook, a través del buzón de eventos de dominio— la
 * inscripción pasa a `CONFIRMED` con su `paymentId`. Volver del navegador no
 * confirma nada; solo el webhook lo hace.
 */

export const startEventCheckoutSchema = z.object({ eventId: z.uuid() });

/** Inicia el cobro de un evento con costo para la inscripción de la persona. */
export async function startEventCheckout(
  actor: ActorContext,
  input: { eventId: string },
): Promise<UseCaseResult<{ url: string }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());
  const parsed = startEventCheckoutSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ eventId: ['Identificador de evento inválido.'] }));
  const { eventId } = parsed.data;
  const personId = actor.personId;

  const evento = await db().event.findUnique({
    where: { id: eventId },
    select: { id: true, catalogProductId: true },
  });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));
  if (evento.catalogProductId === null) {
    return fail(errors.conflict('Este evento no tiene costo: no hay nada que pagar.'));
  }

  const registro = await db().eventRegistration.findUnique({
    where: { eventId_personId: { eventId, personId } },
    select: { id: true, status: true },
  });
  if (registro === null || registro.status === 'CANCELLED') {
    return fail(errors.conflict('Primero inscríbete al evento; después se paga.'));
  }
  if (registro.status === 'CONFIRMED' || registro.status === 'ATTENDED') {
    return fail(errors.conflict('Ya pagaste este evento.'));
  }

  const checkout = await startCheckout(actor, { productId: evento.catalogProductId, returnPath: '/mi/eventos' });
  if (!checkout.ok) return fail(checkout.error);

  // Se enlaza el cobro con la inscripción, para que al confirmarse el pago se
  // sepa qué inscripción confirmar.
  const pago = await db().payment.findUnique({ where: { publicId: checkout.data.paymentPublicId }, select: { id: true } });
  if (pago !== null) {
    await db().eventRegistration.update({ where: { id: registro.id }, data: { paymentId: pago.id } });
  }

  return ok({ url: checkout.data.url });
}

/**
 * Confirma una inscripción cuando su pago se confirma.
 *
 * Lo llama el manejador del evento de dominio `billing.payment.succeeded`. Es
 * idempotente: una inscripción ya confirmada, o un pago que no está en
 * `SUCCEEDED`, no cambian nada. Un pago que no corresponde a ninguna inscripción
 * —por ejemplo, el de una afiliación— tampoco: este manejador no lo toca.
 */
export async function confirmEventRegistrationFromPayment(
  actor: ActorContext,
  paymentId: string,
): Promise<{ confirmed: boolean }> {
  return transaction(async (tx) => {
    const registro = await tx.eventRegistration.findFirst({
      where: { paymentId },
      select: { id: true, status: true, eventId: true, personId: true, event: { select: { legalEntityId: true } } },
    });
    if (registro === null) return { confirmed: false };

    const pago = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (pago?.status !== 'SUCCEEDED') return { confirmed: false };
    if (registro.status !== 'REGISTERED') return { confirmed: false };

    await tx.eventRegistration.update({ where: { id: registro.id }, data: { status: 'CONFIRMED' } });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_REGISTRATION_CONFIRMED,
      objectKind: 'EventRegistration',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.event.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      metadata: { eventId: registro.eventId, paymentId },
    });
    return { confirmed: true };
  });
}
