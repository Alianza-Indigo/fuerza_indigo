import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { CatalogProductKind } from '@prisma-client/enums';

/**
 * Lectura del catálogo.
 *
 * `currentPrice` es la única fuente de «cuánto vale esto hoy». Ninguna pantalla
 * calcula un importe: lo pide aquí, y aquí se resuelve mirando la vigencia, no
 * la marca `isDefault`, porque un precio puede estar marcado por omisión y
 * todavía no haber entrado en vigor.
 */

export interface CatalogRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly kind: CatalogProductKind;
  readonly billingMode: 'ONE_TIME' | 'RECURRING';
  readonly legalEntityShortName: string;
  readonly isActive: boolean;
  readonly archivedAt: Date | null;
  readonly currentAmountMinor: bigint | null;
  readonly currentCurrency: string | null;
  readonly currentInterval: string | null;
  readonly priceVersions: number;
  readonly authorizingResolutionNote: string | null;
}

export interface PriceRow {
  readonly id: string;
  readonly version: number;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly interval: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly stripePriceId: string | null;
}

function alcance(actor: ActorContext): readonly string[] | undefined {
  return actor.legalEntityScope.length === 0 ? undefined : actor.legalEntityScope;
}

/**
 * El precio vigente de un concepto en un instante dado.
 *
 * Devuelve `null` cuando no hay ninguno, y quien lo llame tiene que tratarlo:
 * cobrar un concepto sin precio vigente sería cobrar una cantidad que nadie
 * fijó.
 */
export async function currentPrice(
  productId: string,
  at: Date = new Date(),
): Promise<{ id: string; amountMinor: bigint; currency: string; interval: string | null; stripePriceId: string | null } | null> {
  const precio = await db().catalogPrice.findFirst({
    where: {
      productId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { version: 'desc' },
    select: { id: true, amountMinor: true, currency: true, interval: true, stripePriceId: true },
  });

  return precio;
}

export async function catalogList(
  actor: ActorContext,
  filter: { includeArchived?: boolean } = {},
): Promise<UseCaseResult<CatalogRow[]>> {
  const decision = can(actor, 'billing.catalog.manage', { kind: 'CatalogProduct' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = alcance(actor);
  const ahora = new Date();

  const filas = await db().catalogProduct.findMany({
    where: {
      ...(entidades === undefined ? {} : { legalEntityId: { in: [...entidades] } }),
      ...(filter.includeArchived === true ? {} : { archivedAt: null }),
    },
    orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      kind: true,
      billingMode: true,
      isActive: true,
      archivedAt: true,
      authorizingResolutionNote: true,
      legalEntity: { select: { shortName: true } },
      prices: {
        where: {
          effectiveFrom: { lte: ahora },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: ahora } }],
        },
        orderBy: { version: 'desc' },
        take: 1,
        select: { amountMinor: true, currency: true, interval: true },
      },
      _count: { select: { prices: true } },
    },
  });

  return ok(
    filas.map((fila) => {
      const vigente = fila.prices[0];
      return {
        id: fila.id,
        code: fila.code,
        name: fila.name,
        description: fila.description,
        kind: fila.kind,
        billingMode: fila.billingMode,
        legalEntityShortName: fila.legalEntity.shortName,
        isActive: fila.isActive,
        archivedAt: fila.archivedAt,
        currentAmountMinor: vigente?.amountMinor ?? null,
        currentCurrency: vigente?.currency ?? null,
        currentInterval: vigente?.interval ?? null,
        priceVersions: fila._count.prices,
        authorizingResolutionNote: fila.authorizingResolutionNote,
      };
    }),
  );
}

/**
 * Historial de precios de un concepto.
 *
 * Es lo que permite explicar en una asamblea por qué un cobro de marzo fue de
 * una cantidad y el de septiembre de otra.
 */
export async function priceHistory(actor: ActorContext, productId: string): Promise<UseCaseResult<PriceRow[]>> {
  const producto = await db().catalogProduct.findUnique({
    where: { id: productId },
    select: { legalEntityId: true },
  });
  if (producto === null) return fail(errors.notFound('concepto inexistente'));

  const decision = can(actor, 'billing.catalog.manage', {
    kind: 'CatalogPrice',
    legalEntityId: producto.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().catalogPrice.findMany({
    where: { productId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      amountMinor: true,
      currency: true,
      interval: true,
      effectiveFrom: true,
      effectiveTo: true,
      stripePriceId: true,
    },
  });

  return ok(filas);
}

export interface BillableEntity {
  readonly id: string;
  readonly code: string;
  readonly shortName: string;
}

/**
 * Entidades a nombre de las cuales quien mira puede crear conceptos.
 *
 * No se usa `listLegalEntities` del módulo de administración: esa lista exige
 * la facultad de leer el registro institucional, que quien lleva las finanzas
 * de una entidad no tiene por qué tener. Aquí la pregunta es otra —«¿a nombre
 * de quién puedo cobrar?»— y se responde con la facultad que corresponde,
 * comprobada entidad por entidad.
 */
export async function billableEntities(actor: ActorContext): Promise<UseCaseResult<BillableEntity[]>> {
  const decision = can(actor, 'billing.catalog.manage', { kind: 'CatalogProduct' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = await db().legalEntity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, shortName: true },
  });

  return ok(
    entidades.filter(
      (entidad) => can(actor, 'billing.catalog.manage', { kind: 'CatalogProduct', legalEntityId: entidad.id }).allowed,
    ),
  );
}
