import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { newPublicId } from '@/platform/kernel/ids';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { env } from '@/platform/config/env';
import { logger } from '@/platform/observability/logger';
import { stripe } from '@/platform/payments/stripe-port';
import { accountForLegalEntity } from '@/platform/payments/accounts';
import { currentPrice } from './catalog-queries';
import { priceFor } from './pricing';

/**
 * Cobro alojado y portal de cliente (PRD §11.3, F3-PAG-003 y F3-PAG-004).
 *
 * Tres reglas gobiernan este módulo:
 *
 *  1. **La plataforma no toca una tarjeta.** El cobro ocurre en una página de
 *     Stripe. Aquí solo se decide qué se cobra, a nombre de qué entidad y a
 *     cuenta de quién, y se guarda la intención antes de mandar a nadie a pagar.
 *  2. **El regreso del navegador no prueba nada.** El PRD §11.4 lo dice con
 *     todas sus letras: el pago queda en `REQUIRES_PAYMENT` hasta que llegue el
 *     webhook firmado. Quien vuelve de Stripe ve «lo estamos confirmando», que
 *     es la verdad.
 *  3. **Pulsar dos veces no abre dos cobros.** La intención abierta se reutiliza
 *     con su misma clave de idempotencia, y Stripe devuelve la misma sesión en
 *     lugar de crear otra.
 */

/**
 * Cuánto tiempo se reutiliza una intención de cobro abierta.
 *
 * Es el margen de quien pulsa dos veces, vuelve atrás en el navegador o lo
 * intenta otra vez porque se le cerró la pestaña. Pasado ese rato, un nuevo
 * intento es un intento nuevo de verdad: quien vuelve al día siguiente a pagar
 * su cuota espera un cobro nuevo, no el de ayer.
 *
 * Se queda por debajo de las veinticuatro horas que Stripe conserva una clave
 * de idempotencia, para que reutilizarla siga devolviendo la misma sesión y no
 * un error por clave caducada.
 */
export const CHECKOUT_REUSE_MS = 2 * 60 * 60 * 1000;

export const startCheckoutSchema = z.object({
  productId: z.uuid({ error: () => 'Elige qué quieres pagar.' }),
  /**
   * A dónde vuelve la persona. Solo rutas de esta plataforma: un destino
   * externo convertiría el formulario en un trampolín para mandar a alguien a
   * cualquier sitio con la apariencia de que la organización lo respalda.
   */
  returnPath: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9\-/_]*$/, { error: () => 'El destino de regreso tiene que ser una ruta de esta plataforma.' })
    .max(200)
    .default('/mi/pagos'),
});

export type StartCheckoutInput = z.input<typeof startCheckoutSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * La cuenta de cobro de una persona en una entidad.
 *
 * Se crea al primer intento de pago y no antes: una cuenta de cobro sin ningún
 * cobro es una fila que no dice nada de nadie. Hay una por entidad jurídica
 * porque son personas morales distintas, cada una con su cuenta en la pasarela.
 */
async function cuentaDeCobro(
  personId: string,
  legalEntityId: string,
  billingEmail: string,
): Promise<{ id: string; stripeCustomerId: string | null; status: string }> {
  const existente = await db().billingAccount.findFirst({
    where: { personId, legalEntityId, holderKind: 'PERSON' },
    select: { id: true, stripeCustomerId: true, status: true },
  });
  if (existente !== null) return existente;

  return db().billingAccount.create({
    data: { holderKind: 'PERSON', personId, legalEntityId, billingEmail },
    select: { id: true, stripeCustomerId: true, status: true },
  });
}

export interface StartedCheckout {
  readonly url: string;
  readonly paymentPublicId: string;
  /** Verdadero cuando se reutilizó una intención abierta en lugar de abrir otra. */
  readonly reused: boolean;
}

export async function startCheckout(
  actor: ActorContext,
  input: StartCheckoutInput,
): Promise<UseCaseResult<StartedCheckout>> {
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.personId === null || actor.userId === null) {
    return fail(
      errors.forbidden(
        'actor sin persona ni cuenta: no hay a nombre de quién cobrar',
        'Para pagar hace falta entrar con tu cuenta.',
      ),
    );
  }

  const producto = await db().catalogProduct.findUnique({
    where: { id: data.productId },
    select: {
      id: true,
      code: true,
      name: true,
      legalEntityId: true,
      billingMode: true,
      kind: true,
      archivedAt: true,
      isActive: true,
      legalEntity: { select: { code: true, shortName: true } },
    },
  });
  if (producto === null) return fail(errors.notFound('concepto inexistente'));

  const decision = can(
    actor,
    'billing.checkout.start',
    { kind: 'CatalogProduct', id: producto.id, legalEntityId: producto.legalEntityId },
    // La titularidad que exige este permiso es pagar lo propio. Quien paga es
    // la persona de la sesión, y la cuenta de cobro se resuelve a partir de
    // ella: no hay forma de pedir el cobro de la cuenta de otra.
    { hasLiveAssignment: () => true },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (producto.archivedAt !== null || !producto.isActive) {
    return fail(
      errors.conflict(
        'Ese concepto ya no se cobra. Si crees que es un error, escríbenos y lo revisamos.',
        'intento de cobrar un producto archivado',
      ),
    );
  }

  const precio = await currentPrice(producto.id);
  if (precio === null) {
    return fail(
      errors.ruleViolation(
        'Ese concepto todavía no tiene un importe vigente, así que no podemos cobrarlo.',
        'producto sin CatalogPrice vigente: cobrarlo sería cobrar una cantidad que nadie fijó',
      ),
    );
  }

  const persona = await db().person.findUnique({
    where: { id: actor.personId },
    select: { primaryEmail: true },
  });
  const usuario = await db().user.findUnique({ where: { id: actor.userId }, select: { email: true } });
  const correo = persona?.primaryEmail ?? usuario?.email ?? null;
  if (correo === null) {
    return fail(
      errors.ruleViolation(
        'Necesitamos un correo tuyo para mandarte el comprobante. Añádelo en tu cuenta y vuelve a intentarlo.',
        'la persona no tiene ningún correo con el que abrir la sesión de cobro',
      ),
    );
  }

  const cuenta = await cuentaDeCobro(actor.personId, producto.legalEntityId, correo);
  if (cuenta.status !== 'ACTIVE') {
    return fail(
      errors.conflict(
        'Tu cuenta de cobro está suspendida. Escríbenos y lo resolvemos contigo.',
        `cuenta de cobro en estado ${cuenta.status}`,
      ),
    );
  }

  const cuentaStripe = accountForLegalEntity(producto.legalEntity.code);
  if (cuentaStripe === null) {
    return fail(
      errors.dependencyUnavailable(
        `cuenta de cobro sin asignar para la entidad ${producto.legalEntity.code}`,
        'Ahora mismo no podemos procesar el pago. Inténtalo más tarde o escríbenos.',
      ),
    );
  }

  // Lo que la persona paga de verdad: la beca o el descuento que le
  // corresponda, resuelto en un solo sitio (`pricing.ts`). Sin este paso, una
  // beca aprobada sería una fila que no cambia nada.
  const efectivo = await priceFor({
    personId: actor.personId,
    legalEntityId: producto.legalEntityId,
    productId: producto.id,
    productKind: producto.kind,
    baseMinor: precio.amountMinor,
  });

  // Exención total: no se puede mandar a nadie a pagar cero. El cobro queda
  // asentado como exento y no pasa por ninguna pasarela, que es lo que hace que
  // el libro cuadre y que la persona vea su concepto cubierto.
  if (efectivo.finalMinor === 0n) {
    const exento = await transaction(async (tx) => {
      const fila = await tx.payment.create({
        data: {
          publicId: newPublicId(20),
          billingAccountId: cuenta.id,
          legalEntityId: producto.legalEntityId,
          catalogPriceId: precio.id,
          stripeAccountKey: cuentaStripe,
          amountMinor: 0n,
          currency: precio.currency,
          status: 'SUCCEEDED',
          method: 'EXEMPTION',
          paidAt: new Date(),
          ...(efectivo.discountGrantId === null ? {} : { discountGrantId: efectivo.discountGrantId }),
          ...(efectivo.scholarshipId === null ? {} : { scholarshipId: efectivo.scholarshipId }),
          idempotencyKey: `exencion:${newPublicId(24)}`,
          createdByActorId: actor.actorId,
        },
        select: { id: true, publicId: true },
      });

      if (efectivo.discountGrantId !== null) {
        await tx.discountGrant.update({
          where: { id: efectivo.discountGrantId },
          data: { redemptions: { increment: 1 } },
        });
      }

      return fila;
    });

    return ok({
      url: `${env().APP_URL}/mi/pagos/${exento.publicId}`,
      paymentPublicId: exento.publicId,
      reused: false,
    });
  }

  // Se reutiliza la intención abierta en lugar de abrir otra. Con su misma
  // clave de idempotencia, Stripe devuelve la sesión que ya existe.
  const abierta = await db().payment.findFirst({
    where: {
      billingAccountId: cuenta.id,
      catalogPriceId: precio.id,
      status: 'REQUIRES_PAYMENT',
      createdAt: { gte: new Date(Date.now() - CHECKOUT_REUSE_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, publicId: true, idempotencyKey: true },
  });

  const modo = producto.billingMode === 'RECURRING' ? 'subscription' : 'payment';
  const base = env().APP_URL;

  const pago =
    abierta ??
    (await db().payment.create({
      data: {
        publicId: newPublicId(20),
        billingAccountId: cuenta.id,
        legalEntityId: producto.legalEntityId,
        catalogPriceId: precio.id,
        stripeAccountKey: cuentaStripe,
        amountMinor: efectivo.finalMinor,
        currency: precio.currency,
        ...(efectivo.discountGrantId === null ? {} : { discountGrantId: efectivo.discountGrantId }),
        ...(efectivo.scholarshipId === null ? {} : { scholarshipId: efectivo.scholarshipId }),
        // Nace en `REQUIRES_PAYMENT` y ahí se queda hasta que llegue el webhook
        // firmado. El regreso del navegador no lo mueve (PRD §11.4).
        status: 'REQUIRES_PAYMENT',
        method: modo === 'subscription' ? 'STRIPE_SUBSCRIPTION' : 'STRIPE_CHECKOUT',
        idempotencyKey: randomUUID(),
        createdByActorId: actor.actorId,
      },
      select: { id: true, publicId: true, idempotencyKey: true },
    }));

  let sesion;
  try {
    sesion = await stripe().createCheckoutSession({
      account: cuentaStripe,
      customerEmail: correo,
      stripeCustomerId: cuenta.stripeCustomerId,
      mode: modo,
      lineItems: [
        {
          // Con descuento aplicado se cobra el importe suelto y no el precio
          // registrado en la pasarela: si se mandara el precio, cobraría el
          // completo y la rebaja habría sido decorativa.
          stripePriceId: efectivo.finalMinor === precio.amountMinor ? precio.stripePriceId : null,
          amountMinor: efectivo.finalMinor,
          currency: precio.currency,
          productName:
            efectivo.explanation === null ? producto.name : `${producto.name} — ${efectivo.explanation}`,
          quantity: 1,
        },
      ],
      // El identificador público viaja en la dirección de regreso para poder
      // enseñar el estado de **este** cobro, no el del último que hubiera.
      successUrl: `${base}/mi/pagos/${pago.publicId}?volviendo=1`,
      cancelUrl: `${base}${data.returnPath}?cobro=cancelado`,
      idempotencyKey: pago.idempotencyKey,
      metadata: {
        paymentId: pago.id,
        paymentPublicId: pago.publicId,
        productCode: producto.code,
        legalEntity: producto.legalEntity.code,
      },
    });
  } catch (error) {
    logger.error('No se pudo abrir la sesión de cobro', {
      module: 'billing',
      correlationId: actor.correlationId,
      outcome: 'failed',
      context: { paymentId: pago.id, account: cuentaStripe, error: String(error) },
    });
    return fail(
      errors.dependencyUnavailable(
        'la pasarela rechazó la creación de la sesión de cobro',
        'No pudimos abrir la página de pago. Vuelve a intentarlo en un momento; no se te ha cobrado nada.',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.payment.update({
      where: { id: pago.id },
      data: {
        stripeCheckoutSessionId: sesion.id,
        ...(sesion.paymentIntentId === null ? {} : { stripePaymentIntentId: sesion.paymentIntentId }),
      },
    });

    // El uso del descuento se cuenta al abrir la intención, no al reutilizarla:
    // pulsar dos veces no puede gastar dos veces un cupón limitado.
    if (abierta === null && efectivo.discountGrantId !== null) {
      await tx.discountGrant.update({
        where: { id: efectivo.discountGrantId },
        data: { redemptions: { increment: 1 } },
      });
    }
  });

  return ok({ url: sesion.url, paymentPublicId: pago.publicId, reused: abierta !== null });
}

/* -------------------------------------------------------------------------- */
/* Portal de cliente                                                          */
/* -------------------------------------------------------------------------- */

export const openPortalSchema = z.object({
  legalEntityId: z.uuid(),
  returnPath: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9\-/_]*$/)
    .max(200)
    .default('/mi/pagos'),
});

/**
 * Abre el portal de cliente de Stripe (F3-PAG-004).
 *
 * Es donde la persona cambia su forma de pago, descarga sus recibos y cancela
 * su suscripción. Se apoya en el portal en lugar de reconstruirlo aquí porque
 * duplicar esas pantallas significaría duplicar también sus errores, y porque
 * los datos de una tarjeta no deben pasar por esta plataforma ni un instante.
 *
 * Lo que la persona haga ahí vuelve por webhook, que es la fuente de verdad del
 * estado financiero (PRD §11.4).
 */
export async function openBillingPortal(
  actor: ActorContext,
  input: z.input<typeof openPortalSchema>,
): Promise<UseCaseResult<{ url: string }>> {
  const parsed = openPortalSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.personId === null) {
    return fail(
      errors.forbidden('actor sin persona: no hay cuenta de cobro propia que abrir', 'Para entrar a tus pagos hace falta tu cuenta.'),
    );
  }

  const decision = can(
    actor,
    'billing.payment.read_own',
    { kind: 'BillingAccount', legalEntityId: parsed.data.legalEntityId },
    // La titularidad es la propia persona de la sesión: la cuenta se busca por
    // su `personId` justo debajo, así que no hay forma de abrir la de otra.
    { hasLiveAssignment: () => true },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const cuenta = await db().billingAccount.findFirst({
    where: { personId: actor.personId, legalEntityId: parsed.data.legalEntityId, holderKind: 'PERSON' },
    select: { stripeCustomerId: true, legalEntity: { select: { code: true, shortName: true } } },
  });

  if (cuenta === null || cuenta.stripeCustomerId === null) {
    return fail(
      errors.notFound(
        'la persona no tiene cuenta de cobro con identificador en la pasarela para esta entidad',
        'Todavía no tienes ningún cobro con esta entidad, así que no hay nada que administrar aquí.',
      ),
    );
  }

  const cuentaStripe = accountForLegalEntity(cuenta.legalEntity.code);
  if (cuentaStripe === null) {
    return fail(
      errors.dependencyUnavailable(
        `cuenta de cobro sin asignar para la entidad ${cuenta.legalEntity.code}`,
        'Ahora mismo no podemos abrir tus pagos. Inténtalo más tarde.',
      ),
    );
  }

  try {
    const sesion = await stripe().createPortalSession({
      account: cuentaStripe,
      stripeCustomerId: cuenta.stripeCustomerId,
      returnUrl: `${env().APP_URL}${parsed.data.returnPath}`,
    });
    return ok(sesion);
  } catch (error) {
    logger.error('No se pudo abrir el portal de cliente', {
      module: 'billing',
      correlationId: actor.correlationId,
      outcome: 'failed',
      context: { account: cuentaStripe, error: String(error) },
    });
    return fail(
      errors.dependencyUnavailable(
        'la pasarela rechazó la creación de la sesión del portal',
        'No pudimos abrir tus pagos ahora mismo. Vuelve a intentarlo en un momento.',
      ),
    );
  }
}
