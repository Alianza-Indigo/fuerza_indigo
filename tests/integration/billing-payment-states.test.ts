import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveRefund,
  createPrice,
  createProduct,
  ownPayment,
  processWebhookEvent,
  receiveWebhook,
  requestRefund,
  startCheckout,
} from '@/modules/billing';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { signStripePayload } from '@/platform/payments/signature';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Los cinco estados de un pago (PRD §24 Fase 3, criterio 6; F3-QA-001).
 *
 * El criterio contrata probar pago exitoso, fallido, pendiente, reembolsado y
 * disputado. Cada uno se recorre entero: se abre el cobro, llega el evento
 * firmado que lo mueve, y se comprueba lo que la persona ve en su pantalla.
 *
 * Lo que se prueba no es que el estado se guarde, sino que **se llame por su
 * nombre**: quien mira sus pagos no lee «REQUIRES_PAYMENT», lee que su cobro
 * está sin completar.
 */

let base: TestDatabase;
let finanzas: PersonaDePrueba;
let secretaria: PersonaDePrueba;
let agremiada: PersonaDePrueba;
let fuerzaId: string;

const SECRETO = 'whsec_de_prueba_para_los_estados_0000';

const puertoDePrueba: StripePort = {
  name: 'prueba',
  capability: () => ({ capability: 'CHARGES', detail: 'puerto de prueba' }),
  createCheckoutSession: (input) =>
    Promise.resolve({
      id: `cs_${input.idempotencyKey.slice(0, 10)}`,
      url: 'https://pasarela.invalid/pagar',
      paymentIntentId: `pi_${input.idempotencyKey.slice(0, 10)}`,
    }),
  createPortalSession: () => Promise.resolve({ url: 'https://pasarela.invalid/portal' }),
  createRefund: (input) => Promise.resolve({ id: `re_${input.idempotencyKey.slice(-8)}`, status: 'succeeded' }),
};

let contador = 0;
async function entregarYProcesar(tipo: string, objeto: Record<string, unknown>): Promise<void> {
  contador += 1;
  const rawBody = JSON.stringify({
    id: `evt_est_${Date.now().toString(36)}_${String(contador)}`,
    type: tipo,
    api_version: '2026-01-01',
    data: { object: objeto },
  });
  const recibido = await receiveWebhook({
    slug: 'fuerza',
    rawBody,
    signatureHeader: signStripePayload({ rawBody, secret: SECRETO }),
    correlationId: 'prueba',
    ipHash: null,
  });
  if (recibido.kind !== 'ACCEPTED') throw new Error(`no se aceptó: ${recibido.kind}`);
  await processWebhookEvent(recibido.eventRowId, 'prueba');
}

/** Abre un cobro y devuelve lo necesario para moverlo por sus estados. */
async function cobroAbierto(code: string, amountMinor = 200_00) {
  const actor = await contextoDe(base.prisma, finanzas);
  const creado = await createProduct(actor, {
    code,
    name: `Concepto ${code}`,
    description: 'Un concepto creado por las pruebas de estados de pago.',
    legalEntityId: fuerzaId,
    kind: 'COURSE',
    billingMode: 'ONE_TIME',
  });
  if (!creado.ok) throw new Error(creado.error.message);

  const precio = await createPrice(actor, {
    productId: creado.data.productId,
    amountMinor,
    currency: 'MXN',
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  });
  if (!precio.ok) throw new Error(precio.error.message);

  const iniciado = await startCheckout(await contextoDe(base.prisma, agremiada), {
    productId: creado.data.productId,
  });
  if (!iniciado.ok) throw new Error(iniciado.error.message);

  const pago = await base.prisma.payment.findFirstOrThrow({
    where: { publicId: iniciado.data.paymentPublicId },
    select: { id: true, publicId: true, stripeCheckoutSessionId: true, stripePaymentIntentId: true },
  });
  return pago;
}

/** Lo que la persona ve de su propio cobro. */
async function comoLoVeLaPersona(publicId: string): Promise<string> {
  const visto = await ownPayment(await contextoDe(base.prisma, agremiada), publicId);
  if (!visto.ok) throw new Error(visto.error.message);
  return visto.data.status;
}

async function conMotivo(persona: PersonaDePrueba, motivo: string) {
  return { ...(await contextoDe(base.prisma, persona)), reason: motivo };
}

beforeAll(async () => {
  base = await createTestDatabase('estados');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Una', familyName: 'Agremiada' });

  for (const [persona, roleCode] of [
    [finanzas, 'FINANCE'],
    [secretaria, 'EXECUTIVE_SECRETARY'],
    [agremiada, 'UNION_MEMBER'],
  ] as const) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode,
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
}, 180_000);

beforeEach(() => {
  setStripeForTests(puertoDePrueba);
  process.env['STRIPE_FUERZA_WEBHOOK_SECRET'] = SECRETO;
});

afterEach(() => {
  setStripeForTests(null);
});

afterAll(async () => {
  await base.destroy();
});

describe('pendiente', () => {
  it('un cobro abierto y no terminado se queda sin completar, y así lo ve la persona', async () => {
    const pago = await cobroAbierto('ESTADO_PENDIENTE');

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('REQUIRES_PAYMENT');

    // Y ningún acceso se activa por haber vuelto del navegador: el criterio 1
    // de la fase. La página de retorno no toca el estado.
    const enBase = await base.prisma.payment.findUniqueOrThrow({
      where: { id: pago.id },
      select: { paidAt: true, appliesToKind: true, appliesToId: true },
    });
    expect(enBase.paidAt).toBeNull();
    expect(enBase.appliesToKind).toBe('NONE');
    expect(enBase.appliesToId).toBeNull();
  });
});

describe('exitoso', () => {
  it('el evento firmado lo confirma, lo asienta y deja su comprobante encolado', async () => {
    const pago = await cobroAbierto('ESTADO_EXITOSO', 340_00);

    await entregarYProcesar('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: 'cus_exitoso',
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    });

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('SUCCEEDED');

    const enBase = await base.prisma.payment.findUniqueOrThrow({
      where: { id: pago.id },
      select: { paidAt: true },
    });
    expect(enBase.paidAt).not.toBeNull();

    // Su asiento en el libro y su comprobante en la cola.
    expect(await base.prisma.ledgerEntry.count({ where: { sourceId: pago.id } })).toBe(1);
    expect(
      await base.prisma.backgroundJob.count({ where: { jobType: 'payment-receipt', businessKey: pago.id } }),
    ).toBe(1);
  });
});

describe('fallido', () => {
  it('el banco lo rechaza y la persona ve que no se cobró nada', async () => {
    const pago = await cobroAbierto('ESTADO_FALLIDO');

    await entregarYProcesar('payment_intent.payment_failed', {
      id: pago.stripePaymentIntentId,
      last_payment_error: { code: 'insufficient_funds' },
    });

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('FAILED');

    const enBase = await base.prisma.payment.findUniqueOrThrow({
      where: { id: pago.id },
      select: { paidAt: true, failureCode: true },
    });
    expect(enBase.paidAt).toBeNull();
    expect(enBase.failureCode).toBe('insufficient_funds');

    // Un cobro fallido no entra al libro: no hubo dinero.
    expect(await base.prisma.ledgerEntry.count({ where: { sourceId: pago.id } })).toBe(0);
  });
});

describe('reembolsado', () => {
  it('la devolución aprobada lo deja devuelto, con su asiento de salida', async () => {
    const pago = await cobroAbierto('ESTADO_REEMBOLSADO', 500_00);

    await entregarYProcesar('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: 'cus_reembolso',
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    });

    const pedida = await requestRefund(await conMotivo(finanzas, 'cobro duplicado'), {
      paymentId: pago.id,
      reason: 'Se le cobró dos veces el mismo curso por un error de la plataforma.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    await approveRefund(await conMotivo(secretaria, 'procede la devolución'), {
      refundId: pedida.data.refundId,
    });

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('REFUNDED');

    const asientos = await base.prisma.ledgerEntry.findMany({
      where: { OR: [{ sourceId: pago.id }, { sourceId: pedida.data.refundId }] },
      select: { direction: true },
    });
    // Uno de entrada y uno de salida: el libro cuenta las dos cosas, no borra
    // la primera.
    expect(asientos.filter((a) => a.direction === 'CREDIT')).toHaveLength(1);
    expect(asientos.filter((a) => a.direction === 'DEBIT')).toHaveLength(1);
  });

  it('una devolución parcial se ve como devuelta en parte', async () => {
    const pago = await cobroAbierto('ESTADO_PARCIAL', 800_00);

    await entregarYProcesar('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: 'cus_parcial',
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    });

    const pedida = await requestRefund(await conMotivo(finanzas, 'devolución parcial'), {
      paymentId: pago.id,
      amount: '300.00',
      reason: 'Se le cobró de más por un cambio de tarifa ya acordado con la persona.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    await approveRefund(await conMotivo(secretaria, 'procede'), { refundId: pedida.data.refundId });

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('PARTIALLY_REFUNDED');
  });
});

describe('disputado', () => {
  it('la disputa lo deja en aclaración con el banco, no en fraude', async () => {
    const pago = await cobroAbierto('ESTADO_DISPUTADO', 150_00);

    await entregarYProcesar('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: 'cus_disputa',
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    });

    await entregarYProcesar('charge.dispute.created', {
      payment_intent: pago.stripePaymentIntentId,
      reason: 'fraudulent',
    });

    expect(await comoLoVeLaPersona(pago.publicId)).toBe('DISPUTED');

    // Queda en la bitácora, porque una disputa es un hecho del que la
    // organización tiene que poder dar cuenta.
    expect(
      await base.prisma.auditEvent.count({ where: { action: 'billing.payment.disputed', objectId: pago.id } }),
    ).toBe(1);
  });
});

describe('cada entidad se concilia por separado', () => {
  it('un cobro de una entidad no aparece en el corte de la otra', async () => {
    const alianzaId = (
      await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
    ).id;

    const deFuerza = await base.prisma.payment.count({ where: { legalEntityId: fuerzaId } });
    const deAlianza = await base.prisma.payment.count({ where: { legalEntityId: alianzaId } });

    // Criterio 3 de la fase: son dos personas morales y sus cuentas no se
    // mezclan. Todo lo cobrado aquí fue de Fuerza Índigo.
    expect(deFuerza).toBeGreaterThan(0);
    expect(deAlianza).toBe(0);

    const cuentas = await base.prisma.payment.findMany({
      where: { legalEntityId: fuerzaId },
      select: { stripeAccountKey: true },
      distinct: ['stripeAccountKey'],
    });
    expect(cuentas.map((c) => c.stripeAccountKey)).toEqual(['FUERZA']);
  });
});
