import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveManualPayment,
  approveRefund,
  closeReconciliation,
  createPrice,
  createProduct,
  ledgerEntries,
  postAdjustment,
  processWebhookEvent,
  receiveWebhook,
  reconciliationList,
  registerManualPayment,
  requestRefund,
  reverseEntry,
  runReconciliation,
  startCheckout,
} from '@/modules/billing';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { signStripePayload } from '@/platform/payments/signature';
import { newPublicId } from '@/platform/kernel/ids';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';

/**
 * Libro auxiliar y conciliación (PRD §11.5, F3-LIB-001 y F3-LIB-002).
 *
 * Lo que se comprueba es lo que hace que un libro sirva de algo: que no se
 * pueda editar ni borrar —y eso se comprueba contra el motor, no contra el
 * código—, que una corrección sea un asiento nuevo que no se pueda duplicar, y
 * que un corte nombre lo que no cuadra en vez de redondearlo.
 */

let base: TestDatabase;
let finanzas: PersonaDePrueba;
let secretaria: PersonaDePrueba;
let agremiada: PersonaDePrueba;
let fuerzaId: string;

const SECRETO = 'whsec_de_prueba_para_el_libro_00000000';

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
function sobre(tipo: string, objeto: Record<string, unknown>) {
  contador += 1;
  return {
    id: `evt_libro_${Date.now().toString(36)}_${String(contador)}`,
    type: tipo,
    api_version: '2026-01-01',
    data: { object: objeto },
  };
}

async function entregarYProcesar(cuerpo: Record<string, unknown>): Promise<void> {
  const rawBody = JSON.stringify(cuerpo);
  const recibido = await receiveWebhook({
    slug: 'fuerza',
    rawBody,
    signatureHeader: signStripePayload({ rawBody, secret: SECRETO }),
    correlationId: 'prueba',
    ipHash: null,
  });
  if (recibido.kind !== 'ACCEPTED') throw new Error(`no se aceptó el evento: ${recibido.kind}`);
  await processWebhookEvent(recibido.eventRowId, 'prueba');
}

async function conceptoConPrecio(code: string, amountMinor: number, kind = 'UNION_DUE_ORDINARY'): Promise<string> {
  const actor = await contextoDe(base.prisma, finanzas);
  const creado = await createProduct(actor, {
    code,
    name: `Concepto ${code}`,
    description: 'Un concepto creado por las pruebas del libro auxiliar.',
    legalEntityId: fuerzaId,
    kind: kind as never,
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
  return creado.data.productId;
}

/** Un cobro confirmado por la pasarela, con su asiento ya puesto. */
async function cobroConfirmado(code: string, amountMinor: number): Promise<{ paymentId: string; publicId: string }> {
  const productId = await conceptoConPrecio(code, amountMinor);
  const iniciado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
  if (!iniciado.ok) throw new Error(iniciado.error.message);

  const pago = await base.prisma.payment.findFirstOrThrow({
    where: { publicId: iniciado.data.paymentPublicId },
    select: { id: true, stripeCheckoutSessionId: true, stripePaymentIntentId: true },
  });

  await entregarYProcesar(
    sobre('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: `cus_${code.toLowerCase()}`,
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    }),
  );

  return { paymentId: pago.id, publicId: iniciado.data.paymentPublicId };
}

async function conMotivo(persona: PersonaDePrueba, motivo: string) {
  return { ...(await contextoDe(base.prisma, persona)), reason: motivo };
}

beforeAll(async () => {
  base = await createTestDatabase('libro');
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

describe('el libro no se edita ni se borra, y lo impide el motor', () => {
  it('la aplicación no puede cambiar un asiento', async () => {
    await cobroConfirmado('INMUTABLE', 100_00);
    const asiento = await base.prisma.ledgerEntry.findFirstOrThrow({ select: { id: true } });

    await expect(
      base.prisma.ledgerEntry.update({ where: { id: asiento.id }, data: { amountMinor: 1n } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('la aplicación no puede borrar un asiento', async () => {
    const asiento = await base.prisma.ledgerEntry.findFirstOrThrow({ select: { id: true } });

    await expect(base.prisma.ledgerEntry.delete({ where: { id: asiento.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('todo lo que mueve dinero deja su asiento, y una sola vez', () => {
  it('un cobro confirmado por la pasarela entra al libro', async () => {
    const { paymentId } = await cobroConfirmado('COBRO_AL_LIBRO', 250_00);

    const asientos = await base.prisma.ledgerEntry.findMany({
      where: { sourceKind: 'PAYMENT', sourceId: paymentId },
      select: { direction: true, amountMinor: true, accountCode: true },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.direction).toBe('CREDIT');
    expect(asientos[0]?.amountMinor).toBe(25000n);
    expect(asientos[0]?.accountCode).toBe('INGRESO_CUOTAS');
  });

  it('reenviar el evento no lo asienta dos veces', async () => {
    const { paymentId } = await cobroConfirmado('SIN_DUPLICAR', 300_00);

    // Otro evento, mismo cobro: es lo que pasa cuando la pasarela manda
    // `checkout.session.completed` y `payment_intent.succeeded` por lo mismo.
    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { stripePaymentIntentId: true },
    });
    await entregarYProcesar(sobre('payment_intent.succeeded', { id: pago.stripePaymentIntentId }));

    expect(
      await base.prisma.ledgerEntry.count({ where: { sourceKind: 'PAYMENT', sourceId: paymentId } }),
    ).toBe(1);
  });

  it('un pago manual entra al libro al aprobarse, no al registrarse', async () => {
    const cuenta = await base.prisma.billingAccount.findFirstOrThrow({
      where: { personId: agremiada.personId, legalEntityId: fuerzaId },
      select: { id: true },
    });
    const autor = await actorDeMigracion(base.prisma);
    const evidencia = await base.prisma.fileObject.create({
      data: {
        publicId: newPublicId(22),
        legalEntityId: fuerzaId,
        classification: 'INTERNAL',
        contextKind: 'FINANCE',
        originalFileName: 'comprobante.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512n,
        createdByActorId: autor,
        updatedByActorId: autor,
      },
      select: { id: true },
    });

    const registrado = await registerManualPayment(await conMotivo(finanzas, 'transferencia recibida'), {
      billingAccountId: cuenta.id,
      amount: '400.00',
      currency: 'MXN',
      method: 'MANUAL_TRANSFER',
      evidenceFileId: evidencia.id,
      receivedAt: new Date(),
    });
    if (!registrado.ok) throw new Error(registrado.error.message);

    // Todavía no: hasta que otra persona lo apruebe, el dinero no cuenta.
    expect(
      await base.prisma.ledgerEntry.count({ where: { sourceId: registrado.data.paymentId } }),
    ).toBe(0);

    await approveManualPayment(await conMotivo(secretaria, 'comprobado en el estado de cuenta'), {
      paymentId: registrado.data.paymentId,
    });

    expect(
      await base.prisma.ledgerEntry.count({ where: { sourceKind: 'PAYMENT', sourceId: registrado.data.paymentId } }),
    ).toBe(1);
  });

  it('una devolución ejecutada sale del libro', async () => {
    const { paymentId } = await cobroConfirmado('CON_DEVOLUCION', 500_00);

    const pedida = await requestRefund(await conMotivo(finanzas, 'cobro duplicado'), {
      paymentId,
      reason: 'Se le cobró dos veces la misma cuota por un error nuestro.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    await approveRefund(await conMotivo(secretaria, 'procede'), { refundId: pedida.data.refundId });

    const asiento = await base.prisma.ledgerEntry.findFirstOrThrow({
      where: { sourceKind: 'REFUND', sourceId: pedida.data.refundId },
      select: { direction: true, amountMinor: true, accountCode: true },
    });
    expect(asiento.direction).toBe('DEBIT');
    expect(asiento.amountMinor).toBe(50000n);
    expect(asiento.accountCode).toBe('EGRESO_DEVOLUCIONES');
  });
});

describe('una corrección es un asiento nuevo', () => {
  it('revertir deja los dos asientos y el original intacto', async () => {
    const { paymentId } = await cobroConfirmado('A_REVERTIR', 120_00);
    const original = await base.prisma.ledgerEntry.findFirstOrThrow({
      where: { sourceId: paymentId },
      select: { id: true, amountMinor: true, direction: true },
    });

    const revertido = await reverseEntry(await conMotivo(finanzas, 'asiento equivocado'), {
      entryId: original.id,
      reason: 'El asiento se puso con la cuenta equivocada y hay que corregirlo.',
    });
    if (!revertido.ok) throw new Error(revertido.error.message);

    const reversion = await base.prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: revertido.data.entryId },
      select: { direction: true, amountMinor: true, reversalOfEntryId: true, reason: true },
    });
    expect(reversion.direction).toBe('DEBIT');
    expect(reversion.amountMinor).toBe(original.amountMinor);
    expect(reversion.reversalOfEntryId).toBe(original.id);
    expect(reversion.reason).toContain('cuenta equivocada');

    // El original sigue ahí, sin tocar: el libro enseña el error y su
    // corrección, no un libro limpio que no explica nada.
    const sigueIgual = await base.prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: original.id },
      select: { amountMinor: true, direction: true },
    });
    expect(sigueIgual.amountMinor).toBe(original.amountMinor);
    expect(sigueIgual.direction).toBe(original.direction);
  });

  it('un asiento no se puede revertir dos veces', async () => {
    const { paymentId } = await cobroConfirmado('DOBLE_REVERSION', 90_00);
    const original = await base.prisma.ledgerEntry.findFirstOrThrow({
      where: { sourceId: paymentId },
      select: { id: true },
    });

    const primera = await reverseEntry(await conMotivo(finanzas, 'corrección'), {
      entryId: original.id,
      reason: 'La primera corrección de este asiento, que sí procede.',
    });
    expect(primera.ok).toBe(true);

    const segunda = await reverseEntry(await conMotivo(finanzas, 'otra vez'), {
      entryId: original.id,
      reason: 'Un segundo intento de revertir lo mismo, que duplicaría la corrección.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('un ajuste exige motivo escrito', async () => {
    const sinMotivo = await postAdjustment(await conMotivo(finanzas, 'ajuste'), {
      legalEntityId: fuerzaId,
      entryDate: new Date(),
      direction: 'DEBIT',
      accountCode: 'AJUSTE',
      amount: '10.00',
      currency: 'MXN',
      description: 'Un ajuste cualquiera',
      reason: 'corto',
    });
    expect(sinMotivo.ok).toBe(false);

    const conMotivoLargo = await postAdjustment(await conMotivo(finanzas, 'ajuste'), {
      legalEntityId: fuerzaId,
      entryDate: new Date(),
      direction: 'DEBIT',
      accountCode: 'AJUSTE',
      amount: '10.00',
      currency: 'MXN',
      description: 'Ajuste por comisión no registrada',
      reason: 'La pasarela cobró una comisión que no quedó asentada en su momento.',
    });
    expect(conMotivoLargo.ok).toBe(true);
  });

  it('sin la facultad de ajustar no se asienta nada', async () => {
    const resultado = await postAdjustment(await conMotivo(agremiada, 'quiero ajustar'), {
      legalEntityId: fuerzaId,
      entryDate: new Date(),
      direction: 'CREDIT',
      accountCode: 'AJUSTE',
      amount: '1000.00',
      currency: 'MXN',
      description: 'Un ajuste que nadie debería poder hacer',
      reason: 'Sin ninguna facultad para asentar nada en el libro auxiliar.',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});

describe('los totales del libro suman todo el periodo, no la página', () => {
  it('el neto es lo que entró menos lo que salió', async () => {
    const leido = await ledgerEntries(await contextoDe(base.prisma, finanzas), {});
    if (!leido.ok) throw new Error(leido.error.message);

    const { creditMinor, debitMinor, netMinor } = leido.data.totals;
    expect(netMinor).toBe(creditMinor - debitMinor);
    expect(creditMinor).toBeGreaterThan(0n);
  });

  it('quien no tiene la facultad de leerlo no lo lee', async () => {
    const leido = await ledgerEntries(await contextoDe(base.prisma, agremiada), {});
    expect(leido.ok).toBe(false);
    if (!leido.ok) expect(leido.error.code).toBe('FORBIDDEN');
  });
});

describe('un corte nombra lo que no cuadra', () => {
  it('cuadra cuando el libro y la pasarela dicen lo mismo', async () => {
    // Base limpia para este corte: se concilia un periodo propio.
    const corte = await runReconciliation(await conMotivo(finanzas, 'corte del periodo'), {
      legalEntityId: fuerzaId,
      periodStart: '2030-01-01',
      periodEnd: '2030-01-31',
    });
    if (!corte.ok) throw new Error(corte.error.message);

    expect(corte.data.status).toBe('BALANCED');
    expect(corte.data.differenceMinor).toBe(0n);
  });

  it('nombra el cobro que la pasarela confirmó y el libro no tiene', async () => {
    // Un cobro confirmado a mano en la base, sin pasar por el manejador que
    // asienta: es exactamente el descuadre que un corte tiene que encontrar.
    const cuenta = await base.prisma.billingAccount.findFirstOrThrow({
      where: { personId: agremiada.personId, legalEntityId: fuerzaId },
      select: { id: true },
    });
    const pagado = new Date('2031-03-15T12:00:00.000Z');
    const huerfano = await base.prisma.payment.create({
      data: {
        publicId: newPublicId(20),
        billingAccountId: cuenta.id,
        legalEntityId: fuerzaId,
        stripeAccountKey: 'FUERZA',
        amountMinor: 777_00n,
        currency: 'MXN',
        status: 'SUCCEEDED',
        method: 'STRIPE_CHECKOUT',
        paidAt: pagado,
        idempotencyKey: `huerfano:${newPublicId(20)}`,
        createdByActorId: await actorDeMigracion(base.prisma),
      },
      select: { publicId: true },
    });

    const corte = await runReconciliation(await conMotivo(finanzas, 'corte de marzo'), {
      legalEntityId: fuerzaId,
      periodStart: '2031-03-01',
      periodEnd: '2031-03-31',
    });
    if (!corte.ok) throw new Error(corte.error.message);

    expect(corte.data.status).toBe('WITH_DIFFERENCES');
    expect(corte.data.differenceMinor).toBe(77700n);

    const listado = await reconciliationList(await contextoDe(base.prisma, finanzas));
    if (!listado.ok) throw new Error(listado.error.message);
    const encontrado = listado.data.find((fila) => fila.id === corte.data.reconciliationId);

    const excepcion = encontrado?.exceptions.find((e) => e.kind === 'UNMATCHED_IN_LEDGER');
    expect(excepcion?.reference).toBe(huerfano.publicId);
    expect(excepcion?.amountMinor).toBe(77700n);
  });

  it('correrlo dos veces sobre el mismo periodo no crea dos cortes', async () => {
    const primera = await runReconciliation(await conMotivo(finanzas, 'primera corrida'), {
      legalEntityId: fuerzaId,
      periodStart: '2032-05-01',
      periodEnd: '2032-05-31',
    });
    const segunda = await runReconciliation(await conMotivo(finanzas, 'segunda corrida'), {
      legalEntityId: fuerzaId,
      periodStart: '2032-05-01',
      periodEnd: '2032-05-31',
    });
    if (!primera.ok || !segunda.ok) throw new Error('no se pudo conciliar');

    expect(segunda.data.reconciliationId).toBe(primera.data.reconciliationId);
    expect(
      await base.prisma.reconciliation.count({ where: { periodStart: { gte: new Date('2032-05-01T00:00:00Z') } } }),
    ).toBe(1);
  });

  it('cerrar con diferencias exige decir qué se encontró', async () => {
    const corte = await runReconciliation(await conMotivo(finanzas, 'corte con diferencias'), {
      legalEntityId: fuerzaId,
      periodStart: '2031-03-01',
      periodEnd: '2031-03-31',
    });
    if (!corte.ok) throw new Error(corte.error.message);

    const sinNota = await closeReconciliation(await conMotivo(finanzas, 'cierro sin explicar'), {
      reconciliationId: corte.data.reconciliationId,
    });
    expect(sinNota.ok).toBe(false);

    const conNota = await closeReconciliation(await conMotivo(finanzas, 'cierro explicando'), {
      reconciliationId: corte.data.reconciliationId,
      note: 'El cobro sin asiento se debió a un evento que no llegó; se asienta en el periodo siguiente.',
    });
    expect(conNota.ok).toBe(true);

    expect(
      (
        await base.prisma.reconciliation.findUniqueOrThrow({
          where: { id: corte.data.reconciliationId },
          select: { status: true, closedById: true },
        })
      ).status,
    ).toBe('CLOSED');
  });

  it('un periodo cerrado no se vuelve a correr', async () => {
    const otra = await runReconciliation(await conMotivo(finanzas, 'otra vez'), {
      legalEntityId: fuerzaId,
      periodStart: '2031-03-01',
      periodEnd: '2031-03-31',
    });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });

  it('un asiento de un corte cerrado no se revierte dentro de ese corte', async () => {
    const asiento = await base.prisma.ledgerEntry.findFirst({
      where: { reconciliation: { status: 'CLOSED' } },
      select: { id: true },
    });

    if (asiento !== null) {
      const revertido = await reverseEntry(await conMotivo(finanzas, 'corregir un periodo cerrado'), {
        entryId: asiento.id,
        reason: 'Intento de corregir dentro de un corte que ya está cerrado y firmado.',
      });
      expect(revertido.ok).toBe(false);
      if (!revertido.ok) expect(revertido.error.code).toBe('RULE_VIOLATION');
    }
  });

  it('sin la facultad de cerrar cortes no se concilia', async () => {
    const resultado = await runReconciliation(await conMotivo(agremiada, 'quiero conciliar'), {
      legalEntityId: fuerzaId,
      periodStart: '2033-01-01',
      periodEnd: '2033-01-31',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});
