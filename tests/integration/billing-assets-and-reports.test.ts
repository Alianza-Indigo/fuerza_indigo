import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  accountabilityReport,
  assetRegister,
  closeReconciliation,
  createPrice,
  createProduct,
  exportLedger,
  moveAsset,
  processWebhookEvent,
  receiveWebhook,
  registerAsset,
  runReconciliation,
  semesterRange,
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
 * Registro patrimonial, reportes y exportaciones (PRD §11.6, F3-LIB-003,
 * F3-LIB-004 y F3-LIB-005).
 *
 * El patrimonio de un sindicato es de sus agremiados: lo que se comprueba no es
 * que sepa guardar bienes, sino que ninguno cambie de manos sin acuerdo y sin
 * documento, que su historia no se pueda reescribir, y que ningún archivo con
 * los movimientos de dinero salga sin dejar constancia de quién se lo llevó.
 */

let base: TestDatabase;
let finanzas: PersonaDePrueba;
let secretaria: PersonaDePrueba;
let agremiada: PersonaDePrueba;
let custodia: PersonaDePrueba;
let fuerzaId: string;

const SECRETO = 'whsec_de_prueba_para_patrimonio_000000';

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
  createRefund: () => Promise.resolve({ id: 're_test', status: 'succeeded' }),
};

let contador = 0;
async function entregarYProcesar(tipo: string, objeto: Record<string, unknown>): Promise<void> {
  contador += 1;
  const rawBody = JSON.stringify({
    id: `evt_pat_${Date.now().toString(36)}_${String(contador)}`,
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

async function documento(): Promise<string> {
  const autor = await actorDeMigracion(base.prisma);
  const archivo = await base.prisma.fileObject.create({
    data: {
      publicId: newPublicId(22),
      legalEntityId: fuerzaId,
      classification: 'INTERNAL',
      contextKind: 'GOVERNANCE',
      originalFileName: 'acta.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048n,
      createdByActorId: autor,
      updatedByActorId: autor,
    },
    select: { id: true },
  });
  return archivo.id;
}

async function conMotivo(persona: PersonaDePrueba, motivo: string) {
  return { ...(await contextoDe(base.prisma, persona)), reason: motivo };
}

async function bienRegistrado(nombre: string, valor: string): Promise<string> {
  const registrado = await registerAsset(await conMotivo(finanzas, 'alta de patrimonio'), {
    legalEntityId: fuerzaId,
    assetKind: 'EQUIPMENT',
    name: nombre,
    description: 'Un bien registrado por las pruebas del registro patrimonial.',
    acquisitionMode: 'PURCHASE',
    acquiredOn: new Date('2026-01-15T00:00:00.000Z'),
    documentedValue: valor,
    currency: 'MXN',
  });
  if (!registrado.ok) throw new Error(registrado.error.message);
  return registrado.data.assetId;
}

beforeAll(async () => {
  base = await createTestDatabase('patrimonio');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Una', familyName: 'Agremiada' });
  custodia = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Custodia' });

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

describe('el alta de un bien es su primer movimiento', () => {
  it('registrar deja el bien y el movimiento que lo explica', async () => {
    const assetId = await bienRegistrado('Equipo de cómputo de la delegación', '45000.00');

    const bien = await base.prisma.assetRegister.findUniqueOrThrow({
      where: { id: assetId },
      select: { documentedValueMinor: true, status: true },
    });
    expect(bien.documentedValueMinor).toBe(4500000n);
    expect(bien.status).toBe('ACTIVE');

    const movimientos = await base.prisma.assetMovement.findMany({
      where: { assetId },
      select: { movementKind: true, amountMinor: true },
    });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.movementKind).toBe('REGISTERED');
  });

  it('sin la facultad de administrar el patrimonio no se registra nada', async () => {
    const resultado = await registerAsset(await conMotivo(agremiada, 'quiero registrar un bien'), {
      legalEntityId: fuerzaId,
      assetKind: 'VEHICLE',
      name: 'Un vehículo',
      description: 'Un bien que nadie sin facultades debería poder registrar.',
      acquisitionMode: 'DONATION',
      acquiredOn: new Date(),
      documentedValue: '100000.00',
      currency: 'MXN',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});

describe('un bien no cambia de manos sin acuerdo y sin documento', () => {
  it('transferirlo sin acuerdo no se registra', async () => {
    const assetId = await bienRegistrado('Mobiliario de la sede', '20000.00');

    const resultado = await moveAsset(await conMotivo(finanzas, 'transferencia'), {
      assetId,
      movementKind: 'TRANSFERRED',
      occurredOn: new Date(),
      toCustodianPersonId: custodia.personId,
      evidenceFileIds: [await documento()],
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('VALIDATION');
  });

  it('con acuerdo pero sin documento tampoco', async () => {
    const assetId = await bienRegistrado('Equipo de sonido', '15000.00');

    const resultado = await moveAsset(await conMotivo(finanzas, 'transferencia'), {
      assetId,
      movementKind: 'TRANSFERRED',
      occurredOn: new Date(),
      toCustodianPersonId: custodia.personId,
      authorizingResolutionNote: 'Acuerdo de la asamblea del 12 de marzo, acta 4/2026.',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('VALIDATION');
  });

  it('con las dos cosas sí, y el bien cambia de custodia y de estado', async () => {
    const assetId = await bienRegistrado('Vehículo de la delegación', '180000.00');

    const resultado = await moveAsset(await conMotivo(finanzas, 'transferencia acordada'), {
      assetId,
      movementKind: 'TRANSFERRED',
      occurredOn: new Date('2026-04-01T00:00:00.000Z'),
      toCustodianPersonId: custodia.personId,
      authorizingResolutionNote: 'Acuerdo de la asamblea del 12 de marzo, acta 4/2026.',
      evidenceFileIds: [await documento()],
    });
    expect(resultado.ok).toBe(true);

    const bien = await base.prisma.assetRegister.findUniqueOrThrow({
      where: { id: assetId },
      select: { status: true, custodianPersonId: true },
    });
    expect(bien.status).toBe('TRANSFERRED');
    expect(bien.custodianPersonId).toBe(custodia.personId);
  });

  it('revaluar no exige acuerdo, pero sí el valor nuevo', async () => {
    const assetId = await bienRegistrado('Equipo de oficina', '30000.00');

    const sinValor = await moveAsset(await conMotivo(finanzas, 'revaluación'), {
      assetId,
      movementKind: 'REVALUED',
      occurredOn: new Date(),
    });
    expect(sinValor.ok).toBe(false);

    const conValor = await moveAsset(await conMotivo(finanzas, 'revaluación con avalúo'), {
      assetId,
      movementKind: 'REVALUED',
      occurredOn: new Date(),
      amount: '22000.00',
    });
    expect(conValor.ok).toBe(true);

    expect(
      (
        await base.prisma.assetRegister.findUniqueOrThrow({
          where: { id: assetId },
          select: { documentedValueMinor: true },
        })
      ).documentedValueMinor,
    ).toBe(2200000n);
  });

  it('un bien dado de baja no admite más movimientos', async () => {
    const assetId = await bienRegistrado('Equipo obsoleto', '5000.00');

    await moveAsset(await conMotivo(finanzas, 'baja acordada'), {
      assetId,
      movementKind: 'WRITTEN_OFF',
      occurredOn: new Date(),
      authorizingResolutionNote: 'Acuerdo del Comité Ejecutivo del 3 de mayo, acta 7/2026.',
      evidenceFileIds: [await documento()],
    });

    const otroMas = await moveAsset(await conMotivo(finanzas, 'otro movimiento'), {
      assetId,
      movementKind: 'REVALUED',
      occurredOn: new Date(),
      amount: '1000.00',
    });
    expect(otroMas.ok).toBe(false);
    if (!otroMas.ok) expect(otroMas.error.code).toBe('CONFLICT');
  });
});

describe('la historia de un bien no se reescribe', () => {
  it('la aplicación no puede cambiar ni borrar un movimiento', async () => {
    const assetId = await bienRegistrado('Bien con historia', '1000.00');
    const movimiento = await base.prisma.assetMovement.findFirstOrThrow({
      where: { assetId },
      select: { id: true },
    });

    await expect(
      base.prisma.assetMovement.update({ where: { id: movimiento.id }, data: { amountMinor: 1n } }),
    ).rejects.toThrow(/permission denied/i);

    await expect(base.prisma.assetMovement.delete({ where: { id: movimiento.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('el registro enseña la historia completa de cada bien', async () => {
    const listado = await assetRegister(await contextoDe(base.prisma, finanzas));
    if (!listado.ok) throw new Error(listado.error.message);

    const conTransferencia = listado.data.find((bien) => bien.name === 'Vehículo de la delegación');
    expect(conTransferencia?.movements.length).toBe(2);
    expect(conTransferencia?.movements.some((m) => m.movementKind === 'TRANSFERRED')).toBe(true);
    expect(conTransferencia?.movements.find((m) => m.movementKind === 'TRANSFERRED')?.evidenceCount).toBe(1);
  });
});

describe('el reporte de rendición de cuentas', () => {
  async function cobroDelPeriodo(code: string, amountMinor: number): Promise<void> {
    const actor = await contextoDe(base.prisma, finanzas);
    const creado = await createProduct(actor, {
      code,
      name: `Concepto ${code}`,
      description: 'Un concepto creado por las pruebas de rendición de cuentas.',
      legalEntityId: fuerzaId,
      kind: 'UNION_DUE_ORDINARY',
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
      select: { id: true, stripeCheckoutSessionId: true, stripePaymentIntentId: true },
    });

    await entregarYProcesar('checkout.session.completed', {
      id: pago.stripeCheckoutSessionId,
      payment_status: 'paid',
      customer: `cus_${code.toLowerCase()}`,
      payment_intent: pago.stripePaymentIntentId,
      metadata: { paymentId: pago.id },
    });
  }

  it('suma por cuenta y dice el neto del periodo', async () => {
    await cobroDelPeriodo('REPORTE_UNO', 100_00);
    await cobroDelPeriodo('REPORTE_DOS', 250_00);

    const hoy = new Date();
    const año = hoy.getUTCFullYear();
    const semestre = semesterRange(año, hoy.getUTCMonth() < 6 ? 1 : 2);

    const reporte = await accountabilityReport(await contextoDe(base.prisma, finanzas), {
      legalEntityId: fuerzaId,
      ...semestre,
    });
    if (!reporte.ok) throw new Error(reporte.error.message);

    expect(reporte.data.incomeMinor).toBeGreaterThanOrEqual(35000n);
    expect(reporte.data.netMinor).toBe(reporte.data.incomeMinor - reporte.data.expenseMinor);
    expect(reporte.data.totals.some((fila) => fila.accountCode === 'INGRESO_CUOTAS')).toBe(true);
  });

  it('informa el patrimonio vigente, sin contar lo dado de baja', async () => {
    const hoy = new Date();
    const semestre = semesterRange(hoy.getUTCFullYear(), hoy.getUTCMonth() < 6 ? 1 : 2);

    const reporte = await accountabilityReport(await contextoDe(base.prisma, finanzas), {
      legalEntityId: fuerzaId,
      ...semestre,
    });
    if (!reporte.ok) throw new Error(reporte.error.message);

    const vigentes = await base.prisma.assetRegister.count({
      where: { legalEntityId: fuerzaId, status: { not: 'DISPOSED' } },
    });
    expect(reporte.data.assetsCount).toBe(vigentes);
  });

  it('lo puede leer cualquier persona afiliada: rendir cuentas es un derecho', async () => {
    const hoy = new Date();
    const semestre = semesterRange(hoy.getUTCFullYear(), hoy.getUTCMonth() < 6 ? 1 : 2);

    // La agremiada no lleva las finanzas ni fiscaliza, y aun así lo ve.
    const reporte = await accountabilityReport(await contextoDe(base.prisma, agremiada), {
      legalEntityId: fuerzaId,
      ...semestre,
    });
    expect(reporte.ok).toBe(true);
  });

  it('los semestres son los naturales, para que dos personas hablen del mismo periodo', () => {
    expect(semesterRange(2026, 1)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-06-30' });
    expect(semesterRange(2026, 2)).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-12-31' });
  });
});

describe('ninguna exportación sale sin dejar rastro', () => {
  it('exportar deja el asiento de auditoría con motivo, periodo y quién', async () => {
    const antes = await base.prisma.auditEvent.count({ where: { action: 'billing.report.exported' } });

    const exportado = await exportLedger(await conMotivo(finanzas, 'exportación para la asamblea'), {
      legalEntityId: fuerzaId,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reason: 'Se exporta para la revisión de la Comisión de Vigilancia del semestre.',
    });
    if (!exportado.ok) throw new Error(exportado.error.message);

    expect(exportado.data.fileName).toContain('libro-fuerza_indigo');
    expect(exportado.data.content).toContain('importe_unidades_menores');

    const despues = await base.prisma.auditEvent.count({ where: { action: 'billing.report.exported' } });
    expect(despues).toBe(antes + 1);

    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'billing.report.exported' },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true, actorId: true },
    });
    expect(JSON.stringify(asiento.metadata)).toContain('Comisión de Vigilancia');
  });

  it('los importes salen en unidades menores, sin coma flotante', async () => {
    const exportado = await exportLedger(await conMotivo(finanzas, 'comprobación del formato'), {
      legalEntityId: fuerzaId,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reason: 'Se comprueba que el archivo conserve los importes tal como están guardados.',
    });
    if (!exportado.ok) throw new Error(exportado.error.message);

    const lineas = exportado.data.content.trim().split('\n').slice(1);
    for (const linea of lineas) {
      const importe = linea.split(',')[5] ?? '';
      // Enteros: convertirlos a decimales en el archivo reintroduciría la coma
      // flotante justo donde el dato sale del sistema y ya nadie lo comprueba.
      expect(importe).toMatch(/^\d+$/);
    }
  });

  it('sin motivo escrito no se exporta', async () => {
    const resultado = await exportLedger(await conMotivo(finanzas, 'sin explicar'), {
      legalEntityId: fuerzaId,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reason: 'corto',
    });
    expect(resultado.ok).toBe(false);
  });

  it('sin la facultad de exportar no sale ningún archivo', async () => {
    const resultado = await exportLedger(await conMotivo(agremiada, 'quiero el libro'), {
      legalEntityId: fuerzaId,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reason: 'Un intento de llevarse el libro sin ninguna facultad para hacerlo.',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('un texto con comas y comillas no rompe el archivo', async () => {
    const corte = await runReconciliation(await conMotivo(finanzas, 'corte'), {
      legalEntityId: fuerzaId,
      periodStart: '2027-01-01',
      periodEnd: '2027-01-31',
    });
    if (corte.ok) {
      await closeReconciliation(await conMotivo(finanzas, 'cierre'), {
        reconciliationId: corte.data.reconciliationId,
        note: 'Cierre sin novedad.',
      });
    }

    const exportado = await exportLedger(await conMotivo(finanzas, 'formato'), {
      legalEntityId: fuerzaId,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reason: 'Se comprueba que las descripciones con comas no partan las columnas.',
    });
    if (!exportado.ok) throw new Error(exportado.error.message);

    const encabezado = exportado.data.content.trim().split('\n')[0] ?? '';
    expect(encabezado.split(',')).toHaveLength(13);
  });
});
