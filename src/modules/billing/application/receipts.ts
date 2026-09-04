import { db } from '@/platform/db/client';
import { enqueue } from '@/platform/jobs/queue';
import { logger } from '@/platform/observability/logger';
import { env } from '@/platform/config/env';
import { formatMoney } from '@/platform/i18n';

/**
 * Comprobantes de pago (PRD §11.3, F3-CMS-001).
 *
 * Un comprobante **no es una factura**. La plataforma vincula comprobantes; no
 * sustituye a un sistema de facturación autorizado (PRD §26), y el texto de la
 * plantilla lo dice con esas palabras para que nadie lo presente como lo que no
 * es.
 *
 * Se manda por la cola y **fuera** de la transacción del cobro. Si el proveedor
 * de correo está caído, el pago ya está confirmado y asentado: perderlo por no
 * poder acusarlo sería perder lo único que importa. La cola reintenta.
 *
 * La clave de negocio es el identificador del pago, así que reintentar no manda
 * dos comprobantes por el mismo cobro.
 */

/** Prepara y encola el comprobante de un cobro confirmado. */
export async function issueReceipt(paymentId: string, correlationId: string): Promise<boolean> {
  const pago = await db().payment.findUnique({
    where: { id: paymentId },
    select: {
      publicId: true,
      amountMinor: true,
      currency: true,
      paidAt: true,
      billingAccount: {
        select: {
          billingEmail: true,
          person: { select: { givenName: true, familyName: true, primaryEmail: true } },
          organization: { select: { legalName: true } },
        },
      },
      legalEntity: { select: { shortName: true, contactEmail: true } },
      catalogPrice: { select: { product: { select: { name: true } } } },
    },
  });

  if (pago === null) return false;

  const destino = pago.billingAccount.person?.primaryEmail ?? pago.billingAccount.billingEmail;
  if (destino === null || destino === '') {
    // Sin correo no hay a quién mandarlo, y eso no es un fallo del cobro: el
    // pago está hecho y consta. Se registra para que se note, no se lanza.
    logger.info('Cobro sin correo al que mandar el comprobante', {
      module: 'billing',
      correlationId,
      context: { paymentId },
    });
    return false;
  }

  const nombre =
    pago.billingAccount.person === null
      ? (pago.billingAccount.organization?.legalName ?? 'Hola')
      : pago.billingAccount.person.givenName;

  const fecha = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'America/Mexico_City',
  }).format(pago.paidAt ?? new Date());

  try {
    await enqueue({
      jobType: 'payment-receipt',
      businessKey: paymentId,
      payload: {
        to: destino,
        templateCode: 'PAYMENT_RECEIPT',
        variables: {
          displayName: nombre,
          // El importe se formatea aquí, una sola vez y con las mismas reglas
          // que la pantalla. Una plantilla no debe hacer aritmética con dinero.
          amount: formatMoney(pago.amountMinor, pago.currency),
          concept: pago.catalogPrice?.product.name ?? 'un concepto del catálogo',
          entityName: pago.legalEntity.shortName,
          paidAt: fecha,
          reference: pago.publicId,
          paymentUrl: `${env().APP_URL}/mi/pagos/${pago.publicId}`,
          contactEmail: pago.legalEntity.contactEmail,
        },
      },
      correlationId,
    });
    return true;
  } catch (error) {
    logger.error('No se pudo encolar el comprobante', {
      module: 'billing',
      correlationId,
      outcome: 'failed',
      context: { paymentId, error: String(error) },
    });
    return false;
  }
}

/**
 * Avisa de que un cobro periódico falló, y de cuánto tiempo hay para resolverlo.
 *
 * El aviso dice el periodo de gracia porque es lo que separa un susto de una
 * pérdida de derechos: quien recibe «no pudimos cobrarte» sin saber qué pasa
 * después se queda esperando lo peor.
 */
export async function noticeFailedCharge(subscriptionId: string, correlationId: string): Promise<boolean> {
  const suscripcion = await db().subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      gracePeriodEndsAt: true,
      catalogPrice: {
        select: { amountMinor: true, currency: true, product: { select: { name: true } } },
      },
      billingAccount: {
        select: {
          billingEmail: true,
          person: { select: { givenName: true, primaryEmail: true } },
          legalEntity: { select: { contactEmail: true } },
        },
      },
    },
  });

  if (suscripcion === null) return false;

  const destino = suscripcion.billingAccount.person?.primaryEmail ?? suscripcion.billingAccount.billingEmail;
  if (destino === null || destino === '') return false;

  const gracia = suscripcion.gracePeriodEndsAt;
  const aviso =
    gracia === null
      ? 'Vamos a volver a intentarlo. Si no se resuelve, el derecho asociado deja de estar activo.'
      : `Tienes hasta el ${new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'long',
          timeZone: 'America/Mexico_City',
        }).format(gracia)} para resolverlo sin perder nada.`;

  try {
    await enqueue({
      jobType: 'payment-failed-notice',
      // La clave lleva el fin de la gracia: un fallo del periodo siguiente
      // manda un aviso nuevo, y un reintento del mismo no.
      businessKey: `${subscriptionId}:${gracia?.toISOString() ?? 'sin-gracia'}`,
      payload: {
        to: destino,
        templateCode: 'PAYMENT_FAILED_NOTICE',
        variables: {
          displayName: suscripcion.billingAccount.person?.givenName ?? 'Hola',
          amount: formatMoney(suscripcion.catalogPrice.amountMinor, suscripcion.catalogPrice.currency),
          concept: suscripcion.catalogPrice.product.name,
          graceNotice: aviso,
          paymentUrl: `${env().APP_URL}/mi/pagos`,
          contactEmail: suscripcion.billingAccount.legalEntity.contactEmail,
        },
      },
      correlationId,
    });
    return true;
  } catch (error) {
    logger.error('No se pudo encolar el aviso de cobro fallido', {
      module: 'billing',
      correlationId,
      outcome: 'failed',
      context: { subscriptionId, error: String(error) },
    });
    return false;
  }
}
