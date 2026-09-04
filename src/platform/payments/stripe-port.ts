import { env } from '@/platform/config/env';
import { logger } from '@/platform/observability/logger';
import type { StripeAccountKey } from '@prisma-client/enums';

/**
 * Puerto de cobro con adaptadores intercambiables (PRD §11.2, ADR-0016).
 *
 * Dos cuentas desde el primer día. Fuerza Índigo y Alianza Índigo son personas
 * morales distintas: cada una cobra por su cuenta, con su clave y su secreto de
 * webhook. Aunque al principio se opere una sola, el modelo ya distingue cuál
 * recibe cada movimiento, de modo que separarlas después no obliga a
 * reconstruir el historial.
 *
 * **Las claves viven solo en el entorno.** No hay ninguna en base de datos: una
 * clave secreta guardada es una clave que aparece en un respaldo, en una
 * exportación y en la pantalla de quien depure una consulta.
 *
 * Se habla con Stripe por HTTP y no con su biblioteca, por lo mismo que el
 * correo usa `fetch` contra Resend: una dependencia menos y, sobre todo, un
 * puerto que se puede sustituir entero en las pruebas sin simular un módulo.
 */

export interface CheckoutLineItem {
  readonly stripePriceId: string | null;
  /** Cuando no hay precio en Stripe, se cobra un importe suelto. */
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly productName: string;
  readonly quantity: number;
}

export interface CreateCheckoutInput {
  readonly account: StripeAccountKey;
  readonly customerEmail: string;
  readonly stripeCustomerId: string | null;
  readonly mode: 'payment' | 'subscription';
  readonly lineItems: readonly CheckoutLineItem[];
  readonly successUrl: string;
  readonly cancelUrl: string;
  /**
   * Clave de idempotencia. Stripe devuelve la **misma** sesión si se repite,
   * en lugar de crear otra: es lo que hace que pulsar el botón dos veces no
   * abra dos cobros.
   */
  readonly idempotencyKey: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
  readonly paymentIntentId: string | null;
}

export interface CreatePortalInput {
  readonly account: StripeAccountKey;
  readonly stripeCustomerId: string;
  readonly returnUrl: string;
}

export interface CreateRefundInput {
  readonly account: StripeAccountKey;
  readonly paymentIntentId: string;
  readonly amountMinor: bigint;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface StripePort {
  readonly name: string;
  /**
   * Qué puede hacer de verdad este adaptador, por cuenta. Lo lee la
   * verificación de salud, igual que en el correo: un panel que dice
   * «configurado» de un adaptador que lanza al primer cobro no sirve de nada.
   */
  capability(account: StripeAccountKey): { capability: 'CHARGES' | 'UNAVAILABLE'; detail: string };
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  createPortalSession(input: CreatePortalInput): Promise<{ url: string }>;
  createRefund(input: CreateRefundInput): Promise<{ id: string; status: string }>;
}

/* -------------------------------------------------------------------------- */
/* Claves y secretos, siempre desde el entorno                                */
/* -------------------------------------------------------------------------- */

export function secretKeyFor(account: StripeAccountKey): string {
  const config = env();
  return account === 'FUERZA' ? config.STRIPE_FUERZA_SECRET_KEY : config.STRIPE_ALIANZA_SECRET_KEY;
}

export function webhookSecretFor(account: StripeAccountKey): string {
  const config = env();
  return account === 'FUERZA' ? config.STRIPE_FUERZA_WEBHOOK_SECRET : config.STRIPE_ALIANZA_WEBHOOK_SECRET;
}

/** Traduce el segmento de la dirección del webhook a su cuenta. */
export function accountFromSlug(slug: string): StripeAccountKey | null {
  if (slug === 'fuerza') return 'FUERZA';
  if (slug === 'alianza') return 'ALIANZA';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Adaptador HTTP                                                             */
/* -------------------------------------------------------------------------- */

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * Stripe recibe formularios, no JSON, y anida con corchetes.
 *
 * Se aplana a mano porque es la única forma de que el cuerpo enviado sea
 * exactamente el que se puede leer en el registro cuando algo falla.
 */
function toFormBody(value: Record<string, unknown>, prefix = ''): string[] {
  const partes: string[] = [];

  for (const [clave, contenido] of Object.entries(value)) {
    if (contenido === undefined || contenido === null) continue;
    const nombre = prefix === '' ? clave : `${prefix}[${clave}]`;

    if (Array.isArray(contenido)) {
      contenido.forEach((elemento, indice) => {
        if (typeof elemento === 'object' && elemento !== null) {
          partes.push(...toFormBody(elemento as Record<string, unknown>, `${nombre}[${indice}]`));
        } else {
          partes.push(`${encodeURIComponent(`${nombre}[${indice}]`)}=${encodeURIComponent(String(elemento))}`);
        }
      });
    } else if (typeof contenido === 'object') {
      partes.push(...toFormBody(contenido as Record<string, unknown>, nombre));
    } else {
      // `String()` sobre un objeto daría «[object Object]» y Stripe recibiría un
      // valor sin sentido sin quejarse. Aquí ya se sabe que es un escalar,
      // porque los objetos y los arreglos se resolvieron arriba, y se convierte
      // por tipo en vez de confiar en la conversión implícita.
      const escalar =
        typeof contenido === 'string'
          ? contenido
          : typeof contenido === 'number' || typeof contenido === 'bigint'
            ? contenido.toString()
            : typeof contenido === 'boolean'
              ? String(contenido)
              : null;

      if (escalar === null) {
        throw new Error(`No se puede enviar a Stripe el campo ${nombre}: no es un valor simple.`);
      }
      partes.push(`${encodeURIComponent(nombre)}=${encodeURIComponent(escalar)}`);
    }
  }

  return partes;
}

async function callStripe<T>(input: {
  account: StripeAccountKey;
  path: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<T> {
  const clave = secretKeyFor(input.account);
  if (clave === '') {
    throw new Error(
      `La cuenta de cobro ${input.account} no tiene clave configurada. Consulte docs/ENVIRONMENT.md §6.`,
    );
  }

  const respuesta = await fetch(`${STRIPE_API}${input.path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(input.idempotencyKey === undefined ? {} : { 'Idempotency-Key': input.idempotencyKey }),
    },
    body: toFormBody(input.body).join('&'),
  });

  const payload = (await respuesta.json()) as { error?: { message?: string; code?: string } };

  if (!respuesta.ok) {
    const detalle = payload.error?.message ?? `respuesta ${respuesta.status}`;
    logger.error('Stripe rechazó la petición', {
      module: 'payments',
      outcome: 'failed',
      context: { account: input.account, path: input.path, code: payload.error?.code },
    });
    throw new Error(`Stripe: ${detalle}`);
  }

  return payload as T;
}

const httpAdapter: StripePort = {
  name: 'stripe-http',

  capability: (account) =>
    secretKeyFor(account) === ''
      ? {
          capability: 'UNAVAILABLE',
          detail: `la cuenta ${account} no tiene clave configurada: no puede cobrar`,
        }
      : { capability: 'CHARGES', detail: `la cuenta ${account} está configurada para cobrar` },

  createCheckoutSession: async (input) => {
    const respuesta = await callStripe<{ id: string; url: string; payment_intent: string | null }>({
      account: input.account,
      path: '/checkout/sessions',
      idempotencyKey: input.idempotencyKey,
      body: {
        mode: input.mode,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        ...(input.stripeCustomerId === null
          ? { customer_email: input.customerEmail }
          : { customer: input.stripeCustomerId }),
        line_items: input.lineItems.map((linea) =>
          linea.stripePriceId === null
            ? {
                quantity: linea.quantity,
                price_data: {
                  currency: linea.currency.toLowerCase(),
                  unit_amount: linea.amountMinor.toString(),
                  product_data: { name: linea.productName },
                },
              }
            : { quantity: linea.quantity, price: linea.stripePriceId },
        ),
        metadata: input.metadata,
      },
    });

    return { id: respuesta.id, url: respuesta.url, paymentIntentId: respuesta.payment_intent };
  },

  createPortalSession: async (input) => {
    const respuesta = await callStripe<{ url: string }>({
      account: input.account,
      path: '/billing_portal/sessions',
      body: { customer: input.stripeCustomerId, return_url: input.returnUrl },
    });
    return { url: respuesta.url };
  },

  createRefund: async (input) => {
    const respuesta = await callStripe<{ id: string; status: string }>({
      account: input.account,
      path: '/refunds',
      idempotencyKey: input.idempotencyKey,
      body: {
        payment_intent: input.paymentIntentId,
        amount: input.amountMinor.toString(),
        metadata: { motivo: input.reason.slice(0, 400) },
      },
    });
    return { id: respuesta.id, status: respuesta.status };
  },
};

/* -------------------------------------------------------------------------- */
/* Selección y sustitución                                                    */
/* -------------------------------------------------------------------------- */

let override: StripePort | null = null;

export function stripe(): StripePort {
  return override ?? httpAdapter;
}

/** Solo para pruebas: sustituye el puerto entero sin tocar la red. */
export function setStripeForTests(port: StripePort | null): void {
  override = port;
}

/** Lo que cada cuenta puede hacer hoy. Lo consulta la verificación de salud. */
export function stripeCapability(): Record<StripeAccountKey, { capability: string; detail: string }> {
  const port = stripe();
  return {
    FUERZA: port.capability('FUERZA'),
    ALIANZA: port.capability('ALIANZA'),
  };
}
