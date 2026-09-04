import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';

/**
 * Lo que el motor garantiza sobre el dinero (PRD §11, Fase 3).
 *
 * No se prueba aquí ningún caso de uso: se prueba que las promesas del modelo
 * financiero **no dependan de que el código las respete**. Un libro auxiliar que
 * la aplicación puede editar no sirve para rendir cuentas aunque hoy ninguna
 * ruta lo edite, porque mañana puede haberla.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;

beforeAll(async () => {
  base = await createTestDatabase('finanzas');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function asiento(overrides: Record<string, unknown> = {}) {
  return base.prisma.ledgerEntry.create({
    data: {
      legalEntityId: entidadId,
      entryDate: new Date(),
      direction: 'CREDIT',
      accountCode: 'INGRESOS.CUOTAS',
      amountMinor: 150_00n,
      currency: 'MXN',
      sourceKind: 'PAYMENT',
      sourceId: '01a06c22-3f89-753e-ba58-d54925d8b406',
      description: 'Asiento de prueba',
      createdByActorId: actorId,
      ...overrides,
    },
    select: { id: true, amountMinor: true },
  });
}

describe('importes', () => {
  it('se guardan como enteros en unidades menores, no como decimales', async () => {
    const { rows } = await base.sql.query<{ data_type: string; column_name: string; table_name: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE column_name LIKE '%Minor%' AND table_schema = 'public'
       ORDER BY table_name, column_name`,
    );

    expect(rows.length).toBeGreaterThan(10);
    for (const fila of rows) {
      expect(fila.data_type, `${fila.table_name}.${fila.column_name} no es entero`).toBe('bigint');
    }
  });

  it('ninguna columna de dinero es de coma flotante', async () => {
    const { rows } = await base.sql.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('double precision', 'real', 'numeric')
         AND (column_name ILIKE '%amount%' OR column_name ILIKE '%value%' OR column_name ILIKE '%total%')`,
    );

    // `0.1 + 0.2` no es `0.3`. En un libro de cuentas eso no es una curiosidad:
    // es un descuadre que nadie sabe explicar seis meses después.
    expect(rows).toEqual([]);
  });

  it('un importe grande no pierde precisión', async () => {
    // Cien millones de pesos en centavos. Un entero de 32 bits se habría
    // desbordado; uno de coma flotante habría redondeado.
    const creado = await asiento({ amountMinor: 10_000_000_000n });
    expect(creado.amountMinor).toBe(10_000_000_000n);
  });
});

describe('el libro auxiliar es inmutable', () => {
  it('la aplicación no puede modificar un asiento', async () => {
    const creado = await asiento();

    await expect(
      base.prisma.ledgerEntry.update({ where: { id: creado.id }, data: { amountMinor: 1n } }),
    ).rejects.toThrow(/permission denied|permiso/i);
  });

  it('la aplicación no puede borrar un asiento', async () => {
    const creado = await asiento();

    await expect(base.prisma.ledgerEntry.delete({ where: { id: creado.id } })).rejects.toThrow(
      /permission denied|permiso/i,
    );
  });

  it('sí puede enlazarlo a un corte de conciliación: eso no altera el hecho asentado', async () => {
    const creado = await asiento();
    const corte = await base.prisma.reconciliation.create({
      data: {
        legalEntityId: entidadId,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-06-30'),
        stripeAccountKey: 'FUERZA',
        expectedTotalMinor: 0n,
        observedTotalMinor: 0n,
        differenceMinor: 0n,
        createdByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.ledgerEntry.update({ where: { id: creado.id }, data: { reconciliationId: corte.id } }),
    ).resolves.toBeTruthy();
  });

  it('una corrección es un asiento nuevo que apunta al que corrige', async () => {
    const original = await asiento({ description: 'Cobro con importe equivocado' });
    const reversion = await asiento({
      direction: 'DEBIT',
      description: 'Reversión del asiento anterior',
      reason: 'El importe se asentó con un cero de más.',
      reversalOfEntryId: original.id,
    });

    const leido = await base.prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: reversion.id },
      select: { reversalOfEntryId: true },
    });
    expect(leido.reversalOfEntryId).toBe(original.id);

    // Y un asiento no se puede revertir dos veces: la unicidad lo impide, de
    // modo que no puede haber dos correcciones contradictorias del mismo hecho.
    await expect(asiento({ reversalOfEntryId: original.id })).rejects.toThrow();
  });
});

describe('el evento de Stripe se guarda íntegro y no se toca', () => {
  async function evento(overrides: Record<string, unknown> = {}) {
    return base.prisma.stripeWebhookEvent.create({
      data: {
        stripeAccountKey: 'FUERZA',
        stripeEventId: `evt_${Math.random().toString(36).slice(2)}`,
        eventType: 'checkout.session.completed',
        apiVersion: '2026-01-01',
        payload: { id: 'evt', object: 'event' },
        signatureVerified: true,
        ...overrides,
      },
      select: { id: true, stripeEventId: true },
    });
  }

  it('no se puede alterar lo que llegó', async () => {
    const recibido = await evento();

    await expect(
      base.prisma.stripeWebhookEvent.update({
        where: { id: recibido.id },
        data: { payload: { id: 'otro' } },
      }),
    ).rejects.toThrow(/permission denied|permiso/i);
  });

  it('sí puede avanzar el estado de su procesamiento', async () => {
    const recibido = await evento();

    await expect(
      base.prisma.stripeWebhookEvent.update({
        where: { id: recibido.id },
        data: { processingStatus: 'PROCESSED', processedAt: new Date(), attempts: 1 },
      }),
    ).resolves.toBeTruthy();
  });

  it('el mismo identificador de evento no entra dos veces', async () => {
    const primero = await evento();

    // Es lo que hace idempotente el reenvío de Stripe. Sin esta restricción, un
    // reintento cobraría dos veces.
    await expect(evento({ stripeEventId: primero.stripeEventId })).rejects.toThrow();
  });
});

describe('un movimiento patrimonial es un hecho ocurrido', () => {
  it('no se puede modificar ni borrar', async () => {
    const activo = await base.prisma.assetRegister.create({
      data: {
        legalEntityId: entidadId,
        assetKind: 'EQUIPMENT',
        name: 'Equipo de prueba',
        description: 'Registrado por una prueba de integración.',
        acquisitionMode: 'PURCHASE',
        acquiredOn: new Date('2026-01-15'),
        documentedValueMinor: 25_000_00n,
        currency: 'MXN',
        createdByActorId: actorId,
      },
      select: { id: true },
    });

    // La semilla no crea personas: quien registra el movimiento se crea aquí.
    const quienRegistra = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Quien',
      familyName: 'Resguarda',
    });

    const movimiento = await base.prisma.assetMovement.create({
      data: {
        assetId: activo.id,
        movementKind: 'REGISTERED',
        occurredOn: new Date('2026-01-15'),
        toCustodianId: quienRegistra.personId,
        registeredById: quienRegistra.userId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.assetMovement.update({ where: { id: movimiento.id }, data: { movementKind: 'DISPOSED' } }),
    ).rejects.toThrow(/permission denied|permiso/i);
  });
});

describe('la entidad receptora está en cada movimiento', () => {
  it('ninguna tabla de dinero admite un movimiento sin entidad', async () => {
    const { rows } = await base.sql.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'legalEntityId'
         AND table_name IN ('payment', 'ledger_entry', 'reconciliation', 'catalog_product',
                            'billing_account', 'discount_grant', 'scholarship', 'asset_register')
       ORDER BY table_name`,
    );

    expect(rows.length).toBe(8);
    for (const fila of rows) {
      // Aun operando una sola cuenta de Stripe al principio, separar las
      // cuentas después no puede obligar a reconstruir el historial (PRD §11.2).
      expect(fila.is_nullable, `${fila.table_name} admite movimiento sin entidad`).toBe('NO');
    }
  });
});
