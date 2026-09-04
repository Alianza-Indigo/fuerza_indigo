import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ALERT_AFTER_MS,
  MAX_ATTEMPTS,
  RETRY_AFTER_MS,
  createPrice,
  createProduct,
  processWebhookEvent,
  receiveWebhook,
  retryUnreconciledWebhooks,
  startCheckout,
} from '@/modules/billing';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { signStripePayload } from '@/platform/payments/signature';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Webhooks de cobro (PRD §11.4, F3-PAG-007, F3-PAG-008 y F3-QA-002).
 *
 * Los cuatro casos que el PRD exige probar están aquí y son los cuatro que
 * rompen un sistema de cobros: firma inválida, evento repetido, evento fuera de
 * orden y cuenta cruzada. Ninguno es hipotético: la pasarela reenvía, no
 * garantiza el orden, y la dirección del webhook es pública.
 */

let base: TestDatabase;
let agremiada: PersonaDePrueba;
let finanzas: PersonaDePrueba;
let fuerzaId: string;

const SECRETO_FUERZA = 'whsec_de_prueba_para_fuerza_indigo_0000';
const SECRETO_ALIANZA = 'whsec_de_prueba_para_alianza_indigo_000';

const puertoDePrueba: StripePort = {
  name: 'prueba',
  capability: () => ({ capability: 'CHARGES', detail: 'puerto de prueba' }),
  createCheckoutSession: (input) =>
    Promise.resolve({
      id: `cs_test_${input.idempotencyKey.slice(0, 12)}`,
      url: 'https://pasarela.invalid/pagar',
      paymentIntentId: null,
    }),
  createPortalSession: () => Promise.resolve({ url: 'https://pasarela.invalid/portal' }),
  createRefund: () => Promise.resolve({ id: 're_test', status: 'succeeded' }),
};

let contador = 0;
function idDeEvento(prefijo = 'evt'): string {
  contador += 1;
  return `${prefijo}_${Date.now().toString(36)}_${String(contador)}`;
}

/** Construye el sobre y lo firma con el secreto de la cuenta indicada. */
function entregar(
  slug: 'fuerza' | 'alianza',
  cuerpo: Record<string, unknown>,
  opciones: { firmarCon?: string; header?: string | null } = {},
) {
  const rawBody = JSON.stringify(cuerpo);
  const secreto = opciones.firmarCon ?? (slug === 'fuerza' ? SECRETO_FUERZA : SECRETO_ALIANZA);
  return receiveWebhook({
    slug,
    rawBody,
    signatureHeader: opciones.header === undefined ? signStripePayload({ rawBody, secret: secreto }) : opciones.header,
    correlationId: 'prueba',
    ipHash: null,
  });
}

function sobre(tipo: string, objeto: Record<string, unknown>, id = idDeEvento()) {
  return { id, type: tipo, api_version: '2026-01-01', data: { object: objeto } };
}

async function conceptoConPrecio(code: string, modo: 'ONE_TIME' | 'RECURRING', gracia = 0): Promise<string> {
  const actor = await contextoDe(base.prisma, finanzas);
  const creado = await createProduct(actor, {
    code,
    name: `Concepto ${code}`,
    description: 'Un concepto creado por las pruebas de webhooks.',
    legalEntityId: fuerzaId,
    kind: modo === 'RECURRING' ? 'UNION_DUE_ORDINARY' : 'ENROLLMENT_FEE',
    billingMode: modo,
    gracePeriodDays: gracia,
  });
  if (!creado.ok) throw new Error(creado.error.message);

  const precio = await createPrice(actor, {
    productId: creado.data.productId,
    amountMinor: 150_00,
    currency: 'MXN',
    ...(modo === 'RECURRING' ? { interval: 'MONTH' as const } : {}),
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  });
  if (!precio.ok) throw new Error(precio.error.message);
  return creado.data.productId;
}

/** Abre una intención de cobro y devuelve lo que hace falta para simular su evento. */
async function intencionAbierta(code: string, modo: 'ONE_TIME' | 'RECURRING', gracia = 0) {
  const productId = await conceptoConPrecio(code, modo, gracia);
  const iniciado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
  if (!iniciado.ok) throw new Error(iniciado.error.message);

  const pago = await base.prisma.payment.findFirstOrThrow({
    where: { publicId: iniciado.data.paymentPublicId },
    select: { id: true, stripeCheckoutSessionId: true, billingAccountId: true },
  });
  return { productId, ...pago, publicId: iniciado.data.paymentPublicId };
}

beforeAll(async () => {
  base = await createTestDatabase('webhooks');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Una', familyName: 'Agremiada' });

  await nombrar(base.prisma, {
    userId: finanzas.userId,
    roleCode: 'FINANCE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: agremiada.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
}, 180_000);

beforeEach(() => {
  setStripeForTests(puertoDePrueba);
  process.env['STRIPE_FUERZA_WEBHOOK_SECRET'] = SECRETO_FUERZA;
  process.env['STRIPE_ALIANZA_WEBHOOK_SECRET'] = SECRETO_ALIANZA;
});

afterEach(() => {
  setStripeForTests(null);
});

afterAll(async () => {
  await base.destroy();
});

describe('firma inválida', () => {
  it('un evento sin firma no se guarda, y queda constancia de que alguien lo intentó', async () => {
    const antes = await base.prisma.stripeWebhookEvent.count();

    const resultado = await entregar('fuerza', sobre('payment_intent.succeeded', { id: 'pi_inventado' }), {
      header: null,
    });

    expect(resultado.kind).toBe('BAD_SIGNATURE');
    // No se guarda: aceptar cuerpos que no vienen de la pasarela sería dejar
    // que cualquiera llene la tabla con lo que quiera.
    expect(await base.prisma.stripeWebhookEvent.count()).toBe(antes);

    const alerta = await base.prisma.securityEvent.findFirst({
      where: { kind: 'WEBHOOK_SIGNATURE_INVALID' },
      orderBy: { occurredAt: 'desc' },
      select: { severity: true },
    });
    expect(alerta?.severity).toBe('CRITICAL');
  });

  it('un cuerpo alterado después de firmarlo no pasa', async () => {
    const cuerpo = sobre('payment_intent.succeeded', { id: 'pi_original' });
    const rawBody = JSON.stringify(cuerpo);
    const firma = signStripePayload({ rawBody, secret: SECRETO_FUERZA });

    const resultado = await receiveWebhook({
      slug: 'fuerza',
      rawBody: rawBody.replace('pi_original', 'pi_alterado'),
      signatureHeader: firma,
      correlationId: 'prueba',
      ipHash: null,
    });

    expect(resultado.kind).toBe('BAD_SIGNATURE');
  });
});

describe('cuenta cruzada', () => {
  it('un evento firmado por una entidad no se acepta en la dirección de la otra', async () => {
    // Es la razón de que haya dos direcciones y no una. Con una sola habría que
    // probar los dos secretos, y entonces un evento de una entidad entraría
    // como si fuera de la otra.
    const resultado = await entregar('alianza', sobre('payment_intent.succeeded', { id: 'pi_cruzado' }), {
      firmarCon: SECRETO_FUERZA,
    });
    expect(resultado.kind).toBe('BAD_SIGNATURE');
  });

  it('el mismo evento entra por la dirección que le corresponde', async () => {
    const resultado = await entregar('alianza', sobre('payment_intent.succeeded', { id: 'pi_propio' }));
    expect(resultado.kind).toBe('ACCEPTED');
  });

  it('una dirección de cuenta inexistente no existe', async () => {
    const resultado = await receiveWebhook({
      slug: 'inventada',
      rawBody: '{}',
      signatureHeader: null,
      correlationId: 'prueba',
      ipHash: null,
    });
    expect(resultado.kind).toBe('UNKNOWN_ACCOUNT');
  });
});

describe('evento repetido', () => {
  it('el reenvío del mismo evento no lo guarda dos veces', async () => {
    const cuerpo = sobre('payment_intent.succeeded', { id: 'pi_repetido' });

    const primera = await entregar('fuerza', cuerpo);
    const segunda = await entregar('fuerza', cuerpo);

    expect(primera.kind).toBe('ACCEPTED');
    expect(segunda.kind).toBe('DUPLICATE');
    expect(await base.prisma.stripeWebhookEvent.count({ where: { stripeEventId: cuerpo.id } })).toBe(1);
  });

  it('procesar dos veces el mismo evento no cobra dos veces', async () => {
    const intencion = await intencionAbierta('REPETIDO_UNA_VEZ', 'ONE_TIME');

    const cuerpo = sobre('checkout.session.completed', {
      id: intencion.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: 'cus_prueba_repetido',
      payment_intent: 'pi_prueba_repetido',
      metadata: { paymentId: intencion.id },
    });

    const recibido = await entregar('fuerza', cuerpo);
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó el evento');

    const primero = await processWebhookEvent(recibido.eventRowId, 'prueba');
    const segundo = await processWebhookEvent(recibido.eventRowId, 'prueba');

    expect(primero.kind).toBe('PROCESSED');
    expect(segundo.kind).toBe('ALREADY_DONE');

    // Un solo pago, y una sola vez pagado.
    const pagos = await base.prisma.payment.findMany({
      where: { billingAccountId: intencion.billingAccountId },
      select: { status: true },
    });
    expect(pagos.filter((p) => p.status === 'SUCCEEDED')).toHaveLength(1);
  });

  it('dos facturas de renovación repetidas no cuentan el ingreso dos veces', async () => {
    const intencion = await intencionAbierta('RENOVACION_REPETIDA', 'RECURRING');
    const subId = `sub_${Date.now().toString(36)}`;

    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_renovacion',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó la sesión');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    const facturaId = `in_${Date.now().toString(36)}`;
    const cuerpoFactura = {
      id: facturaId,
      subscription: subId,
      amount_paid: 150_00,
      currency: 'mxn',
      payment_intent: 'pi_renovacion',
    };

    // Dos eventos distintos con la misma factura: es lo que ocurre cuando la
    // pasarela reenvía tras un tiempo de espera agotado.
    const primero = await entregar('fuerza', sobre('invoice.payment_succeeded', cuerpoFactura, idDeEvento('evt_a')));
    const segundo = await entregar('fuerza', sobre('invoice.payment_succeeded', cuerpoFactura, idDeEvento('evt_b')));
    if (primero.kind !== 'ACCEPTED' || segundo.kind !== 'ACCEPTED') throw new Error('no se aceptaron');

    await processWebhookEvent(primero.eventRowId, 'prueba');
    const repetido = await processWebhookEvent(segundo.eventRowId, 'prueba');

    expect(repetido.kind).toBe('ALREADY_DONE');
    expect(await base.prisma.payment.count({ where: { idempotencyKey: `stripe:invoice:${facturaId}` } })).toBe(1);
  });
});

describe('evento fuera de orden', () => {
  it('un evento cuya referencia todavía no existe queda sin conciliar, no falla', async () => {
    // La pasarela no garantiza el orden. Tratar esto como fallo llenaría la
    // bitácora de alarmas por algo que se arregla solo al llegar el otro evento.
    const recibido = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', {
        id: 'sub_que_todavia_no_existe',
        status: 'active',
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_000_000,
      }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');

    const resultado = await processWebhookEvent(recibido.eventRowId, 'prueba');
    expect(resultado.kind).toBe('UNRECONCILED');

    const fila = await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: recibido.eventRowId },
      select: { processingStatus: true, attempts: true, payload: true },
    });
    expect(fila.processingStatus).toBe('UNRECONCILED');
    expect(fila.attempts).toBe(1);
    // Lo que llegó sigue guardado íntegro: es lo que permite reintentarlo.
    expect(fila.payload).not.toBeNull();
  });

  it('y se procesa bien cuando el evento que faltaba llega y se reintenta', async () => {
    const intencion = await intencionAbierta('FUERA_DE_ORDEN', 'RECURRING');
    const subId = `sub_orden_${Date.now().toString(36)}`;

    // Primero llega el cambio de estado, que no puede resolverse todavía.
    const temprano = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', {
        id: subId,
        status: 'active',
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_000_000,
      }),
    );
    if (temprano.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    expect((await processWebhookEvent(temprano.eventRowId, 'prueba')).kind).toBe('UNRECONCILED');

    // Después llega el que ata la suscripción a su concepto.
    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_orden',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    // Y el reintento del primero ahora sí resuelve.
    const reintento = await processWebhookEvent(temprano.eventRowId, 'prueba');
    expect(reintento.kind).toBe('PROCESSED');

    const suscripcion = await base.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
      select: { status: true, currentPeriodEnd: true },
    });
    expect(suscripcion.status).toBe('ACTIVE');
    expect(suscripcion.currentPeriodEnd.getTime()).toBe(1_802_000_000 * 1000);
  });

  it('un evento viejo no revierte un estado más avanzado', async () => {
    const intencion = await intencionAbierta('ESTADO_AVANZADO', 'ONE_TIME');

    await base.prisma.payment.update({
      where: { id: intencion.id },
      data: { status: 'REFUNDED', stripePaymentIntentId: 'pi_ya_devuelto' },
    });

    const tardio = await entregar('fuerza', sobre('payment_intent.succeeded', { id: 'pi_ya_devuelto' }));
    if (tardio.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(tardio.eventRowId, 'prueba');

    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: intencion.id },
      select: { status: true },
    });
    // Un reenvío tardío no borra una devolución ya asentada.
    expect(pago.status).toBe('REFUNDED');
  });
});

describe('estados del cobro', () => {
  it('un cobro fallido queda como fallido, con su código', async () => {
    const intencion = await intencionAbierta('COBRO_FALLIDO', 'ONE_TIME');
    await base.prisma.payment.update({
      where: { id: intencion.id },
      data: { stripePaymentIntentId: 'pi_fallido' },
    });

    const recibido = await entregar(
      'fuerza',
      sobre('payment_intent.payment_failed', {
        id: 'pi_fallido',
        last_payment_error: { code: 'card_declined' },
      }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(recibido.eventRowId, 'prueba');

    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: intencion.id },
      select: { status: true, failureCode: true, paidAt: true },
    });
    expect(pago.status).toBe('FAILED');
    expect(pago.failureCode).toBe('card_declined');
    expect(pago.paidAt).toBeNull();
  });

  it('una devolución parcial se distingue de una total', async () => {
    const intencion = await intencionAbierta('DEVOLUCION_PARCIAL', 'ONE_TIME');
    await base.prisma.payment.update({
      where: { id: intencion.id },
      data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_devuelto_a_medias', paidAt: new Date() },
    });

    const recibido = await entregar(
      'fuerza',
      sobre('charge.refunded', { payment_intent: 'pi_devuelto_a_medias', amount_refunded: 50_00 }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(recibido.eventRowId, 'prueba');

    expect(
      (await base.prisma.payment.findUniqueOrThrow({ where: { id: intencion.id }, select: { status: true } })).status,
    ).toBe('PARTIALLY_REFUNDED');
  });

  it('una disputa deja el cobro en aclaración y en la bitácora', async () => {
    const intencion = await intencionAbierta('DISPUTA', 'ONE_TIME');
    await base.prisma.payment.update({
      where: { id: intencion.id },
      data: { status: 'SUCCEEDED', stripePaymentIntentId: 'pi_disputado', paidAt: new Date() },
    });

    const recibido = await entregar(
      'fuerza',
      sobre('charge.dispute.created', { payment_intent: 'pi_disputado', reason: 'fraudulent' }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(recibido.eventRowId, 'prueba');

    expect(
      (await base.prisma.payment.findUniqueOrThrow({ where: { id: intencion.id }, select: { status: true } })).status,
    ).toBe('DISPUTED');
    expect(
      await base.prisma.auditEvent.count({ where: { action: 'billing.payment.disputed', objectId: intencion.id } }),
    ).toBe(1);
  });
});

describe('periodo de gracia', () => {
  it('un cobro fallido abre la gracia que el concepto tenga configurada', async () => {
    const intencion = await intencionAbierta('CON_GRACIA', 'RECURRING', 15);
    const subId = `sub_gracia_${Date.now().toString(36)}`;

    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_gracia',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    const fallo = await entregar('fuerza', sobre('invoice.payment_failed', { id: 'in_fallida', subscription: subId }));
    if (fallo.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(fallo.eventRowId, 'prueba');

    const suscripcion = await base.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
      select: { status: true, gracePeriodEndsAt: true },
    });
    expect(suscripcion.status).toBe('GRACE_PERIOD');
    expect(suscripcion.gracePeriodEndsAt).not.toBeNull();

    const dias = Math.round(
      ((suscripcion.gracePeriodEndsAt?.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000),
    );
    expect(dias).toBe(15);
  });

  it('sin gracia configurada, el derecho se pierde en cuanto el cargo falla', async () => {
    const intencion = await intencionAbierta('SIN_GRACIA', 'RECURRING', 0);
    const subId = `sub_sin_gracia_${Date.now().toString(36)}`;

    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_sin_gracia',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    const fallo = await entregar(
      'fuerza',
      sobre('invoice.payment_failed', { id: 'in_sin_gracia', subscription: subId }),
    );
    if (fallo.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(fallo.eventRowId, 'prueba');

    const suscripcion = await base.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
      select: { status: true, gracePeriodEndsAt: true },
    });
    expect(suscripcion.status).toBe('PAST_DUE');
    expect(suscripcion.gracePeriodEndsAt).toBeNull();
  });

  it('cobrar la renovación cierra la gracia', async () => {
    const intencion = await intencionAbierta('GRACIA_CERRADA', 'RECURRING', 10);
    const subId = `sub_cerrada_${Date.now().toString(36)}`;

    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_cerrada',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    const fallo = await entregar(
      'fuerza',
      sobre('invoice.payment_failed', { id: 'in_previa', subscription: subId }),
    );
    if (fallo.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(fallo.eventRowId, 'prueba');

    const cobro = await entregar(
      'fuerza',
      sobre('invoice.payment_succeeded', {
        id: `in_cobrada_${Date.now().toString(36)}`,
        subscription: subId,
        amount_paid: 150_00,
        currency: 'mxn',
      }),
    );
    if (cobro.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(cobro.eventRowId, 'prueba');

    const suscripcion = await base.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
      select: { gracePeriodEndsAt: true },
    });
    expect(suscripcion.gracePeriodEndsAt).toBeNull();
  });
});

describe('lo que no se sabe manejar se ignora, no se pierde', () => {
  it('un tipo de evento sin manejador queda archivado como ignorado', async () => {
    const recibido = await entregar('fuerza', sobre('radar.early_fraud_warning.created', { id: 'issfr_algo' }));
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');

    const resultado = await processWebhookEvent(recibido.eventRowId, 'prueba');
    expect(resultado.kind).toBe('IGNORED');

    const fila = await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: recibido.eventRowId },
      select: { processingStatus: true, payload: true, processedAt: true },
    });
    expect(fila.processingStatus).toBe('IGNORED');
    expect(fila.processedAt).not.toBeNull();
    // Se guarda igual: mañana puede hacer falta y hoy no cuesta nada.
    expect(fila.payload).not.toBeNull();
  });
});

describe('lo que queda sin conciliar se reintenta y, si no cede, se avisa', () => {
  it('el reintento resuelve el evento adelantado en cuanto llega el que faltaba', async () => {
    const intencion = await intencionAbierta('RECONCILIA_SOLO', 'RECURRING');
    const subId = `sub_reconcilia_${Date.now().toString(36)}`;

    const temprano = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', {
        id: subId,
        status: 'active',
        current_period_start: 1_800_000_000,
        current_period_end: 1_802_000_000,
      }),
    );
    if (temprano.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(temprano.eventRowId, 'prueba');

    const sesion = await entregar(
      'fuerza',
      sobre('checkout.session.completed', {
        id: intencion.stripeCheckoutSessionId,
        payment_status: 'unpaid',
        customer: 'cus_reconcilia',
        subscription: subId,
        metadata: { paymentId: intencion.id },
      }),
    );
    if (sesion.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(sesion.eventRowId, 'prueba');

    // El evento se envejece para que le toque turno: la tarea no reintenta lo
    // que acaba de llegar, porque casi siempre sigue igual de temprano.
    await base.sql.query('UPDATE "stripe_webhook_event" SET "receivedAt" = $1 WHERE "id" = $2', [
      new Date(Date.now() - RETRY_AFTER_MS - 60_000),
      temprano.eventRowId,
    ]);

    const resumen = await retryUnreconciledWebhooks('prueba');
    expect(resumen.resolved).toBeGreaterThanOrEqual(1);

    expect(
      (
        await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
          where: { id: temprano.eventRowId },
          select: { processingStatus: true },
        })
      ).processingStatus,
    ).toBe('PROCESSED');
  });

  it('no reintenta lo que acaba de llegar', async () => {
    const recibido = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', { id: 'sub_recien_llegado', status: 'active' }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(recibido.eventRowId, 'prueba');

    const antes = (
      await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: recibido.eventRowId },
        select: { attempts: true },
      })
    ).attempts;

    await retryUnreconciledWebhooks('prueba');

    const despues = (
      await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: recibido.eventRowId },
        select: { attempts: true },
      })
    ).attempts;
    expect(despues).toBe(antes);
  });

  it('avisa una sola vez de lo que lleva demasiado sin conciliar', async () => {
    const recibido = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', { id: 'sub_que_nunca_llega', status: 'active' }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');
    await processWebhookEvent(recibido.eventRowId, 'prueba');

    await base.sql.query('UPDATE "stripe_webhook_event" SET "receivedAt" = $1 WHERE "id" = $2', [
      new Date(Date.now() - ALERT_AFTER_MS - 60_000),
      recibido.eventRowId,
    ]);

    const primera = await retryUnreconciledWebhooks('prueba');
    expect(primera.alerted).toBeGreaterThanOrEqual(1);

    const fila = await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: recibido.eventRowId },
      select: { alertedAt: true },
    });
    expect(fila.alertedAt).not.toBeNull();

    // Un problema que dura una semana no puede generar un aviso cada hora
    // hasta que alguien deje de leerlos.
    const segunda = await retryUnreconciledWebhooks('prueba');
    expect(segunda.alerted).toBe(0);
  });

  it('deja de reintentar tras agotar los intentos, y lo cuenta como pendiente de intervención', async () => {
    const recibido = await entregar(
      'fuerza',
      sobre('customer.subscription.updated', { id: 'sub_agotado', status: 'active' }),
    );
    if (recibido.kind !== 'ACCEPTED') throw new Error('no se aceptó');

    await base.sql.query(
      'UPDATE "stripe_webhook_event" SET "attempts" = $1, "processingStatus" = $2, "receivedAt" = $3 WHERE "id" = $4',
      [MAX_ATTEMPTS, 'UNRECONCILED', new Date(Date.now() - RETRY_AFTER_MS - 60_000), recibido.eventRowId],
    );

    const resumen = await retryUnreconciledWebhooks('prueba');
    expect(resumen.exhausted).toBeGreaterThanOrEqual(1);

    // No se tocó: seguir reintentando escondería el problema detrás de un
    // registro que se repite.
    expect(
      (
        await base.prisma.stripeWebhookEvent.findUniqueOrThrow({
          where: { id: recibido.eventRowId },
          select: { attempts: true },
        })
      ).attempts,
    ).toBe(MAX_ATTEMPTS);
  });
});
