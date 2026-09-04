import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { PaymentStatus, SubscriptionStatus } from '@prisma-client/enums';

/**
 * Lo que una persona ve de sus propios pagos (PRD §11, F3-UI-001).
 *
 * Todo lo de aquí se acota por `personId` de la sesión **en la consulta**, no
 * después de traerlo. Filtrar en memoria significa que la fila ajena llegó a
 * salir de la base, y basta un descuido en el mapeo para que llegue también a
 * la pantalla.
 */

export interface OwnPaymentRow {
  readonly publicId: string;
  readonly concept: string;
  readonly legalEntityShortName: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly method: string;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

export interface OwnSubscriptionRow {
  readonly id: string;
  readonly concept: string;
  readonly legalEntityId: string;
  readonly legalEntityShortName: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly interval: string | null;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: Date;
  readonly gracePeriodEndsAt: Date | null;
  readonly gracePeriodDays: number;
  readonly cancelAtPeriodEnd: boolean;
}

function titular(actor: ActorContext): string | null {
  return actor.personId;
}

export async function ownPayments(actor: ActorContext): Promise<UseCaseResult<OwnPaymentRow[]>> {
  const personId = titular(actor);
  if (personId === null) return ok([]);

  const decision = can(actor, 'billing.payment.read_own', { kind: 'Payment' }, { hasLiveAssignment: () => true });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().payment.findMany({
    where: { billingAccount: { personId, holderKind: 'PERSON' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      publicId: true,
      amountMinor: true,
      currency: true,
      status: true,
      method: true,
      createdAt: true,
      paidAt: true,
      legalEntity: { select: { shortName: true } },
      catalogPrice: { select: { product: { select: { name: true } } } },
    },
  });

  return ok(
    filas.map((fila) => ({
      publicId: fila.publicId,
      // Un pago manual o un ajuste pueden no venir de un concepto del catálogo.
      // Decir «Cobro» es honesto; inventar un nombre no lo sería.
      concept: fila.catalogPrice?.product.name ?? 'Cobro',
      legalEntityShortName: fila.legalEntity.shortName,
      amountMinor: fila.amountMinor,
      currency: fila.currency,
      status: fila.status,
      method: fila.method,
      createdAt: fila.createdAt,
      paidAt: fila.paidAt,
    })),
  );
}

/** Un pago concreto de la persona, por su identificador público. */
export async function ownPayment(actor: ActorContext, publicId: string): Promise<UseCaseResult<OwnPaymentRow>> {
  const personId = titular(actor);
  if (personId === null) return fail(errors.notFound('actor sin persona'));

  const decision = can(actor, 'billing.payment.read_own', { kind: 'Payment' }, { hasLiveAssignment: () => true });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fila = await db().payment.findFirst({
    // La titularidad va en el `where`: un pago ajeno no se encuentra, en vez de
    // encontrarse y descartarse después.
    where: { publicId, billingAccount: { personId, holderKind: 'PERSON' } },
    select: {
      publicId: true,
      amountMinor: true,
      currency: true,
      status: true,
      method: true,
      createdAt: true,
      paidAt: true,
      legalEntity: { select: { shortName: true } },
      catalogPrice: { select: { product: { select: { name: true } } } },
    },
  });

  if (fila === null) return fail(errors.notFound('pago inexistente o de otra persona'));

  return ok({
    publicId: fila.publicId,
    concept: fila.catalogPrice?.product.name ?? 'Cobro',
    legalEntityShortName: fila.legalEntity.shortName,
    amountMinor: fila.amountMinor,
    currency: fila.currency,
    status: fila.status,
    method: fila.method,
    createdAt: fila.createdAt,
    paidAt: fila.paidAt,
  });
}

export async function ownSubscriptions(actor: ActorContext): Promise<UseCaseResult<OwnSubscriptionRow[]>> {
  const personId = titular(actor);
  if (personId === null) return ok([]);

  const decision = can(actor, 'billing.payment.read_own', { kind: 'Subscription' }, { hasLiveAssignment: () => true });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().subscription.findMany({
    where: { billingAccount: { personId, holderKind: 'PERSON' } },
    orderBy: { currentPeriodEnd: 'desc' },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      gracePeriodEndsAt: true,
      cancelAtPeriodEnd: true,
      billingAccount: { select: { legalEntityId: true, legalEntity: { select: { shortName: true } } } },
      catalogPrice: {
        select: {
          amountMinor: true,
          currency: true,
          interval: true,
          product: { select: { name: true, gracePeriodDays: true } },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      concept: fila.catalogPrice.product.name,
      legalEntityId: fila.billingAccount.legalEntityId,
      legalEntityShortName: fila.billingAccount.legalEntity.shortName,
      amountMinor: fila.catalogPrice.amountMinor,
      currency: fila.catalogPrice.currency,
      interval: fila.catalogPrice.interval,
      status: fila.status,
      currentPeriodEnd: fila.currentPeriodEnd,
      gracePeriodEndsAt: fila.gracePeriodEndsAt,
      gracePeriodDays: fila.catalogPrice.product.gracePeriodDays,
      cancelAtPeriodEnd: fila.cancelAtPeriodEnd,
    })),
  );
}

export interface PayableRow {
  readonly productId: string;
  readonly name: string;
  readonly description: string;
  readonly legalEntityShortName: string;
  readonly billingMode: 'ONE_TIME' | 'RECURRING';
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly interval: string | null;
  readonly gracePeriodDays: number;
}

/**
 * Lo que una persona puede pagar hoy.
 *
 * Solo conceptos vigentes **con precio vigente**: un concepto sin importe no se
 * ofrece, porque ofrecerlo llevaría a una página de pago que no puede decir
 * cuánto cuesta. Y solo de las entidades donde tiene nombramiento, que es lo
 * que su alcance ya acota.
 */
export async function payableCatalog(actor: ActorContext): Promise<UseCaseResult<PayableRow[]>> {
  if (actor.personId === null) return ok([]);

  const ahora = new Date();
  const alcance = actor.legalEntityScope;

  // Sin alcance de entidad no hay nada que ofrecer: un nombramiento sin entidad
  // no alcanza ninguna (docs/PERMISSIONS.md §6).
  if (alcance.length === 0) return ok([]);

  const permitidas = alcance.filter(
    (legalEntityId) =>
      can(
        actor,
        'billing.checkout.start',
        { kind: 'CatalogProduct', legalEntityId },
        { hasLiveAssignment: () => true },
      ).allowed,
  );
  if (permitidas.length === 0) return ok([]);

  const filas = await db().catalogProduct.findMany({
    where: {
      legalEntityId: { in: permitidas },
      archivedAt: null,
      isActive: true,
      prices: { some: { effectiveFrom: { lte: ahora }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: ahora } }] } },
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      billingMode: true,
      gracePeriodDays: true,
      legalEntity: { select: { shortName: true } },
      prices: {
        where: { effectiveFrom: { lte: ahora }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: ahora } }] },
        orderBy: { version: 'desc' },
        take: 1,
        select: { amountMinor: true, currency: true, interval: true },
      },
    },
  });

  return ok(
    filas.flatMap((fila) => {
      const precio = fila.prices[0];
      if (precio === undefined) return [];
      return [
        {
          productId: fila.id,
          name: fila.name,
          description: fila.description,
          legalEntityShortName: fila.legalEntity.shortName,
          billingMode: fila.billingMode,
          amountMinor: precio.amountMinor,
          currency: precio.currency,
          interval: precio.interval,
          gracePeriodDays: fila.gracePeriodDays,
        },
      ];
    }),
  );
}
