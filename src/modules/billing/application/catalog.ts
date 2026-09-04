import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { CatalogProductKind } from '@prisma-client/enums';

/**
 * Catálogo de conceptos cobrables y sus precios (PRD §11.1, F3-PAG-001).
 *
 * Dos reglas gobiernan este módulo:
 *
 *  1. **Ningún precio vive en una pantalla.** El PRD lo dice con todas sus
 *     letras: los precios y conceptos no estarán codificados en el frontend. Se
 *     administran aquí, y un pago conserva el precio con el que se cobró aunque
 *     el catálogo cambie mañana.
 *  2. **Un precio no se edita: se versiona.** Cambiar el importe de una cuota es
 *     un acto con fecha. Editarlo en su sitio haría que un cobro de marzo
 *     pareciera hecho con el precio de septiembre, y eso es exactamente lo que
 *     nadie puede explicar en una asamblea.
 *
 * Una cuota extraordinaria exige acuerdo de asamblea (PRD §9.4). La tabla
 * `Resolution` llega en la Fase 5; hasta entonces el acuerdo se declara por
 * escrito, y sin esa declaración el producto no se crea.
 */

const CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;

const MONEDAS = ['MXN', 'USD'] as const;

/**
 * Tipos que exigen acuerdo institucional para poder cobrarse.
 *
 * Una cuota extraordinaria no la fija quien administra el catálogo: la acuerda
 * la asamblea. Cobrarla sin dejar dicho de qué acuerdo sale es cobrar algo que
 * nadie autorizó.
 */
const EXIGEN_ACUERDO: readonly CatalogProductKind[] = ['UNION_DUE_EXTRAORDINARY'];

export const createProductSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: CUOTA_ORDINARIA_2026.',
  }),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(600, {
    error: () => 'Explica qué se cobra: es lo que leerá quien pague.',
  }),
  legalEntityId: z.uuid({ error: () => 'Elige qué entidad jurídica recibe este cobro.' }),
  kind: z.enum([
    'ENROLLMENT_FEE',
    'UNION_DUE_ORDINARY',
    'UNION_DUE_EXTRAORDINARY',
    'HONORARY_MEMBERSHIP',
    'SERVICE_SUBSCRIPTION',
    'COURSE',
    'CIAN_SERVICE',
    'CENI_PROGRAM',
    'CENI_ASSESSMENT',
    'CENI_CERTIFICATION',
    'RENEWAL',
    'DONATION',
  ]),
  billingMode: z.enum(['ONE_TIME', 'RECURRING']),
  moduleBinding: z
    .enum(['MEMBERSHIP', 'HONORARY_AFFILIATION', 'TOOL_ACCESS', 'CIAN_SERVICE', 'CENI_PROGRAM', 'EVENT_REGISTRATION', 'NONE'])
    .default('NONE'),
  stripeProductId: z.string().trim().max(80).optional(),
  authorizingResolutionNote: z.string().trim().max(400).optional(),
});

export type CreateProductInput = z.input<typeof createProductSchema>;

export const createPriceSchema = z.object({
  productId: z.uuid(),
  /**
   * Unidades menores, siempre. Se pide como entero y no como «pesos con
   * centavos» para que no exista ningún punto del sistema donde un importe sea
   * un decimal: convertir en la pantalla y guardar entero deja una conversión
   * que alguien acabará haciendo al revés.
   */
  amountMinor: z
    .union([z.bigint(), z.number(), z.string().trim()], {
      error: () => 'El importe va en centavos, sin decimales. Cien pesos son 10000.',
    })
    .transform((valor, ctx) => {
      // Un decimal no se redondea: se rechaza. Redondear aquí sería inventar
      // dinero, y siempre a costa de alguien.
      if (typeof valor === 'number' && !Number.isInteger(valor)) {
        ctx.addIssue({ code: 'custom', message: 'El importe va en centavos, sin decimales. Cien pesos son 10000.' });
        return z.NEVER;
      }
      if (typeof valor === 'string' && !/^\d+$/.test(valor)) {
        ctx.addIssue({ code: 'custom', message: 'El importe va en centavos, sin decimales. Cien pesos son 10000.' });
        return z.NEVER;
      }
      // Se guarda como `bigint` porque la columna lo es: pasar por `number`
      // perdería precisión en un importe grande, y un importe grande es
      // exactamente el que nadie quiere ver mal.
      const minor = BigInt(valor);
      if (minor < 0n) {
        ctx.addIssue({ code: 'custom', message: 'El importe no puede ser negativo.' });
        return z.NEVER;
      }
      return minor;
    }),
  currency: z.enum(MONEDAS),
  interval: z.enum(['MONTH', 'QUARTER', 'SEMESTER', 'YEAR']).optional(),
  stripePriceId: z.string().trim().max(80).optional(),
  effectiveFrom: z.coerce.date(),
  isDefault: z.boolean().default(true),
});

export type CreatePriceInput = z.input<typeof createPriceSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function createProduct(
  actor: ActorContext,
  input: CreateProductInput,
): Promise<UseCaseResult<{ productId: string }>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'billing.catalog.manage', {
    kind: 'CatalogProduct',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (EXIGEN_ACUERDO.includes(data.kind) && (data.authorizingResolutionNote ?? '') === '') {
    return fail(
      errors.validation({
        authorizingResolutionNote: [
          'Una cuota extraordinaria la acuerda la asamblea. Escribe de qué acuerdo sale: fecha, número de acta o resolución.',
        ],
      }),
    );
  }

  const existente = await db().catalogProduct.findUnique({ where: { code: data.code }, select: { id: true } });
  if (existente !== null) {
    return fail(errors.conflict('Ya existe un concepto con ese código.', 'código de producto duplicado'));
  }

  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { id: true },
  });
  if (entidad === null) return fail(errors.notFound('entidad jurídica inexistente'));

  const resultado = await transaction(async (tx) => {
    const producto = await tx.catalogProduct.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        legalEntityId: data.legalEntityId,
        kind: data.kind,
        billingMode: data.billingMode,
        moduleBinding: data.moduleBinding,
        stripeProductId: data.stripeProductId ?? null,
        authorizingResolutionNote: data.authorizingResolutionNote ?? null,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CATALOG_PRODUCT_CREATED,
      objectKind: 'CatalogProduct',
      objectId: producto.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: { code: data.code, kind: data.kind, billingMode: data.billingMode },
    });

    return { productId: producto.id };
  });

  return ok(resultado);
}

/**
 * Añade una versión de precio.
 *
 * La versión anterior se cierra con `effectiveTo` en el instante en que empieza
 * la nueva: así no hay dos precios vigentes a la vez, y un pago de ayer sigue
 * apuntando al precio de ayer.
 */
export async function createPrice(
  actor: ActorContext,
  input: CreatePriceInput,
): Promise<UseCaseResult<{ priceId: string; version: number }>> {
  const parsed = createPriceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const producto = await db().catalogProduct.findUnique({
    where: { id: data.productId },
    select: { id: true, legalEntityId: true, billingMode: true, code: true, archivedAt: true },
  });
  if (producto === null) return fail(errors.notFound('concepto inexistente'));

  const decision = can(actor, 'billing.catalog.manage', {
    kind: 'CatalogPrice',
    legalEntityId: producto.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (producto.archivedAt !== null) {
    return fail(errors.conflict('Ese concepto está archivado. Reactívalo antes de ponerle precio.', 'producto archivado'));
  }

  if (producto.billingMode === 'RECURRING' && data.interval === undefined) {
    return fail(
      errors.validation({
        interval: ['Un concepto recurrente necesita cada cuánto se cobra: mes, trimestre, semestre o año.'],
      }),
    );
  }
  if (producto.billingMode === 'ONE_TIME' && data.interval !== undefined) {
    return fail(
      errors.validation({
        interval: ['Este concepto es de pago único: no lleva periodicidad. Si se cobra cada cierto tiempo, cámbialo a recurrente.'],
      }),
    );
  }

  const resultado = await transaction(async (tx) => {
    const ultima = await tx.catalogPrice.findFirst({
      where: { productId: producto.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, effectiveTo: true },
    });

    const version = (ultima?.version ?? 0) + 1;

    // Se cierra la versión anterior en el mismo instante en que empieza la
    // nueva. Sin esto habría dos precios vigentes y la consulta de «cuánto vale
    // esto hoy» devolvería el que llegara primero.
    if (ultima !== undefined && ultima !== null && ultima.effectiveTo === null) {
      await tx.catalogPrice.update({
        where: { id: ultima.id },
        data: { effectiveTo: data.effectiveFrom, isDefault: false },
      });
    }

    const precio = await tx.catalogPrice.create({
      data: {
        productId: producto.id,
        version,
        amountMinor: data.amountMinor,
        currency: data.currency,
        interval: data.interval ?? null,
        stripePriceId: data.stripePriceId ?? null,
        effectiveFrom: data.effectiveFrom,
        isDefault: data.isDefault,
        createdByActorId: actor.actorId,
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CATALOG_PRICE_CREATED,
      objectKind: 'CatalogPrice',
      objectId: precio.id,
      outcome: 'SUCCESS',
      legalEntityId: producto.legalEntityId,
      metadata: {
        productCode: producto.code,
        version: precio.version,
        amountMinor: data.amountMinor.toString(),
        currency: data.currency,
      },
    });

    return { priceId: precio.id, version: precio.version };
  });

  return ok(resultado);
}

export const archiveProductSchema = z.object({
  productId: z.uuid(),
  reason: z.string().trim().min(5).max(400, {
    error: () => 'Escribe por qué se retira este concepto: lo leerá quien revise las cuentas.',
  }),
});

/**
 * Archiva un concepto.
 *
 * No se borra nunca: hay pagos que apuntan a sus precios, y un catálogo del que
 * desaparecen conceptos deja movimientos históricos sin explicación.
 */
export async function archiveProduct(
  actor: ActorContext,
  input: z.infer<typeof archiveProductSchema>,
): Promise<UseCaseResult<{ productId: string }>> {
  const parsed = archiveProductSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const producto = await db().catalogProduct.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, legalEntityId: true, code: true, archivedAt: true },
  });
  if (producto === null) return fail(errors.notFound('concepto inexistente'));

  const decision = can(actor, 'billing.catalog.manage', {
    kind: 'CatalogProduct',
    legalEntityId: producto.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (producto.archivedAt !== null) {
    return fail(errors.conflict('Ese concepto ya está archivado.', 'archivado dos veces'));
  }

  await transaction(async (tx) => {
    await tx.catalogProduct.update({
      where: { id: producto.id },
      data: { archivedAt: new Date(), isActive: false, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CATALOG_PRODUCT_UPDATED,
      objectKind: 'CatalogProduct',
      objectId: producto.id,
      outcome: 'SUCCESS',
      legalEntityId: producto.legalEntityId,
      metadata: { code: producto.code, archivado: true, reason: parsed.data.reason },
    });
  });

  return ok({ productId: producto.id });
}

export const reactivateProductSchema = z.object({
  productId: z.uuid(),
  reason: z.string().trim().min(5).max(400, {
    error: () => 'Escribe por qué vuelve a cobrarse este concepto.',
  }),
});

/**
 * Devuelve al catálogo un concepto archivado.
 *
 * Existe porque archivar tiene que ser reversible: si no lo fuera, retirar un
 * concepto por error obligaría a crear otro con un código distinto, y el
 * histórico quedaría partido en dos conceptos que en realidad son el mismo.
 *
 * No toca los precios. El concepto vuelve con la versión de precio que tenía, y
 * si la organización acordó otra cantidad se añade una versión nueva, que es la
 * única forma de cambiar un importe en este módulo.
 */
export async function reactivateProduct(
  actor: ActorContext,
  input: z.infer<typeof reactivateProductSchema>,
): Promise<UseCaseResult<{ productId: string }>> {
  const parsed = reactivateProductSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const producto = await db().catalogProduct.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, legalEntityId: true, code: true, archivedAt: true },
  });
  if (producto === null) return fail(errors.notFound('concepto inexistente'));

  const decision = can(actor, 'billing.catalog.manage', {
    kind: 'CatalogProduct',
    legalEntityId: producto.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (producto.archivedAt === null) {
    return fail(errors.conflict('Ese concepto no está archivado.', 'reactivar un producto vigente'));
  }

  await transaction(async (tx) => {
    await tx.catalogProduct.update({
      where: { id: producto.id },
      data: { archivedAt: null, isActive: true, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CATALOG_PRODUCT_UPDATED,
      objectKind: 'CatalogProduct',
      objectId: producto.id,
      outcome: 'SUCCESS',
      legalEntityId: producto.legalEntityId,
      metadata: { code: producto.code, archivado: false, reason: parsed.data.reason },
    });
  });

  return ok({ productId: producto.id });
}
