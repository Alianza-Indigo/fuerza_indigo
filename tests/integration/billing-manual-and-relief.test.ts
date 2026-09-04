import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveManualPayment,
  approveRefund,
  approveScholarship,
  createPrice,
  createProduct,
  discountList,
  grantDiscount,
  pendingManualPayments,
  priceFor,
  registerManualPayment,
  rejectManualPayment,
  rejectRefund,
  requestRefund,
  revokeDiscount,
  revokeScholarship,
  scholarshipList,
  startCheckout,
} from '@/modules/billing';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
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
 * Pagos manuales, devoluciones, descuentos y becas (PRD §11.3, F3-PAG-006,
 * F3-PAG-009 y F3-PAG-010).
 *
 * Lo que se comprueba es el doble control —quien registra no aprueba, quien
 * pide no aprueba— y que un descuento o una beca cambien de verdad lo que se
 * cobra. Un descuento que existe en una tabla y no rebaja nada no es un
 * descuento: es una promesa.
 */

let base: TestDatabase;
let finanzas: PersonaDePrueba;
let otraDeFinanzas: PersonaDePrueba;
let secretaria: PersonaDePrueba;
let agremiada: PersonaDePrueba;
let fuerzaId: string;
let alianzaId: string;

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

/** Un comprobante subido en la entidad indicada. */
async function comprobante(legalEntityId: string): Promise<string> {
  const autor = await actorDeMigracion(base.prisma);
  const archivo = await base.prisma.fileObject.create({
    data: {
      publicId: newPublicId(22),
      legalEntityId,
      classification: 'INTERNAL',
      contextKind: 'FINANCE',
      originalFileName: 'comprobante.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024n,
      createdByActorId: autor,
      updatedByActorId: autor,
    },
    select: { id: true },
  });
  return archivo.id;
}

async function cuentaDeCobroDe(persona: PersonaDePrueba, legalEntityId: string): Promise<string> {
  const existente = await base.prisma.billingAccount.findFirst({
    where: { personId: persona.personId, legalEntityId },
    select: { id: true },
  });
  if (existente !== null) return existente.id;

  const creada = await base.prisma.billingAccount.create({
    data: {
      holderKind: 'PERSON',
      personId: persona.personId,
      legalEntityId,
      billingEmail: 'cobro@ejemplo.invalid',
    },
    select: { id: true },
  });
  return creada.id;
}

async function conceptoConPrecio(code: string, amountMinor: number, kind = 'COURSE'): Promise<string> {
  const actor = await contextoDe(base.prisma, finanzas);
  const creado = await createProduct(actor, {
    code,
    name: `Concepto ${code}`,
    description: 'Un concepto creado por las pruebas de descuentos y becas.',
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

beforeAll(async () => {
  base = await createTestDatabase('manuales');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  otraDeFinanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra', familyName: 'De Finanzas' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Una', familyName: 'Agremiada' });

  for (const [persona, roleCode] of [
    [finanzas, 'FINANCE'],
    [otraDeFinanzas, 'FINANCE'],
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
});

afterEach(() => {
  setStripeForTests(null);
});

afterAll(async () => {
  await base.destroy();
});

/** Contexto con motivo escrito, que los permisos críticos exigen. */
async function conMotivo(persona: PersonaDePrueba, motivo: string) {
  return { ...(await contextoDe(base.prisma, persona)), reason: motivo };
}

describe('un pago manual lo registra alguien y lo aprueba otra persona', () => {
  it('nace pendiente: hasta que se aprueba, el dinero no cuenta', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);

    const registrado = await registerManualPayment(await conMotivo(finanzas, 'transferencia recibida'), {
      billingAccountId: cuenta,
      amount: '500.00',
      currency: 'MXN',
      method: 'MANUAL_TRANSFER',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });
    if (!registrado.ok) throw new Error(registrado.error.message);

    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: registrado.data.paymentId },
      select: { status: true, paidAt: true, amountMinor: true, manualEvidenceFileId: true },
    });
    expect(pago.status).toBe('PENDING');
    expect(pago.paidAt).toBeNull();
    expect(pago.amountMinor).toBe(50000n);
    expect(pago.manualEvidenceFileId).not.toBeNull();
  });

  it('quien lo registró no puede aprobarlo, aunque tuviera el permiso', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(secretaria, 'lo registro yo'), {
      billingAccountId: cuenta,
      amount: '100.00',
      currency: 'MXN',
      method: 'MANUAL_CASH',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });

    // La Secretaría Ejecutiva no tiene `register_manual`, así que ni siquiera
    // llega a registrarlo: la separación empieza en el catálogo de permisos.
    expect(registrado.ok).toBe(false);
    if (!registrado.ok) expect(registrado.error.code).toBe('FORBIDDEN');
  });

  it('y si alguien acumulara los dos permisos, tampoco', async () => {
    // Se le da a una misma persona los dos papeles, que es el escenario en el
    // que un doble control por permisos dejaría de proteger.
    const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Otro', familyName: 'Nombrador' });
    const ambivalente = await crearPersonaConCuenta(base.prisma, { givenName: 'Con', familyName: 'Dos Papeles' });
    await nombrar(base.prisma, {
      userId: ambivalente.userId,
      roleCode: 'FINANCE',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
    await nombrar(base.prisma, {
      userId: ambivalente.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });

    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(ambivalente, 'registro con los dos papeles'), {
      billingAccountId: cuenta,
      amount: '250.00',
      currency: 'MXN',
      method: 'MANUAL_TRANSFER',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });
    if (!registrado.ok) throw new Error(registrado.error.message);

    const aprobado = await approveManualPayment(await conMotivo(ambivalente, 'y lo apruebo yo'), {
      paymentId: registrado.data.paymentId,
    });

    // Esto es todo el doble control: sin esta comprobación, tener los dos
    // permisos bastaría para declarar pagado lo que nadie pagó.
    expect(aprobado.ok).toBe(false);
    if (!aprobado.ok) expect(aprobado.error.code).toBe('RULE_VIOLATION');
  });

  it('otra persona sí lo aprueba, y entonces cuenta', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(finanzas, 'transferencia del día'), {
      billingAccountId: cuenta,
      amount: '750.50',
      currency: 'MXN',
      method: 'MANUAL_TRANSFER',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });
    if (!registrado.ok) throw new Error(registrado.error.message);

    const aprobado = await approveManualPayment(await conMotivo(secretaria, 'comprobante verificado'), {
      paymentId: registrado.data.paymentId,
    });
    expect(aprobado.ok).toBe(true);

    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: registrado.data.paymentId },
      select: { status: true, paidAt: true, manualApprovedById: true },
    });
    expect(pago.status).toBe('SUCCEEDED');
    expect(pago.paidAt).not.toBeNull();
    expect(pago.manualApprovedById).toBe(secretaria.userId);
  });

  it('rechazarlo lo cancela y deja el motivo, no lo borra', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(finanzas, 'transferencia dudosa'), {
      billingAccountId: cuenta,
      amount: '300.00',
      currency: 'MXN',
      method: 'MANUAL_CASH',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });
    if (!registrado.ok) throw new Error(registrado.error.message);

    const rechazado = await rejectManualPayment(await conMotivo(secretaria, 'no aparece en el estado de cuenta'), {
      paymentId: registrado.data.paymentId,
      reason: 'El comprobante no corresponde a ningún movimiento del estado de cuenta.',
    });
    expect(rechazado.ok).toBe(true);

    const pago = await base.prisma.payment.findUniqueOrThrow({
      where: { id: registrado.data.paymentId },
      select: { status: true },
    });
    expect(pago.status).toBe('CANCELLED');

    expect(
      await base.prisma.auditEvent.count({
        where: { action: 'billing.payment.manual_rejected', objectId: registrado.data.paymentId },
      }),
    ).toBe(1);
  });

  it('sin comprobante no se registra', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(finanzas, 'sin respaldo'), {
      billingAccountId: cuenta,
      amount: '100.00',
      currency: 'MXN',
      method: 'MANUAL_CASH',
      evidenceFileId: '',
      receivedAt: new Date(),
    });
    expect(registrado.ok).toBe(false);
  });

  it('un comprobante de la otra entidad no vale', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const registrado = await registerManualPayment(await conMotivo(finanzas, 'comprobante cruzado'), {
      billingAccountId: cuenta,
      amount: '100.00',
      currency: 'MXN',
      method: 'MANUAL_CASH',
      evidenceFileId: await comprobante(alianzaId),
      receivedAt: new Date(),
    });
    expect(registrado.ok).toBe(false);
    if (!registrado.ok) expect(registrado.error.code).toBe('RULE_VIOLATION');
  });

  it('la bandeja dice qué pagos registró quien mira, para no ofrecerle aprobarlos', async () => {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    await registerManualPayment(await conMotivo(finanzas, 'para la bandeja'), {
      billingAccountId: cuenta,
      amount: '111.00',
      currency: 'MXN',
      method: 'MANUAL_TRANSFER',
      evidenceFileId: await comprobante(fuerzaId),
      receivedAt: new Date(),
    });

    const propia = await pendingManualPayments(await contextoDe(base.prisma, finanzas));
    const ajena = await pendingManualPayments(await contextoDe(base.prisma, otraDeFinanzas));
    if (!propia.ok || !ajena.ok) throw new Error('no se pudo leer la bandeja');

    const mio = propia.data.find((fila) => fila.amountMinor === 11100n);
    const suyo = ajena.data.find((fila) => fila.amountMinor === 11100n);
    expect(mio?.registeredByMe).toBe(true);
    expect(suyo?.registeredByMe).toBe(false);
  });
});

describe('una devolución la pide alguien y la aprueba otra persona', () => {
  async function cobroPagado(importe: number): Promise<string> {
    const cuenta = await cuentaDeCobroDe(agremiada, fuerzaId);
    const pago = await base.prisma.payment.create({
      data: {
        publicId: newPublicId(20),
        billingAccountId: cuenta,
        legalEntityId: fuerzaId,
        stripeAccountKey: 'FUERZA',
        stripePaymentIntentId: `pi_devolver_${newPublicId(10)}`,
        amountMinor: BigInt(importe),
        currency: 'MXN',
        status: 'SUCCEEDED',
        method: 'STRIPE_CHECKOUT',
        paidAt: new Date(),
        idempotencyKey: `prueba:${newPublicId(20)}`,
        createdByActorId: await actorDeMigracion(base.prisma),
      },
      select: { id: true },
    });
    return pago.id;
  }

  it('quien la pide no puede aprobarla', async () => {
    const paymentId = await cobroPagado(100_00);
    const pedida = await requestRefund(await conMotivo(finanzas, 'cobro duplicado'), {
      paymentId,
      reason: 'Se le cobró dos veces la misma inscripción por un error nuestro.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    const aprobada = await approveRefund(await conMotivo(finanzas, 'la apruebo yo'), {
      refundId: pedida.data.refundId,
    });
    expect(aprobada.ok).toBe(false);
    if (!aprobada.ok) expect(aprobada.error.code).toBe('FORBIDDEN');
  });

  it('otra cartera la aprueba y el dinero sale, con el cobro reflejando la devolución', async () => {
    const paymentId = await cobroPagado(200_00);
    const pedida = await requestRefund(await conMotivo(finanzas, 'cobro duplicado'), {
      paymentId,
      reason: 'Se le cobró dos veces la misma inscripción por un error nuestro.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    const aprobada = await approveRefund(await conMotivo(secretaria, 'procede la devolución'), {
      refundId: pedida.data.refundId,
    });
    expect(aprobada.ok).toBe(true);

    const devolucion = await base.prisma.refund.findUniqueOrThrow({
      where: { id: pedida.data.refundId },
      select: { status: true, stripeRefundId: true, processedAt: true, approvedById: true },
    });
    expect(devolucion.status).toBe('SUCCEEDED');
    expect(devolucion.stripeRefundId).not.toBeNull();
    expect(devolucion.approvedById).toBe(secretaria.userId);

    expect(
      (await base.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { status: true } })).status,
    ).toBe('REFUNDED');
  });

  it('una devolución parcial deja el cobro parcialmente devuelto', async () => {
    const paymentId = await cobroPagado(400_00);
    const pedida = await requestRefund(await conMotivo(finanzas, 'devolución parcial'), {
      paymentId,
      amount: '100.00',
      reason: 'Se le cobró de más por un cambio de tarifa que ya estaba acordado.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    await approveRefund(await conMotivo(secretaria, 'procede'), { refundId: pedida.data.refundId });

    expect(
      (await base.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { status: true } })).status,
    ).toBe('PARTIALLY_REFUNDED');
  });

  it('no se puede devolver más de lo cobrado, ni sumando varias', async () => {
    const paymentId = await cobroPagado(100_00);

    const primera = await requestRefund(await conMotivo(finanzas, 'primera'), {
      paymentId,
      amount: '80.00',
      reason: 'Devolución parcial acordada con la persona por el cambio de tarifa.',
    });
    expect(primera.ok).toBe(true);

    // Ochenta más treinta pasan de cien: devolver de más es dinero que sale y
    // que nadie ingresó.
    const segunda = await requestRefund(await conMotivo(finanzas, 'segunda'), {
      paymentId,
      amount: '30.00',
      reason: 'Otra devolución parcial sobre el mismo cobro, que ya no cabe.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('RULE_VIOLATION');
  });

  it('rechazarla deja el motivo y no toca el cobro', async () => {
    const paymentId = await cobroPagado(150_00);
    const pedida = await requestRefund(await conMotivo(finanzas, 'a revisar'), {
      paymentId,
      reason: 'La persona dice que no reconoce el cargo, pero el servicio sí se prestó.',
    });
    if (!pedida.ok) throw new Error(pedida.error.message);

    const rechazada = await rejectRefund(await conMotivo(secretaria, 'el servicio se prestó'), {
      refundId: pedida.data.refundId,
      reason: 'El servicio se prestó y hay constancia de asistencia.',
    });
    expect(rechazada.ok).toBe(true);

    expect(
      (await base.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { status: true } })).status,
    ).toBe('SUCCEEDED');
  });
});

describe('un descuento cambia de verdad lo que se cobra', () => {
  it('un porcentaje rebaja el importe de la sesión de cobro', async () => {
    const productId = await conceptoConPrecio('CON_DESCUENTO', 1_000_00);

    const otorgado = await grantDiscount(await conMotivo(secretaria, 'convenio con la universidad'), {
      name: 'Convenio universitario',
      legalEntityId: fuerzaId,
      kind: 'PERCENTAGE',
      value: '20',
      productIds: [productId],
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!otorgado.ok) throw new Error(otorgado.error.message);

    const iniciado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    if (!iniciado.ok) throw new Error(iniciado.error.message);

    const pago = await base.prisma.payment.findFirstOrThrow({
      where: { publicId: iniciado.data.paymentPublicId },
      select: { amountMinor: true, discountGrantId: true },
    });
    expect(pago.amountMinor).toBe(80000n);
    expect(pago.discountGrantId).toBe(otorgado.data.discountGrantId);
  });

  it('un descuento agotado deja de aplicarse', async () => {
    const productId = await conceptoConPrecio('CUPON_AGOTADO', 500_00);

    const otorgado = await grantDiscount(await conMotivo(secretaria, 'cupón limitado'), {
      name: 'Cupón de estreno',
      code: `ESTRENO_${Date.now().toString(36).toUpperCase()}`,
      legalEntityId: fuerzaId,
      kind: 'PERCENTAGE',
      value: '50',
      productIds: [productId],
      maxRedemptions: 1,
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!otorgado.ok) throw new Error(otorgado.error.message);

    const primera = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    if (!primera.ok) throw new Error(primera.error.message);
    expect(
      (await base.prisma.payment.findFirstOrThrow({
        where: { publicId: primera.data.paymentPublicId },
        select: { amountMinor: true },
      })).amountMinor,
    ).toBe(25000n);

    // Otra persona lo intenta: el cupón ya se gastó.
    const otra = await crearPersonaConCuenta(base.prisma, { givenName: 'Llega', familyName: 'Tarde' });
    const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'N', familyName: 'N' });
    await nombrar(base.prisma, {
      userId: otra.userId,
      roleCode: 'UNION_MEMBER',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });

    const segunda = await startCheckout(await contextoDe(base.prisma, otra), { productId });
    if (!segunda.ok) throw new Error(segunda.error.message);
    expect(
      (await base.prisma.payment.findFirstOrThrow({
        where: { publicId: segunda.data.paymentPublicId },
        select: { amountMinor: true, discountGrantId: true },
      })).amountMinor,
    ).toBe(50000n);
  });

  it('un descuento retirado deja de aplicarse, y no desaparece', async () => {
    const productId = await conceptoConPrecio('DESCUENTO_RETIRADO', 200_00);

    const otorgado = await grantDiscount(await conMotivo(secretaria, 'promoción'), {
      name: 'Promoción de temporada',
      legalEntityId: fuerzaId,
      kind: 'FIXED_AMOUNT',
      value: '50.00',
      productIds: [productId],
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!otorgado.ok) throw new Error(otorgado.error.message);

    await revokeDiscount(await conMotivo(secretaria, 'terminó la temporada'), {
      discountGrantId: otorgado.data.discountGrantId,
      reason: 'Terminó la temporada de la promoción.',
    });

    const efectivo = await priceFor({
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      productId,
      productKind: 'COURSE',
      baseMinor: 20000n,
    });
    expect(efectivo.finalMinor).toBe(20000n);

    // No se borró: los cobros que ya lo usaron apuntan a él.
    const listado = await discountList(await contextoDe(base.prisma, finanzas));
    if (!listado.ok) throw new Error(listado.error.message);
    const retirado = listado.data.find((fila) => fila.id === otorgado.data.discountGrantId);
    expect(retirado?.revokedAt).not.toBeNull();
    expect(retirado?.vigente).toBe(false);
  });

  it('un descuento fijo mayor que el precio deja el cobro en cero, no en negativo', async () => {
    const productId = await conceptoConPrecio('DESCUENTO_ENORME', 100_00);

    await grantDiscount(await conMotivo(secretaria, 'apoyo puntual'), {
      name: 'Apoyo puntual',
      legalEntityId: fuerzaId,
      kind: 'FIXED_AMOUNT',
      value: '500.00',
      productIds: [productId],
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });

    const efectivo = await priceFor({
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      productId,
      productKind: 'COURSE',
      baseMinor: 10000n,
    });
    expect(efectivo.finalMinor).toBe(0n);
  });
});

describe('una beca gana al descuento y no se acumulan', () => {
  it('la beca decide, aunque haya un descuento mejor o peor', async () => {
    const productId = await conceptoConPrecio('CON_BECA', 1_000_00);

    await grantDiscount(await conMotivo(secretaria, 'promoción'), {
      name: 'Promoción del diez',
      legalEntityId: fuerzaId,
      kind: 'PERCENTAGE',
      value: '10',
      productIds: [productId],
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });

    const beca = await approveScholarship(await conMotivo(secretaria, 'situación económica acreditada'), {
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      programKind: 'COURSE',
      coveragePercent: 60,
      justification:
        'La persona acreditó su situación económica con los documentos que constan en el expediente de la beca.',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!beca.ok) throw new Error(beca.error.message);

    const efectivo = await priceFor({
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      productId,
      productKind: 'COURSE',
      baseMinor: 100000n,
    });

    // Sesenta por ciento de beca, no setenta por acumular el diez del descuento.
    expect(efectivo.finalMinor).toBe(40000n);
    expect(efectivo.scholarshipId).toBe(beca.data.scholarshipId);
    expect(efectivo.discountGrantId).toBeNull();
  });

  it('una exención total no manda a nadie a pagar cero: asienta el cobro como exento', async () => {
    const productId = await conceptoConPrecio('EXENCION_TOTAL', 800_00, 'CIAN_SERVICE');

    const beca = await approveScholarship(await conMotivo(secretaria, 'exención total acreditada'), {
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      programKind: 'CIAN_SERVICE',
      coveragePercent: 100,
      justification:
        'La persona no tiene ingresos y el servicio es indispensable para su atención, según consta en su expediente.',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!beca.ok) throw new Error(beca.error.message);

    const iniciado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    if (!iniciado.ok) throw new Error(iniciado.error.message);

    const pago = await base.prisma.payment.findFirstOrThrow({
      where: { publicId: iniciado.data.paymentPublicId },
      select: { amountMinor: true, status: true, method: true, scholarshipId: true, stripeCheckoutSessionId: true },
    });
    expect(pago.amountMinor).toBe(0n);
    expect(pago.status).toBe('SUCCEEDED');
    expect(pago.method).toBe('EXEMPTION');
    expect(pago.scholarshipId).toBe(beca.data.scholarshipId);
    // No pasó por ninguna pasarela.
    expect(pago.stripeCheckoutSessionId).toBeNull();
  });

  it('una beca de un programa no rebaja el de otro', async () => {
    const membresia = await conceptoConPrecio('CUOTA_CON_BECA_DE_CURSO', 300_00, 'UNION_DUE_ORDINARY');

    await approveScholarship(await conMotivo(secretaria, 'beca de curso'), {
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      programKind: 'TOOL_ACCESS',
      coveragePercent: 100,
      justification: 'Beca de acceso a herramientas, otorgada por la situación acreditada en su expediente.',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });

    const efectivo = await priceFor({
      personId: agremiada.personId,
      legalEntityId: fuerzaId,
      productId: membresia,
      productKind: 'UNION_DUE_ORDINARY',
      baseMinor: 30000n,
    });
    expect(efectivo.scholarshipId).toBeNull();
    expect(efectivo.finalMinor).toBe(30000n);
  });

  it('dos becas vivas del mismo programa no se pueden otorgar', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Con', familyName: 'Una Beca' });

    const primera = await approveScholarship(await conMotivo(secretaria, 'primera beca'), {
      personId: persona.personId,
      legalEntityId: fuerzaId,
      programKind: 'MEMBERSHIP',
      coveragePercent: 50,
      justification: 'Situación económica acreditada con los documentos que constan en su expediente.',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(primera.ok).toBe(true);

    const segunda = await approveScholarship(await conMotivo(secretaria, 'segunda beca'), {
      personId: persona.personId,
      legalEntityId: fuerzaId,
      programKind: 'MEMBERSHIP',
      coveragePercent: 80,
      justification: 'Otra beca del mismo programa, que se pisaría con la anterior sin que nadie sepa cuál rige.',
      validFrom: new Date('2020-06-01T00:00:00.000Z'),
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('la justificación no va a la bitácora, porque dice quién no puede pagar', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Con', familyName: 'Justificación' });
    const justificacion = 'Esta frase concreta no debe aparecer nunca en la bitácora general del sistema.';

    const beca = await approveScholarship(await conMotivo(secretaria, 'beca con justificación'), {
      personId: persona.personId,
      legalEntityId: fuerzaId,
      programKind: 'COURSE',
      coveragePercent: 40,
      justification: justificacion,
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!beca.ok) throw new Error(beca.error.message);

    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'billing.scholarship.approved', objectId: beca.data.scholarshipId },
      select: { metadata: true },
    });
    expect(JSON.stringify(asiento.metadata)).not.toContain('no debe aparecer nunca');

    // Sí está donde le corresponde, bajo un permiso sensible.
    const listado = await scholarshipList(await contextoDe(base.prisma, secretaria));
    if (!listado.ok) throw new Error(listado.error.message);
    expect(listado.data.find((fila) => fila.id === beca.data.scholarshipId)?.justification).toBe(justificacion);
  });

  it('quien no tiene el permiso sensible no ve ninguna beca', async () => {
    const listado = await scholarshipList(await contextoDe(base.prisma, agremiada));
    expect(listado.ok).toBe(false);
    if (!listado.ok) expect(listado.error.code).toBe('FORBIDDEN');
  });

  it('retirar una beca la deja fuera del cálculo', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Beca', familyName: 'Retirada' });
    const productId = await conceptoConPrecio('BECA_RETIRADA', 100_00);

    const beca = await approveScholarship(await conMotivo(secretaria, 'beca temporal'), {
      personId: persona.personId,
      legalEntityId: fuerzaId,
      programKind: 'COURSE',
      coveragePercent: 100,
      justification: 'Beca temporal mientras se resolvía su situación, según consta en su expediente.',
      validFrom: new Date('2020-01-01T00:00:00.000Z'),
    });
    if (!beca.ok) throw new Error(beca.error.message);

    await revokeScholarship(await conMotivo(secretaria, 'cambió su situación'), {
      scholarshipId: beca.data.scholarshipId,
      reason: 'La persona informó que su situación cambió y pidió dejar de recibirla.',
    });

    const efectivo = await priceFor({
      personId: persona.personId,
      legalEntityId: fuerzaId,
      productId,
      productKind: 'COURSE',
      baseMinor: 10000n,
    });
    expect(efectivo.finalMinor).toBe(10000n);
    expect(efectivo.scholarshipId).toBeNull();
  });
});
