import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveProduct,
  catalogList,
  createPrice,
  createProduct,
  currentPrice,
  priceHistory,
  reactivateProduct,
} from '@/modules/billing';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Catálogo de conceptos cobrables (PRD §11.1, F3-PAG-001).
 *
 * Lo que se comprueba no es que sepa guardar filas, sino las dos promesas del
 * PRD: que ningún precio esté codificado en una pantalla, y que cambiar un
 * precio sea un acto con fecha en vez de una edición que reescribe el pasado.
 */

let base: TestDatabase;
let finanzas: PersonaDePrueba;
let finanzasDeAlianza: PersonaDePrueba;
let sinFacultades: PersonaDePrueba;
let fuerzaId: string;
let alianzaId: string;

beforeAll(async () => {
  base = await createTestDatabase('catalogo');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  finanzas = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Finanzas' });
  finanzasDeAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Finanzas', familyName: 'De Alianza' });
  sinFacultades = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });

  await nombrar(base.prisma, {
    userId: finanzas.userId,
    roleCode: 'FINANCE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: finanzasDeAlianza.userId,
    roleCode: 'FINANCE',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

beforeEach(async () => {
  await base.sql.query('TRUNCATE TABLE "catalog_price", "catalog_product" CASCADE');
});

async function actorFinanzas() {
  return contextoDe(base.prisma, finanzas, { reason: 'administración del catálogo' });
}

async function productoOrdinario(overrides: Record<string, unknown> = {}) {
  const creado = await createProduct(await actorFinanzas(), {
    code: 'CUOTA_ORDINARIA_2026',
    name: 'Cuota sindical ordinaria 2026',
    description: 'Cuota ordinaria mensual de las personas agremiadas.',
    legalEntityId: fuerzaId,
    kind: 'UNION_DUE_ORDINARY',
    billingMode: 'RECURRING',
    ...overrides,
  });
  if (!creado.ok) throw new Error(creado.error.message);
  return creado.data.productId;
}

describe('ningún importe está codificado en el repositorio', () => {
  it('la semilla no crea ningún concepto ni ningún precio', async () => {
    // Una cuota sindical es una cantidad que acuerda la organización. Sembrar
    // un número plausible sería el mismo error que inventar un valor
    // estatutario (ADR-0040).
    expect(await base.prisma.catalogProduct.count()).toBe(0);
    expect(await base.prisma.catalogPrice.count()).toBe(0);
  });

  it('sí siembra la configuración de cobro de las dos entidades, que es estructura', async () => {
    const cuentas = await base.prisma.stripeAccountConfiguration.findMany({
      select: { accountKey: true, isActive: true, defaultCurrency: true },
    });

    // Se ordena aquí y no en la consulta: Postgres ordena un enum por el orden
    // en que se declararon sus valores, no alfabéticamente, y esa es una
    // propiedad del esquema que este caso no examina.
    expect(cuentas.map((c) => c.accountKey).sort()).toEqual(['ALIANZA', 'FUERZA']);
    expect(cuentas.map((c) => c.defaultCurrency)).toEqual(['MXN', 'MXN']);
    // Nace desactivado: una instalación nueva no debe poder cobrarle a nadie
    // antes de que alguien con facultades lo decida.
    expect(cuentas.every((c) => !c.isActive)).toBe(true);
  });
});

describe('un precio se versiona, no se edita', () => {
  it('la segunda versión cierra la primera en el instante en que empieza', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    const enero = new Date('2026-01-01T00:00:00.000Z');
    const julio = new Date('2026-07-01T00:00:00.000Z');

    const primera = await createPrice(actor, {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: enero,
    });
    expect(primera.ok).toBe(true);

    const segunda = await createPrice(actor, {
      productId,
      amountMinor: 180_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: julio,
    });
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.data.version).toBe(2);

    const historial = await priceHistory(actor, productId);
    if (!historial.ok) throw new Error(historial.error.message);

    expect(historial.data).toHaveLength(2);
    expect(historial.data.find((p) => p.version === 1)?.effectiveTo?.toISOString()).toBe(julio.toISOString());
    expect(historial.data.find((p) => p.version === 2)?.effectiveTo).toBeNull();
  });

  it('«cuánto vale esto» depende de la fecha, no de una marca', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    await createPrice(actor, {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createPrice(actor, {
      productId,
      amountMinor: 180_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    });

    // Es lo que permite explicar en una asamblea por qué el cobro de marzo fue
    // de una cantidad y el de septiembre de otra.
    expect((await currentPrice(productId, new Date('2026-03-15T00:00:00.000Z')))?.amountMinor).toBe(150_00n);
    expect((await currentPrice(productId, new Date('2026-09-15T00:00:00.000Z')))?.amountMinor).toBe(180_00n);
  });

  it('antes de que entre en vigor el primero, no hay precio: no se inventa uno', async () => {
    const productId = await productoOrdinario();

    await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(await currentPrice(productId, new Date('2026-01-15T00:00:00.000Z'))).toBeNull();
  });

  it('el importe se guarda en unidades menores y no pierde nada', async () => {
    const productId = await productoOrdinario();

    await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 1_234_56,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    const vigente = await currentPrice(productId, new Date('2026-02-01T00:00:00.000Z'));
    expect(vigente?.amountMinor).toBe(123_456n);
  });

  it('un importe mayor que el entero seguro de JavaScript llega entero a la base', async () => {
    // No es un caso hipotético: una cuota extraordinaria de un padrón grande, o
    // una moneda sin centavos, salen del rango seguro de `number`. Si el
    // importe pasara por coma flotante en algún punto del camino, aquí se vería.
    const productId = await productoOrdinario();

    const creado = await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 9_007_199_254_740_993n,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(creado.ok).toBe(true);

    const vigente = await currentPrice(productId, new Date('2026-02-01T00:00:00.000Z'));
    expect(vigente?.amountMinor).toBe(9_007_199_254_740_993n);
  });

  it('rechaza un importe con decimales: el importe va en centavos', async () => {
    const productId = await productoOrdinario();

    const resultado = await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 150.5,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(resultado.ok).toBe(false);
  });
});

describe('coherencia entre el modo de cobro y la periodicidad', () => {
  it('un concepto recurrente sin periodicidad no se puede cobrar', async () => {
    const productId = await productoOrdinario();

    const resultado = await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.details?.['interval']).toBeDefined();
  });

  it('un concepto de pago único con periodicidad cobraría para siempre algo que se paga una vez', async () => {
    const productId = await productoOrdinario({
      code: 'INSCRIPCION_2026',
      kind: 'ENROLLMENT_FEE',
      billingMode: 'ONE_TIME',
      name: 'Cuota de inscripción',
      description: 'Se paga una sola vez al ingresar al sindicato.',
    });

    const resultado = await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 500_00,
      currency: 'MXN',
      interval: 'YEAR',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(resultado.ok).toBe(false);
  });
});

describe('una cuota extraordinaria exige acuerdo', () => {
  it('no se crea sin decir de qué acuerdo sale', async () => {
    const resultado = await createProduct(await actorFinanzas(), {
      code: 'CUOTA_EXTRA_HUELGA',
      name: 'Cuota extraordinaria',
      description: 'Aportación extraordinaria para el fondo de resistencia.',
      legalEntityId: fuerzaId,
      kind: 'UNION_DUE_EXTRAORDINARY',
      billingMode: 'ONE_TIME',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.details?.['authorizingResolutionNote']).toBeDefined();
  });

  it('se crea cuando el acuerdo consta por escrito', async () => {
    const resultado = await createProduct(await actorFinanzas(), {
      code: 'CUOTA_EXTRA_HUELGA',
      name: 'Cuota extraordinaria',
      description: 'Aportación extraordinaria para el fondo de resistencia.',
      legalEntityId: fuerzaId,
      kind: 'UNION_DUE_EXTRAORDINARY',
      billingMode: 'ONE_TIME',
      authorizingResolutionNote: 'Acta de asamblea extraordinaria del 12 de marzo de 2026, punto cuarto.',
    });

    expect(resultado.ok).toBe(true);
  });
});

describe('aislamiento entre entidades', () => {
  it('quien administra el catálogo de una entidad no crea conceptos de la otra', async () => {
    const resultado = await createProduct(await actorFinanzas(), {
      code: 'PROGRAMA_SOCIAL',
      name: 'Programa social',
      description: 'Un concepto que corresponde a la otra persona moral.',
      legalEntityId: alianzaId,
      kind: 'DONATION',
      billingMode: 'ONE_TIME',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('el listado de una entidad no muestra los conceptos de la otra', async () => {
    await productoOrdinario();

    const deAlianza = await catalogList(
      await contextoDe(base.prisma, finanzasDeAlianza, { reason: 'revisión' }),
    );
    expect(deAlianza.ok).toBe(true);
    if (deAlianza.ok) expect(deAlianza.data).toHaveLength(0);
  });

  it('sin facultades no se ve el catálogo', async () => {
    const resultado = await catalogList(await contextoDe(base.prisma, sinFacultades));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});

describe('un concepto se archiva, nunca se borra', () => {
  it('archivar lo saca del listado pero conserva sus precios', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    await createPrice(actor, {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    const archivado = await archiveProduct(actor, {
      productId,
      reason: 'La asamblea acordó sustituirla por la cuota unificada.',
    });
    expect(archivado.ok).toBe(true);

    const visible = await catalogList(actor);
    if (visible.ok) expect(visible.data).toHaveLength(0);

    const conArchivados = await catalogList(actor, { includeArchived: true });
    if (conArchivados.ok) expect(conArchivados.data).toHaveLength(1);

    // Hay pagos que apuntan a estos precios: un catálogo del que desaparecen
    // conceptos deja movimientos históricos sin explicación.
    expect(await base.prisma.catalogPrice.count({ where: { productId } })).toBe(1);
  });

  it('no se le puede poner precio a un concepto archivado', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    await archiveProduct(actor, { productId, reason: 'Ya no se cobra.' });

    const resultado = await createPrice(actor, {
      productId,
      amountMinor: 200_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(resultado.ok).toBe(false);
  });

  it('reactivar lo devuelve al listado con su historial intacto', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    await createPrice(actor, {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    await archiveProduct(actor, { productId, reason: 'Se retiró por error.' });

    const reactivado = await reactivateProduct(actor, {
      productId,
      reason: 'Se archivó por equivocación: la asamblea nunca acordó retirarla.',
    });
    expect(reactivado.ok).toBe(true);

    const visible = await catalogList(actor);
    if (visible.ok) {
      expect(visible.data).toHaveLength(1);
      // Vuelve con el precio que tenía: reactivar no reabre importes, y cambiar
      // uno sigue exigiendo una versión nueva.
      expect(visible.data[0]?.currentAmountMinor).toBe(15000n);
      expect(visible.data[0]?.priceVersions).toBe(1);
    }
  });

  it('no se reactiva un concepto que nunca se archivó', async () => {
    const productId = await productoOrdinario();
    const actor = await actorFinanzas();

    const resultado = await reactivateProduct(actor, { productId, reason: 'Sin motivo real.' });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('CONFLICT');
  });

  it('sin facultades no se archiva ni se reactiva', async () => {
    const productId = await productoOrdinario();
    const intruso = await contextoDe(base.prisma, sinFacultades);

    const archivar = await archiveProduct(intruso, { productId, reason: 'Porque sí.' });
    expect(archivar.ok).toBe(false);

    await archiveProduct(await actorFinanzas(), { productId, reason: 'Retirada por acuerdo.' });
    const reactivar = await reactivateProduct(intruso, { productId, reason: 'Porque sí.' });
    expect(reactivar.ok).toBe(false);
  });
});

describe('todo movimiento del catálogo queda en la bitácora', () => {
  it('crear un concepto y su precio deja dos asientos', async () => {
    const antes = await base.prisma.auditEvent.count({ where: { action: { startsWith: 'billing.catalog.' } } });

    const productId = await productoOrdinario();
    await createPrice(await actorFinanzas(), {
      productId,
      amountMinor: 150_00,
      currency: 'MXN',
      interval: 'MONTH',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    });

    const despues = await base.prisma.auditEvent.count({ where: { action: { startsWith: 'billing.catalog.' } } });
    expect(despues).toBe(antes + 2);
  });
});
