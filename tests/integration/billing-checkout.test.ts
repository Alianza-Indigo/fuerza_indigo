import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKOUT_REUSE_MS,
  createPrice,
  createProduct,
  openBillingPortal,
  ownPayment,
  ownPayments,
  payableCatalog,
  startCheckout,
} from '@/modules/billing';
import { setStripeForTests, type StripePort } from '@/platform/payments/stripe-port';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Cobro alojado y portal de cliente (PRD §11.3, F3-PAG-003 y F3-PAG-004).
 *
 * Lo que se comprueba no es que sepa llamar a una pasarela, sino las promesas
 * del PRD: que pulsar dos veces no abra dos cobros, que volver del navegador no
 * dé nada por pagado, y que nadie vea el cobro de nadie más.
 *
 * El puerto se sustituye entero. No se simula la red: se sustituye la pieza que
 * habla con ella, que es justo para lo que existe el puerto.
 */

let base: TestDatabase;
let quienNombra: PersonaDePrueba;
let agremiada: PersonaDePrueba;
let otraAgremiada: PersonaDePrueba;
let protegida: PersonaDePrueba;
let finanzas: PersonaDePrueba;
let fuerzaId: string;

/** Lo que la pasarela recibió, para poder afirmar sobre ello. */
interface Llamada {
  readonly idempotencyKey: string;
  readonly mode: string;
  readonly amountMinor: bigint;
  readonly account: string;
}

let llamadas: Llamada[] = [];
let sesionesCreadas = 0;
let falla = false;

/**
 * Puerto de prueba con idempotencia de verdad.
 *
 * Devuelve la **misma** sesión ante la misma clave, que es exactamente lo que
 * hace Stripe. Si devolviera una distinta cada vez, la prueba de la doble
 * pulsación pasaría sin demostrar nada.
 */
const porIdempotencia = new Map<string, { id: string; url: string }>();

const puertoDePrueba: StripePort = {
  name: 'prueba',
  capability: () => ({ capability: 'CHARGES', detail: 'puerto de prueba' }),
  createCheckoutSession: (input) => {
    if (falla) throw new Error('la pasarela está caída');
    llamadas.push({
      idempotencyKey: input.idempotencyKey,
      mode: input.mode,
      amountMinor: input.lineItems[0]?.amountMinor ?? 0n,
      account: input.account,
    });
    const existente = porIdempotencia.get(input.idempotencyKey);
    if (existente !== undefined) return Promise.resolve({ ...existente, paymentIntentId: null });

    sesionesCreadas += 1;
    const sesion = { id: `cs_test_${String(sesionesCreadas)}`, url: `https://pasarela.invalid/${String(sesionesCreadas)}` };
    porIdempotencia.set(input.idempotencyKey, sesion);
    return Promise.resolve({ ...sesion, paymentIntentId: null });
  },
  createPortalSession: () => Promise.resolve({ url: 'https://pasarela.invalid/portal' }),
  createRefund: () => Promise.resolve({ id: 're_test', status: 'succeeded' }),
};

async function conceptoConPrecio(opciones: {
  code: string;
  billingMode: 'ONE_TIME' | 'RECURRING';
  amountMinor: number;
  gracePeriodDays?: number;
}): Promise<string> {
  const actor = await contextoDe(base.prisma, finanzas);
  const creado = await createProduct(actor, {
    code: opciones.code,
    name: `Concepto ${opciones.code}`,
    description: 'Un concepto creado por las pruebas de cobro.',
    legalEntityId: fuerzaId,
    kind: opciones.billingMode === 'RECURRING' ? 'UNION_DUE_ORDINARY' : 'ENROLLMENT_FEE',
    billingMode: opciones.billingMode,
    ...(opciones.gracePeriodDays === undefined ? {} : { gracePeriodDays: opciones.gracePeriodDays }),
  });
  if (!creado.ok) throw new Error(creado.error.message);

  const precio = await createPrice(actor, {
    productId: creado.data.productId,
    amountMinor: opciones.amountMinor,
    currency: 'MXN',
    ...(opciones.billingMode === 'RECURRING' ? { interval: 'MONTH' as const } : {}),
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  });
  if (!precio.ok) throw new Error(precio.error.message);

  return creado.data.productId;
}

beforeAll(async () => {
  base = await createTestDatabase('cobro');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  agremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Una', familyName: 'Agremiada' });
  otraAgremiada = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra', familyName: 'Agremiada' });
  protegida = await crearPersonaConCuenta(base.prisma, { givenName: 'Persona', familyName: 'Protegida' });

  for (const [persona, roleCode] of [
    [finanzas, 'FINANCE'],
    [agremiada, 'UNION_MEMBER'],
    [otraAgremiada, 'UNION_MEMBER'],
    [protegida, 'PROTECTED_BENEFICIARY'],
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
  llamadas = [];
  falla = false;
});

afterEach(() => {
  setStripeForTests(null);
});

afterAll(async () => {
  await base.destroy();
});

describe('pulsar dos veces no abre dos cobros', () => {
  it('el segundo intento reutiliza la intención abierta con su misma clave', async () => {
    const productId = await conceptoConPrecio({ code: 'DOBLE_PULSACION', billingMode: 'ONE_TIME', amountMinor: 250_00 });
    const actor = await contextoDe(base.prisma, agremiada);

    const primero = await startCheckout(actor, { productId });
    const segundo = await startCheckout(actor, { productId });

    expect(primero.ok).toBe(true);
    expect(segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;

    // Mismo cobro, misma dirección: no hay dos deudas donde había una.
    expect(segundo.data.paymentPublicId).toBe(primero.data.paymentPublicId);
    expect(segundo.data.url).toBe(primero.data.url);
    expect(segundo.data.reused).toBe(true);

    // Y la pasarela recibió la misma clave las dos veces, que es lo que hace
    // que devuelva la sesión que ya existía en vez de crear otra.
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1]?.idempotencyKey).toBe(llamadas[0]?.idempotencyKey);

    expect(
      await base.prisma.payment.count({ where: { catalogPriceId: { not: null }, status: 'REQUIRES_PAYMENT' } }),
    ).toBeGreaterThan(0);
  });

  it('una intención vieja no se reutiliza: quien vuelve mañana quiere pagar hoy', async () => {
    const productId = await conceptoConPrecio({ code: 'INTENCION_VIEJA', billingMode: 'ONE_TIME', amountMinor: 100_00 });
    const actor = await contextoDe(base.prisma, agremiada);

    const primero = await startCheckout(actor, { productId });
    if (!primero.ok) throw new Error(primero.error.message);

    // Se envejece la intención más allá de la ventana de reutilización, y hace
    // falta la conexión de propietaria para hacerlo: la aplicación no puede
    // tocar `createdAt` de un pago, porque la migración le revocó esa columna.
    // Que esta línea no funcione con el cliente de la aplicación es, de hecho,
    // otra comprobación de que esa garantía está puesta.
    await base.sql.query('UPDATE "payment" SET "createdAt" = $1 WHERE "publicId" = $2', [
      new Date(Date.now() - CHECKOUT_REUSE_MS - 60_000),
      primero.data.paymentPublicId,
    ]);

    const segundo = await startCheckout(actor, { productId });
    if (!segundo.ok) throw new Error(segundo.error.message);

    expect(segundo.data.paymentPublicId).not.toBe(primero.data.paymentPublicId);
    expect(segundo.data.reused).toBe(false);
  });
});

describe('volver del navegador no prueba nada', () => {
  it('el pago nace y se queda sin confirmar hasta que llegue el webhook', async () => {
    const productId = await conceptoConPrecio({ code: 'SIN_CONFIRMAR', billingMode: 'ONE_TIME', amountMinor: 300_00 });
    const actor = await contextoDe(base.prisma, agremiada);

    const iniciado = await startCheckout(actor, { productId });
    if (!iniciado.ok) throw new Error(iniciado.error.message);

    const fila = await base.prisma.payment.findFirstOrThrow({
      where: { publicId: iniciado.data.paymentPublicId },
      select: { status: true, paidAt: true, stripeCheckoutSessionId: true },
    });

    // El PRD §11.4 lo prohíbe con todas sus letras: el retorno del navegador
    // nunca es prueba de pago.
    expect(fila.status).toBe('REQUIRES_PAYMENT');
    expect(fila.paidAt).toBeNull();
    // Y sí guarda la sesión, que es lo que permitirá casar el webhook después.
    expect(fila.stripeCheckoutSessionId).not.toBeNull();
  });
});

describe('cada cobro va a la cuenta de su entidad', () => {
  it('un concepto de Fuerza Índigo cobra por la cuenta de Fuerza', async () => {
    const productId = await conceptoConPrecio({ code: 'CUENTA_FUERZA', billingMode: 'ONE_TIME', amountMinor: 50_00 });
    const actor = await contextoDe(base.prisma, agremiada);

    await startCheckout(actor, { productId });
    expect(llamadas[0]?.account).toBe('FUERZA');

    const fila = await base.prisma.payment.findFirstOrThrow({
      where: { legalEntityId: fuerzaId },
      orderBy: { createdAt: 'desc' },
      select: { stripeAccountKey: true },
    });
    expect(fila.stripeAccountKey).toBe('FUERZA');
  });
});

describe('el modo de cobro sale del concepto, no de la pantalla', () => {
  it('un concepto recurrente abre una suscripción', async () => {
    const productId = await conceptoConPrecio({ code: 'RECURRENTE', billingMode: 'RECURRING', amountMinor: 150_00 });
    await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    expect(llamadas[0]?.mode).toBe('subscription');
  });

  it('un concepto de pago único abre un cobro único', async () => {
    const productId = await conceptoConPrecio({ code: 'UNICO', billingMode: 'ONE_TIME', amountMinor: 150_00 });
    await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    expect(llamadas[0]?.mode).toBe('payment');
  });
});

describe('no se cobra lo que no se puede cobrar', () => {
  it('un concepto sin precio vigente no se cobra', async () => {
    const actorFinanzas = await contextoDe(base.prisma, finanzas);
    const creado = await createProduct(actorFinanzas, {
      code: 'SIN_PRECIO',
      name: 'Concepto sin precio',
      description: 'Existe en el catálogo pero nadie le ha fijado importe.',
      legalEntityId: fuerzaId,
      kind: 'COURSE',
      billingMode: 'ONE_TIME',
    });
    if (!creado.ok) throw new Error(creado.error.message);

    const resultado = await startCheckout(await contextoDe(base.prisma, agremiada), {
      productId: creado.data.productId,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('RULE_VIOLATION');

    // Y no dejó ninguna intención abierta a medias.
    expect(await base.prisma.payment.count({ where: { catalogPrice: { productId: creado.data.productId } } })).toBe(0);
  });

  it('un concepto archivado no se cobra', async () => {
    const productId = await conceptoConPrecio({ code: 'ARCHIVADO', billingMode: 'ONE_TIME', amountMinor: 90_00 });
    await base.prisma.catalogProduct.update({
      where: { id: productId },
      data: { archivedAt: new Date(), isActive: false },
    });

    const resultado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('CONFLICT');
  });

  it('si la pasarela falla, no queda un cobro que parezca vivo', async () => {
    const productId = await conceptoConPrecio({ code: 'PASARELA_CAIDA', billingMode: 'ONE_TIME', amountMinor: 70_00 });
    falla = true;

    const resultado = await startCheckout(await contextoDe(base.prisma, agremiada), { productId });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('DEPENDENCY_UNAVAILABLE');

    // La intención queda registrada pero sin sesión: no hay a dónde ir a pagar,
    // y eso es lo que tiene que verse.
    const fila = await base.prisma.payment.findFirst({
      where: { catalogPrice: { productId } },
      select: { status: true, stripeCheckoutSessionId: true },
    });
    expect(fila?.status).toBe('REQUIRES_PAYMENT');
    expect(fila?.stripeCheckoutSessionId).toBeNull();
  });
});

describe('a quien no se le cobra, no se le ofrece pagar', () => {
  it('un beneficiario protegido no puede iniciar un cobro', async () => {
    // Recibe apoyo sin pagar ni afiliarse (PRD §14). Ponerle delante un botón
    // de cobro sería lo contrario de lo que ese estatuto significa.
    const productId = await conceptoConPrecio({ code: 'NO_PARA_PROTEGIDA', billingMode: 'ONE_TIME', amountMinor: 10_00 });

    const resultado = await startCheckout(await contextoDe(base.prisma, protegida), { productId });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('y el catálogo que se le ofrece está vacío', async () => {
    const ofrecido = await payableCatalog(await contextoDe(base.prisma, protegida));
    expect(ofrecido.ok).toBe(true);
    if (ofrecido.ok) expect(ofrecido.data).toEqual([]);
  });

  it('a quien sí paga se le ofrecen solo conceptos con precio vigente', async () => {
    const ofrecido = await payableCatalog(await contextoDe(base.prisma, agremiada));
    if (!ofrecido.ok) throw new Error(ofrecido.error.message);

    expect(ofrecido.data.length).toBeGreaterThan(0);
    expect(ofrecido.data.every((fila) => fila.amountMinor > 0n)).toBe(true);
    expect(ofrecido.data.some((fila) => fila.name === 'Concepto SIN_PRECIO')).toBe(false);
  });
});

describe('nadie ve el cobro de nadie más', () => {
  it('el historial solo trae los cobros propios', async () => {
    const productId = await conceptoConPrecio({ code: 'AISLAMIENTO', billingMode: 'ONE_TIME', amountMinor: 400_00 });
    await startCheckout(await contextoDe(base.prisma, otraAgremiada), { productId });

    const mios = await ownPayments(await contextoDe(base.prisma, otraAgremiada));
    const ajenos = await ownPayments(await contextoDe(base.prisma, agremiada));
    if (!mios.ok || !ajenos.ok) throw new Error('no se pudieron leer los pagos');

    expect(mios.data.length).toBeGreaterThan(0);
    expect(ajenos.data.some((fila) => fila.concept === 'Concepto AISLAMIENTO')).toBe(false);
  });

  it('un cobro ajeno no se encuentra por su referencia', async () => {
    const productId = await conceptoConPrecio({ code: 'REFERENCIA_AJENA', billingMode: 'ONE_TIME', amountMinor: 55_00 });
    const iniciado = await startCheckout(await contextoDe(base.prisma, otraAgremiada), { productId });
    if (!iniciado.ok) throw new Error(iniciado.error.message);

    // Se responde «no está», no «no puedes»: distinguirlos confirmaría que ese
    // cobro existe y de quién es.
    const intruso = await ownPayment(await contextoDe(base.prisma, agremiada), iniciado.data.paymentPublicId);
    expect(intruso.ok).toBe(false);
    if (!intruso.ok) expect(intruso.error.code).toBe('NOT_FOUND');

    const propio = await ownPayment(await contextoDe(base.prisma, otraAgremiada), iniciado.data.paymentPublicId);
    expect(propio.ok).toBe(true);
  });
});

describe('el portal de cliente', () => {
  it('no se abre antes del primer cobro, porque no habría nada que administrar', async () => {
    const resultado = await openBillingPortal(await contextoDe(base.prisma, agremiada), {
      legalEntityId: fuerzaId,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('NOT_FOUND');
  });

  it('se abre cuando la pasarela ya conoce a la persona', async () => {
    const productId = await conceptoConPrecio({ code: 'CON_PORTAL', billingMode: 'RECURRING', amountMinor: 200_00 });
    await startCheckout(await contextoDe(base.prisma, agremiada), { productId });

    // Lo escribe el webhook al crearse el cliente en la pasarela; aquí se
    // simula ese estado para poder probar la puerta que abre.
    await base.prisma.billingAccount.updateMany({
      where: { personId: agremiada.personId, legalEntityId: fuerzaId },
      data: { stripeCustomerId: `cus_test_${Date.now().toString(36)}` },
    });

    const resultado = await openBillingPortal(await contextoDe(base.prisma, agremiada), {
      legalEntityId: fuerzaId,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.data.url).toContain('portal');
  });
});
