import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { logger } from '@/platform/observability/logger';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { postPaymentEntry } from './ledger';
import type { PaymentStatus, SubscriptionStatus } from '@prisma-client/enums';

/**
 * Procesamiento de eventos de cobro (PRD §11.4, F3-PAG-008).
 *
 * Idempotente, transaccional y reintentable. Las tres cosas por la misma razón:
 * la pasarela reenvía. Reenvía cuando nuestra respuesta tarda, cuando el
 * servidor se reinicia a media petición y cuando alguien pulsa «reenviar» en su
 * panel. Un procesamiento que no soporte eso cobra dos veces, duplica una
 * membresía o deja un ingreso contado por partida doble.
 *
 * **La idempotencia no se apoya en el estado del evento sino en el de lo que
 * toca.** Marcar el evento como procesado no basta: dos entregas simultáneas
 * pueden pasar la comprobación a la vez. Lo que de verdad protege es que cada
 * transición sea condicional —un pago solo pasa a pagado si no lo estaba— y que
 * cada ingreso lleve una clave de idempotencia única derivada del documento de
 * la pasarela que lo origina.
 *
 * **Los eventos llegan desordenados.** No es una hipótesis: la pasarela no
 * garantiza el orden. Un evento cuya referencia todavía no existe no es un
 * error, es un evento temprano: se marca sin conciliar y se reintenta. Tratarlo
 * como fallo llenaría la bitácora de alarmas por algo que se arregla solo.
 */

export type ProcessOutcome =
  | { readonly kind: 'PROCESSED'; readonly detail: string }
  | { readonly kind: 'IGNORED'; readonly detail: string }
  | { readonly kind: 'ALREADY_DONE'; readonly detail: string }
  | { readonly kind: 'BUSY'; readonly detail: string }
  | { readonly kind: 'UNRECONCILED'; readonly detail: string }
  | { readonly kind: 'FAILED'; readonly detail: string };

/** Estados de suscripción de la pasarela traducidos a los del sistema. */
const ESTADO_DE_SUSCRIPCION: Record<string, SubscriptionStatus> = {
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELED',
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'UNPAID',
  paused: 'PAST_DUE',
};

function texto(objeto: Record<string, unknown>, clave: string): string | null {
  const valor = objeto[clave];
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

function booleano(objeto: Record<string, unknown>, clave: string): boolean {
  return objeto[clave] === true;
}

/**
 * Lee un importe de la pasarela.
 *
 * Vienen como enteros en unidades menores. Se rechaza cualquier cosa que no lo
 * sea en vez de redondearla: un importe mal leído se asienta en el libro y
 * después hay que explicarlo.
 */
function importe(objeto: Record<string, unknown>, clave: string): bigint | null {
  const valor = objeto[clave];
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) return null;
  return BigInt(valor);
}

function segundos(objeto: Record<string, unknown>, clave: string): Date | null {
  const valor = objeto[clave];
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) return null;
  return new Date(valor * 1000);
}

/** Referencia a un objeto de la pasarela que puede venir expandido o como cadena. */
function referencia(objeto: Record<string, unknown>, clave: string): string | null {
  const valor = objeto[clave];
  if (typeof valor === 'string' && valor !== '') return valor;
  if (typeof valor === 'object' && valor !== null) {
    const anidado = (valor as Record<string, unknown>)['id'];
    return typeof anidado === 'string' && anidado !== '' ? anidado : null;
  }
  return null;
}

function metadato(objeto: Record<string, unknown>, clave: string): string | null {
  const meta = objeto['metadata'];
  if (typeof meta !== 'object' || meta === null) return null;
  return texto(meta as Record<string, unknown>, clave);
}

/* -------------------------------------------------------------------------- */
/* Transiciones de un pago                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Estados desde los que un pago todavía puede moverse.
 *
 * Un pago ya devuelto o en disputa no vuelve a «pagado» porque llegue un
 * evento viejo: los eventos desordenados existen, y el estado más avanzado
 * gana. Sin esta lista, un reenvío tardío de `payment_intent.succeeded`
 * borraría una devolución ya asentada.
 */
const ADMITEN_CONFIRMACION: readonly PaymentStatus[] = ['REQUIRES_PAYMENT', 'PENDING', 'FAILED'];

async function marcarPagado(
  tx: Tx,
  paymentId: string,
  cuando: Date,
  paymentIntentId: string | null,
): Promise<boolean> {
  const resultado = await tx.payment.updateMany({
    where: { id: paymentId, status: { in: [...ADMITEN_CONFIRMACION] } },
    data: {
      status: 'SUCCEEDED',
      paidAt: cuando,
      ...(paymentIntentId === null ? {} : { stripePaymentIntentId: paymentIntentId }),
    },
  });
  return resultado.count > 0;
}

/* -------------------------------------------------------------------------- */
/* Manejadores por tipo de evento                                             */
/* -------------------------------------------------------------------------- */

interface Contexto {
  readonly tx: Tx;
  readonly objeto: Record<string, unknown>;
  readonly correlationId: string;
  readonly actorId: string;
}

type Manejador = (contexto: Contexto) => Promise<ProcessOutcome & { paymentId?: string }>;

/**
 * La sesión de cobro terminó.
 *
 * Es el momento en que la pasarela nos dice quién es esta persona para ella
 * —su identificador de cliente— y, si el concepto era recurrente, qué
 * suscripción abrió. Sin este evento no hay forma de atar una suscripción a un
 * concepto del catálogo, porque el importe puede haberse cobrado sin precio
 * registrado en la pasarela.
 */
const sesionTerminada: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const sessionId = texto(objeto, 'id');
  const porMetadato = metadato(objeto, 'paymentId');

  const pago =
    (porMetadato === null
      ? null
      : await tx.payment.findUnique({
          where: { id: porMetadato },
          select: { id: true, billingAccountId: true, catalogPriceId: true, status: true },
        })) ??
    (sessionId === null
      ? null
      : await tx.payment.findUnique({
          where: { stripeCheckoutSessionId: sessionId },
          select: { id: true, billingAccountId: true, catalogPriceId: true, status: true },
        }));

  if (pago === null) {
    return {
      kind: 'UNRECONCILED',
      detail: 'la sesión de cobro no corresponde a ninguna intención registrada',
    };
  }

  const customerId = referencia(objeto, 'customer');
  if (customerId !== null) {
    // El identificador de cliente es lo que abre el portal. Se escribe con
    // `updateMany` y condición para que dos entregas simultáneas no choquen
    // contra el índice único.
    await tx.billingAccount.updateMany({
      where: { id: pago.billingAccountId, stripeCustomerId: null },
      data: { stripeCustomerId: customerId },
    });
  }

  const subscriptionId = referencia(objeto, 'subscription');
  if (subscriptionId !== null && pago.catalogPriceId !== null) {
    const yaExiste = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true },
    });

    if (yaExiste === null) {
      const ahora = new Date();
      await tx.subscription.create({
        data: {
          billingAccountId: pago.billingAccountId,
          catalogPriceId: pago.catalogPriceId,
          stripeSubscriptionId: subscriptionId,
          status: 'INCOMPLETE',
          // El periodo real llega en `customer.subscription.*`. Aquí se deja
          // uno que ya venció, para que una suscripción sin confirmar nunca
          // parezca vigente por omisión.
          currentPeriodStart: ahora,
          currentPeriodEnd: ahora,
        },
      });
    }

    await tx.payment.updateMany({
      where: { id: pago.id, subscriptionId: null },
      data: { subscriptionId: (await tx.subscription.findUniqueOrThrow({
        where: { stripeSubscriptionId: subscriptionId },
        select: { id: true },
      })).id },
    });
  }

  // Un cobro único queda pagado aquí si la pasarela ya lo dio por pagado. Un
  // recurrente no: su ingreso lo trae la factura, y contarlo dos veces sería
  // exactamente la duplicidad que el PRD §11.4 prohíbe.
  if (subscriptionId === null && texto(objeto, 'payment_status') === 'paid') {
    const movido = await marcarPagado(tx, pago.id, new Date(), referencia(objeto, 'payment_intent'));
    if (movido) {
      // El asiento va en la **misma** transacción que la confirmación: no
      // puede existir un cobro confirmado sin su asiento ni al revés.
      await postPaymentEntry(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), pago.id);
      await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
        action: AUDIT_ACTIONS.PAYMENT_SUCCEEDED,
        objectKind: 'Payment',
        objectId: pago.id,
        outcome: 'SUCCESS',
        metadata: { origen: 'checkout.session.completed' },
      });
    }
    return { kind: 'PROCESSED', detail: 'cobro único confirmado', paymentId: pago.id };
  }

  return { kind: 'PROCESSED', detail: 'sesión de cobro registrada', paymentId: pago.id };
};

const intencionPagada: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const intentId = texto(objeto, 'id');
  if (intentId === null) return { kind: 'FAILED', detail: 'la intención de pago no trae identificador' };

  const pago = await tx.payment.findUnique({
    where: { stripePaymentIntentId: intentId },
    select: { id: true, status: true },
  });
  if (pago === null) {
    return { kind: 'UNRECONCILED', detail: 'la intención de pago no corresponde a ningún cobro registrado' };
  }

  const movido = await marcarPagado(tx, pago.id, new Date(), null);
  if (movido) {
    await postPaymentEntry(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), pago.id);
    await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
      action: AUDIT_ACTIONS.PAYMENT_SUCCEEDED,
      objectKind: 'Payment',
      objectId: pago.id,
      outcome: 'SUCCESS',
      metadata: { origen: 'payment_intent.succeeded' },
    });
  }

  return {
    kind: 'PROCESSED',
    detail: movido ? 'cobro confirmado' : `el cobro ya estaba en ${pago.status}`,
    paymentId: pago.id,
  };
};

const intencionFallida: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const intentId = texto(objeto, 'id');
  if (intentId === null) return { kind: 'FAILED', detail: 'la intención de pago no trae identificador' };

  const pago = await tx.payment.findUnique({
    where: { stripePaymentIntentId: intentId },
    select: { id: true },
  });
  if (pago === null) {
    return { kind: 'UNRECONCILED', detail: 'la intención de pago no corresponde a ningún cobro registrado' };
  }

  const error = objeto['last_payment_error'];
  const codigo =
    typeof error === 'object' && error !== null ? texto(error as Record<string, unknown>, 'code') : null;

  // Solo desde estados no terminales: un cobro ya pagado no pasa a fallido
  // porque llegue tarde el fallo de un intento anterior.
  const resultado = await tx.payment.updateMany({
    where: { id: pago.id, status: { in: ['REQUIRES_PAYMENT', 'PENDING'] } },
    data: { status: 'FAILED', failureCode: codigo },
  });

  if (resultado.count > 0) {
    await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      objectKind: 'Payment',
      objectId: pago.id,
      outcome: 'FAILED',
      metadata: { codigo },
    });
  }

  return { kind: 'PROCESSED', detail: 'cobro fallido registrado', paymentId: pago.id };
};

const cargoDevuelto: Manejador = async ({ tx, objeto }) => {
  const intentId = referencia(objeto, 'payment_intent');
  if (intentId === null) return { kind: 'FAILED', detail: 'el cargo no trae intención de pago' };

  const pago = await tx.payment.findUnique({
    where: { stripePaymentIntentId: intentId },
    select: { id: true, amountMinor: true },
  });
  if (pago === null) return { kind: 'UNRECONCILED', detail: 'el cargo no corresponde a ningún cobro registrado' };

  const devuelto = importe(objeto, 'amount_refunded');
  if (devuelto === null) return { kind: 'FAILED', detail: 'el cargo no trae un importe devuelto legible' };

  const estado: PaymentStatus = devuelto >= pago.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await tx.payment.updateMany({
    where: { id: pago.id, status: { notIn: ['REFUNDED'] } },
    data: { status: estado },
  });

  return { kind: 'PROCESSED', detail: `devolución registrada (${estado})`, paymentId: pago.id };
};

const disputaAbierta: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const intentId = referencia(objeto, 'payment_intent');
  if (intentId === null) return { kind: 'FAILED', detail: 'la disputa no trae intención de pago' };

  const pago = await tx.payment.findUnique({
    where: { stripePaymentIntentId: intentId },
    select: { id: true },
  });
  if (pago === null) return { kind: 'UNRECONCILED', detail: 'la disputa no corresponde a ningún cobro registrado' };

  await tx.payment.updateMany({ where: { id: pago.id }, data: { status: 'DISPUTED' } });

  await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
    action: AUDIT_ACTIONS.PAYMENT_DISPUTED,
    objectKind: 'Payment',
    objectId: pago.id,
    outcome: 'FAILED',
    metadata: { motivo: texto(objeto, 'reason') },
  });

  return { kind: 'PROCESSED', detail: 'disputa registrada', paymentId: pago.id };
};

/**
 * La suscripción cambió de estado.
 *
 * Aquí se calcula el periodo de gracia: cuando el cobro falla, el derecho no se
 * pierde de golpe sino que sobrevive los días que el concepto tenga
 * configurados (PRD §11.3). Si son cero, se pierde en cuanto el cargo falla,
 * que es lo que ocurría antes de que la columna existiera.
 */
const suscripcionCambiada: Manejador = async ({ tx, objeto }) => {
  const subscriptionId = texto(objeto, 'id');
  if (subscriptionId === null) return { kind: 'FAILED', detail: 'la suscripción no trae identificador' };

  const fila = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      id: true,
      status: true,
      catalogPrice: { select: { product: { select: { gracePeriodDays: true } } } },
    },
  });

  if (fila === null) {
    // Evento temprano: la sesión de cobro que ata la suscripción a su concepto
    // todavía no ha llegado. Se reintenta, no se falla.
    return {
      kind: 'UNRECONCILED',
      detail: 'la suscripción todavía no está atada a ningún concepto del catálogo',
    };
  }

  const estadoCrudo = texto(objeto, 'status') ?? '';
  const estado = ESTADO_DE_SUSCRIPCION[estadoCrudo];
  if (estado === undefined) {
    return { kind: 'FAILED', detail: `estado de suscripción desconocido: ${estadoCrudo}` };
  }

  const inicio = segundos(objeto, 'current_period_start');
  const fin = segundos(objeto, 'current_period_end');
  const dias = fila.catalogPrice.product.gracePeriodDays;

  const enApuros = estado === 'PAST_DUE' || estado === 'UNPAID';
  const gracia =
    enApuros && dias > 0 && fin !== null ? new Date(fin.getTime() + dias * 24 * 60 * 60 * 1000) : null;

  await tx.subscription.update({
    where: { id: fila.id },
    data: {
      status: enApuros && gracia !== null && gracia.getTime() > Date.now() ? 'GRACE_PERIOD' : estado,
      ...(inicio === null ? {} : { currentPeriodStart: inicio }),
      ...(fin === null ? {} : { currentPeriodEnd: fin }),
      gracePeriodEndsAt: gracia,
      cancelAtPeriodEnd: booleano(objeto, 'cancel_at_period_end'),
      canceledAt: segundos(objeto, 'canceled_at'),
    },
  });

  return { kind: 'PROCESSED', detail: `suscripción en ${estado}` };
};

/**
 * Una factura de renovación se cobró.
 *
 * Crea el ingreso del periodo. La clave de idempotencia se deriva del
 * identificador de la factura y es única en toda la instalación: un reenvío no
 * puede crear un segundo ingreso por el mismo periodo, que es la duplicidad que
 * el PRD §11.4 prohíbe expresamente.
 */
const facturaPagada: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const facturaId = texto(objeto, 'id');
  const subscriptionId = referencia(objeto, 'subscription');
  if (facturaId === null || subscriptionId === null) {
    return { kind: 'IGNORED', detail: 'factura sin suscripción: no corresponde a una renovación' };
  }

  const suscripcion = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      id: true,
      billingAccountId: true,
      catalogPriceId: true,
      billingAccount: { select: { legalEntityId: true } },
      catalogPrice: { select: { currency: true } },
    },
  });
  if (suscripcion === null) {
    return { kind: 'UNRECONCILED', detail: 'la factura no corresponde a ninguna suscripción registrada' };
  }

  const clave = `stripe:invoice:${facturaId}`;
  const yaContado = await tx.payment.findUnique({ where: { idempotencyKey: clave }, select: { id: true } });
  if (yaContado !== null) {
    return { kind: 'ALREADY_DONE', detail: 'el ingreso de esta factura ya estaba contado', paymentId: yaContado.id };
  }

  const pagado = importe(objeto, 'amount_paid');
  if (pagado === null) return { kind: 'FAILED', detail: 'la factura no trae un importe legible' };

  const cuenta = await tx.billingAccount.findUniqueOrThrow({
    where: { id: suscripcion.billingAccountId },
    select: { legalEntityId: true },
  });
  const entidad = await tx.legalEntity.findUniqueOrThrow({
    where: { id: cuenta.legalEntityId },
    select: { code: true },
  });

  const pago = await tx.payment.create({
    data: {
      publicId: newPublicId(20),
      billingAccountId: suscripcion.billingAccountId,
      legalEntityId: cuenta.legalEntityId,
      catalogPriceId: suscripcion.catalogPriceId,
      subscriptionId: suscripcion.id,
      stripeAccountKey: entidad.code === 'ALIANZA_INDIGO' ? 'ALIANZA' : 'FUERZA',
      stripePaymentIntentId: referencia(objeto, 'payment_intent'),
      amountMinor: pagado,
      currency: (texto(objeto, 'currency') ?? suscripcion.catalogPrice.currency).toUpperCase(),
      status: 'SUCCEEDED',
      method: 'STRIPE_SUBSCRIPTION',
      paidAt: new Date(),
      idempotencyKey: clave,
      createdByActorId: actorId,
    },
    select: { id: true },
  });

  // Se cobró: si venía de un fallo, la gracia deja de correr.
  await tx.subscription.update({
    where: { id: suscripcion.id },
    data: { gracePeriodEndsAt: null },
  });

  await postPaymentEntry(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), pago.id);

  await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
    action: AUDIT_ACTIONS.PAYMENT_SUCCEEDED,
    objectKind: 'Payment',
    objectId: pago.id,
    outcome: 'SUCCESS',
    legalEntityId: cuenta.legalEntityId,
    metadata: { origen: 'invoice.payment_succeeded', factura: facturaId },
  });

  return { kind: 'PROCESSED', detail: 'ingreso de renovación registrado', paymentId: pago.id };
};

/** Una factura de renovación falló. Abre el periodo de gracia si el concepto lo tiene. */
const facturaFallida: Manejador = async ({ tx, objeto, correlationId, actorId }) => {
  const subscriptionId = referencia(objeto, 'subscription');
  if (subscriptionId === null) {
    return { kind: 'IGNORED', detail: 'factura sin suscripción: no corresponde a una renovación' };
  }

  const suscripcion = await tx.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: {
      id: true,
      currentPeriodEnd: true,
      catalogPrice: { select: { product: { select: { gracePeriodDays: true, name: true } } } },
    },
  });
  if (suscripcion === null) {
    return { kind: 'UNRECONCILED', detail: 'la factura no corresponde a ninguna suscripción registrada' };
  }

  const dias = suscripcion.catalogPrice.product.gracePeriodDays;
  const gracia = dias > 0 ? new Date(Date.now() + dias * 24 * 60 * 60 * 1000) : null;

  await tx.subscription.update({
    where: { id: suscripcion.id },
    data: {
      status: gracia === null ? 'PAST_DUE' : 'GRACE_PERIOD',
      gracePeriodEndsAt: gracia,
    },
  });

  await recordAudit(tx, systemContext({ actorId, jobType: 'stripe-webhook', correlationId }), {
    action: AUDIT_ACTIONS.PAYMENT_FAILED,
    objectKind: 'Subscription',
    objectId: suscripcion.id,
    outcome: 'FAILED',
    metadata: { concepto: suscripcion.catalogPrice.product.name, diasDeGracia: dias },
  });

  return { kind: 'PROCESSED', detail: gracia === null ? 'suscripción vencida' : 'periodo de gracia abierto' };
};

const MANEJADORES: Record<string, Manejador> = {
  'checkout.session.completed': sesionTerminada,
  'payment_intent.succeeded': intencionPagada,
  'payment_intent.payment_failed': intencionFallida,
  'charge.refunded': cargoDevuelto,
  'charge.dispute.created': disputaAbierta,
  'customer.subscription.created': suscripcionCambiada,
  'customer.subscription.updated': suscripcionCambiada,
  'customer.subscription.deleted': suscripcionCambiada,
  'invoice.payment_succeeded': facturaPagada,
  'invoice.payment_failed': facturaFallida,
};

/* -------------------------------------------------------------------------- */
/* Orquestación                                                               */
/* -------------------------------------------------------------------------- */

export async function processWebhookEvent(eventRowId: string, correlationId: string): Promise<ProcessOutcome> {
  const evento = await db().stripeWebhookEvent.findUnique({
    where: { id: eventRowId },
    select: { id: true, eventType: true, payload: true, processingStatus: true, attempts: true },
  });
  if (evento === null) return { kind: 'FAILED', detail: 'el evento no existe' };

  if (evento.processingStatus === 'PROCESSED' || evento.processingStatus === 'IGNORED') {
    return { kind: 'ALREADY_DONE', detail: `el evento ya estaba en ${evento.processingStatus}` };
  }

  // Toma del evento con condición: si otra entrega simultánea ya lo tiene, esta
  // se retira. Es lo que evita que dos procesos apliquen el mismo cambio a la
  // vez, que es cuando la idempotencia por estado no alcanza.
  const tomado = await db().stripeWebhookEvent.updateMany({
    where: { id: eventRowId, processingStatus: { in: ['RECEIVED', 'FAILED', 'UNRECONCILED'] } },
    data: { processingStatus: 'PROCESSING', attempts: { increment: 1 } },
  });
  if (tomado.count === 0) return { kind: 'BUSY', detail: 'otra entrega del mismo evento lo está procesando' };

  const manejador = MANEJADORES[evento.eventType];
  if (manejador === undefined) {
    await db().stripeWebhookEvent.update({
      where: { id: eventRowId },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), lastError: null },
    });
    return { kind: 'IGNORED', detail: `sin manejador para ${evento.eventType}` };
  }

  const actorId = await systemActorId('stripe-webhook');

  try {
    const resultado = await transaction(async (tx) => {
      const cuerpo = evento.payload as { data?: { object?: Record<string, unknown> } };
      const objeto = cuerpo.data?.object ?? {};
      return manejador({ tx, objeto, correlationId, actorId });
    });

    const estado =
      resultado.kind === 'UNRECONCILED'
        ? 'UNRECONCILED'
        : resultado.kind === 'FAILED'
          ? 'FAILED'
          : resultado.kind === 'IGNORED'
            ? 'IGNORED'
            : 'PROCESSED';

    await db().stripeWebhookEvent.update({
      where: { id: eventRowId },
      data: {
        processingStatus: estado,
        processedAt: estado === 'PROCESSED' || estado === 'IGNORED' ? new Date() : null,
        lastError: estado === 'PROCESSED' || estado === 'IGNORED' ? null : resultado.detail.slice(0, 1000),
        ...(resultado.paymentId === undefined ? {} : { resultingPaymentId: resultado.paymentId }),
      },
    });

    logger.info('Evento de cobro procesado', {
      module: 'billing',
      correlationId,
      outcome: estado === 'PROCESSED' || estado === 'IGNORED' || estado === 'UNRECONCILED' ? 'success' : 'failed',
      context: { eventType: evento.eventType, estado, detalle: resultado.detail },
    });

    return resultado;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    // El evento vuelve a `FAILED`, no se pierde, y su contador de intentos ya
    // subió. Lo que llegó sigue guardado íntegro para reintentar y para
    // auditar, que es para lo que se persistió antes de mirarlo.
    await db().stripeWebhookEvent.update({
      where: { id: eventRowId },
      data: { processingStatus: 'FAILED', lastError: mensaje.slice(0, 1000) },
    });

    logger.error('Fallo procesando un evento de cobro', {
      module: 'billing',
      correlationId,
      outcome: 'failed',
      context: { eventType: evento.eventType, error: mensaje },
    });

    return { kind: 'FAILED', detail: mensaje };
  }
}
