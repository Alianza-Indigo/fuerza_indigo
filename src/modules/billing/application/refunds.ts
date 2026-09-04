import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { logger } from '@/platform/observability/logger';
import { stripe } from '@/platform/payments/stripe-port';
import { parseAmountToMinor } from '@/platform/i18n';
import { postRefundEntry } from './ledger';
import type { RefundStatus } from '@prisma-client/enums';

/**
 * Devoluciones (PRD §11.3, F3-PAG-010).
 *
 * Devolver dinero es lo contrario de cobrarlo y lleva el mismo doble control,
 * por la misma razón: **quien pide no aprueba**. Con un solo permiso, la
 * persona que tramita devoluciones podría devolverse dinero a sí misma y el
 * libro cuadraría igual.
 *
 * Una devolución tiene dos partes que no hay que confundir: el acuerdo de la
 * organización de devolver, que es lo que se registra aquí, y el movimiento de
 * dinero en la pasarela, que ocurre al aprobarla. Si lo segundo falla, lo
 * primero sigue constando como aprobado y pendiente de ejecutar, en vez de
 * desaparecer.
 */

export const requestRefundSchema = z.object({
  paymentId: z.uuid(),
  /** Vacío significa el total. Se pide explícito para que nadie devuelva de más sin querer. */
  amount: z.string().trim().optional(),
  reason: z.string().trim().min(15, {
    error: () => 'Explica por qué se devuelve: lo va a leer quien la apruebe y quien revise las cuentas.',
  }).max(2000),
});

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Estados de un cobro sobre los que tiene sentido pedir una devolución. */
const DEVOLVIBLES = ['SUCCEEDED', 'PARTIALLY_REFUNDED'] as const;

export async function requestRefund(
  actor: ActorContext,
  input: z.input<typeof requestRefundSchema>,
): Promise<UseCaseResult<{ refundId: string }>> {
  const parsed = requestRefundSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const pago = await db().payment.findUnique({
    where: { id: parsed.data.paymentId },
    select: { id: true, legalEntityId: true, status: true, amountMinor: true, currency: true },
  });
  if (pago === null) return fail(errors.notFound('pago inexistente'));

  const decision = can(actor, 'billing.refund.request', {
    kind: 'Refund',
    legalEntityId: pago.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (!(DEVOLVIBLES as readonly string[]).includes(pago.status)) {
    return fail(
      errors.conflict(
        'Ese cobro no está en un estado que admita devolución.',
        `estado ${pago.status}: solo se devuelve lo que se cobró`,
      ),
    );
  }

  const yaDevuelto = await db().refund.aggregate({
    where: { paymentId: pago.id, status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED'] } },
    _sum: { amountMinor: true },
  });
  const comprometido = yaDevuelto._sum.amountMinor ?? 0n;
  const disponible = pago.amountMinor - comprometido;

  const importe =
    parsed.data.amount === undefined || parsed.data.amount === ''
      ? { ok: true as const, minor: disponible }
      : parseAmountToMinor(parsed.data.amount, pago.currency);

  if (!importe.ok) return fail(errors.validation({ amount: [importe.reason] }));

  if (importe.minor <= 0n) {
    return fail(errors.validation({ amount: ['El importe a devolver tiene que ser mayor que cero.'] }));
  }

  // Devolver más de lo cobrado no es un error de dedo que se pueda corregir
  // después: es dinero que sale y que nadie ingresó.
  if (importe.minor > disponible) {
    return fail(
      errors.ruleViolation(
        'No se puede devolver más de lo que queda por devolver de ese cobro.',
        `solicitud de ${importe.minor.toString()} sobre ${disponible.toString()} disponibles`,
      ),
    );
  }

  const resultado = await transaction(async (tx) => {
    const devolucion = await tx.refund.create({
      data: {
        paymentId: pago.id,
        amountMinor: importe.minor,
        currency: pago.currency,
        reason: parsed.data.reason,
        status: 'REQUESTED',
        requestedById: actor.userId!,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.REFUND_REQUESTED,
      objectKind: 'Refund',
      objectId: devolucion.id,
      outcome: 'SUCCESS',
      legalEntityId: pago.legalEntityId,
      metadata: { pago: pago.id, importe: importe.minor.toString(), moneda: pago.currency },
    });

    return devolucion;
  });

  return ok({ refundId: resultado.id });
}

export const resolveRefundSchema = z.object({
  refundId: z.uuid(),
  note: z.string().trim().max(400).optional(),
});

/**
 * Aprueba una devolución pedida por **otra** persona y la ejecuta.
 *
 * El orden importa: primero se deja constancia de la aprobación, después se
 * mueve el dinero. Al revés, un fallo entre las dos cosas dejaría dinero
 * devuelto sin ninguna autorización que lo explique.
 */
export async function approveRefund(
  actor: ActorContext,
  input: z.infer<typeof resolveRefundSchema>,
): Promise<UseCaseResult<{ refundId: string; status: RefundStatus }>> {
  const parsed = resolveRefundSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const devolucion = await db().refund.findUnique({
    where: { id: parsed.data.refundId },
    select: {
      id: true,
      status: true,
      amountMinor: true,
      currency: true,
      reason: true,
      requestedById: true,
      payment: {
        select: {
          id: true,
          legalEntityId: true,
          stripeAccountKey: true,
          stripePaymentIntentId: true,
          method: true,
          amountMinor: true,
        },
      },
    },
  });
  if (devolucion === null) return fail(errors.notFound('devolución inexistente'));

  const decision = can(actor, 'billing.refund.approve', {
    kind: 'Refund',
    id: devolucion.id,
    legalEntityId: devolucion.payment.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (devolucion.requestedById === actor.userId) {
    return fail(
      errors.ruleViolation(
        'No puedes aprobar una devolución que pediste tú. Tiene que aprobarla otra persona.',
        'doble control: quien pide una devolución no puede aprobarla',
      ),
    );
  }

  if (devolucion.status !== 'REQUESTED') {
    return fail(errors.conflict('Esa devolución ya está resuelta.', `estado ${devolucion.status}`));
  }

  // Primero la autorización, en su propia transacción. Si el movimiento de
  // dinero falla después, la aprobación sigue constando y se puede reintentar;
  // lo que no puede pasar es dinero devuelto sin autorización que lo explique.
  await transaction(async (tx) => {
    await tx.refund.updateMany({
      where: { id: devolucion.id, status: 'REQUESTED' },
      data: { status: 'APPROVED', approvedById: actor.userId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.REFUND_APPROVED,
      objectKind: 'Refund',
      objectId: devolucion.id,
      outcome: 'SUCCESS',
      legalEntityId: devolucion.payment.legalEntityId,
      metadata: {
        importe: devolucion.amountMinor.toString(),
        pedidaPor: devolucion.requestedById,
        nota: parsed.data.note ?? null,
      },
    });
  });

  // Un pago manual no pasó por ninguna pasarela: su devolución también ocurre
  // fuera, y aquí solo consta. Llamar a la pasarela por un cobro que nunca vio
  // devolvería un error confuso en vez de decir la verdad.
  const enLaPasarela = devolucion.payment.stripePaymentIntentId !== null;
  if (!enLaPasarela) {
    await transaction(async (tx) => {
      await tx.refund.update({
        where: { id: devolucion.id },
        data: { status: 'SUCCEEDED', processedAt: new Date() },
      });
      await aplicarAlPago(tx, devolucion.payment.id, devolucion.payment.amountMinor);
      await postRefundEntry(tx, actor, devolucion.id);
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.REFUND_SUCCEEDED,
        objectKind: 'Refund',
        objectId: devolucion.id,
        outcome: 'SUCCESS',
        legalEntityId: devolucion.payment.legalEntityId,
        metadata: { via: 'fuera de la pasarela', importe: devolucion.amountMinor.toString() },
      });
    });
    return ok({ refundId: devolucion.id, status: 'SUCCEEDED' });
  }

  try {
    const ejecutada = await stripe().createRefund({
      account: devolucion.payment.stripeAccountKey,
      paymentIntentId: devolucion.payment.stripePaymentIntentId!,
      amountMinor: devolucion.amountMinor,
      reason: devolucion.reason,
      // Derivada del identificador de la devolución: reintentar la ejecución no
      // devuelve el dinero dos veces.
      idempotencyKey: `refund:${devolucion.id}`,
    });

    await transaction(async (tx) => {
      await tx.refund.update({
        where: { id: devolucion.id },
        data: {
          status: 'SUCCEEDED',
          stripeRefundId: ejecutada.id,
          processedAt: new Date(),
        },
      });
      await aplicarAlPago(tx, devolucion.payment.id, devolucion.payment.amountMinor);
      await postRefundEntry(tx, actor, devolucion.id);
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.REFUND_SUCCEEDED,
        objectKind: 'Refund',
        objectId: devolucion.id,
        outcome: 'SUCCESS',
        legalEntityId: devolucion.payment.legalEntityId,
        metadata: { referencia: ejecutada.id, importe: devolucion.amountMinor.toString() },
      });
    });

    return ok({ refundId: devolucion.id, status: 'SUCCEEDED' });
  } catch (error) {
    logger.error('La pasarela rechazó una devolución aprobada', {
      module: 'billing',
      correlationId: actor.correlationId,
      outcome: 'failed',
      context: { refundId: devolucion.id, error: String(error) },
    });

    await db().refund.update({
      where: { id: devolucion.id },
      data: { status: 'FAILED', rejectedReason: String(error).slice(0, 400) },
    });

    return fail(
      errors.dependencyUnavailable(
        'la pasarela rechazó la devolución',
        'La devolución quedó aprobada pero el dinero no salió. Queda registrada para volver a intentarlo.',
      ),
    );
  }
}

/**
 * Deja el cobro reflejando cuánto se ha devuelto de él.
 *
 * Se recalcula desde la suma de las devoluciones logradas en vez de acumular:
 * un contador que se incrementa se descuadra en cuanto un reintento pasa dos
 * veces, y aquí se reintenta.
 */
async function aplicarAlPago(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  paymentId: string,
  cobrado: bigint,
): Promise<void> {
  const suma = await tx.refund.aggregate({
    where: { paymentId, status: 'SUCCEEDED' },
    _sum: { amountMinor: true },
  });
  const devuelto = suma._sum.amountMinor ?? 0n;

  await tx.payment.update({
    where: { id: paymentId },
    data: { status: devuelto >= cobrado ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
  });
}

export const rejectRefundSchema = z.object({
  refundId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué no se devuelve: lo va a leer quien lo pidió.',
  }).max(400),
});

export async function rejectRefund(
  actor: ActorContext,
  input: z.infer<typeof rejectRefundSchema>,
): Promise<UseCaseResult<{ refundId: string }>> {
  const parsed = rejectRefundSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const devolucion = await db().refund.findUnique({
    where: { id: parsed.data.refundId },
    select: { id: true, status: true, requestedById: true, payment: { select: { legalEntityId: true } } },
  });
  if (devolucion === null) return fail(errors.notFound('devolución inexistente'));

  const decision = can(actor, 'billing.refund.approve', {
    kind: 'Refund',
    id: devolucion.id,
    legalEntityId: devolucion.payment.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (devolucion.requestedById === actor.userId) {
    return fail(
      errors.ruleViolation(
        'No puedes resolver una devolución que pediste tú.',
        'doble control: quien pide una devolución no puede resolverla',
      ),
    );
  }

  if (devolucion.status !== 'REQUESTED') {
    return fail(errors.conflict('Esa devolución ya está resuelta.', `estado ${devolucion.status}`));
  }

  await transaction(async (tx) => {
    await tx.refund.updateMany({
      where: { id: devolucion.id, status: 'REQUESTED' },
      data: { status: 'REJECTED', approvedById: actor.userId, rejectedReason: parsed.data.reason },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.REFUND_REJECTED,
      objectKind: 'Refund',
      objectId: devolucion.id,
      outcome: 'SUCCESS',
      legalEntityId: devolucion.payment.legalEntityId,
      metadata: { motivo: parsed.data.reason, pedidaPor: devolucion.requestedById },
    });
  });

  return ok({ refundId: devolucion.id });
}

export interface RefundRow {
  readonly id: string;
  readonly paymentPublicId: string;
  readonly holder: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly reason: string;
  readonly status: RefundStatus;
  readonly requestedAt: Date;
  readonly requestedBy: string;
  readonly requestedByMe: boolean;
}

/** Devoluciones pendientes y resueltas, para la cartera que las aprueba. */
export async function refundQueue(actor: ActorContext): Promise<UseCaseResult<RefundRow[]>> {
  const decision = can(actor, 'billing.payment.read', { kind: 'Refund' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;

  const filas = await db().refund.findMany({
    where: entidades.length === 0 ? {} : { payment: { legalEntityId: { in: [...entidades] } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      reason: true,
      status: true,
      createdAt: true,
      requestedById: true,
      requestedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
      payment: {
        select: {
          publicId: true,
          billingAccount: {
            select: {
              person: { select: { givenName: true, familyName: true } },
              organization: { select: { legalName: true } },
            },
          },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      paymentPublicId: fila.payment.publicId,
      holder:
        fila.payment.billingAccount.person === null
          ? (fila.payment.billingAccount.organization?.legalName ?? 'Sin titular')
          : `${fila.payment.billingAccount.person.givenName} ${fila.payment.billingAccount.person.familyName}`,
      amountMinor: fila.amountMinor,
      currency: fila.currency,
      reason: fila.reason,
      status: fila.status,
      requestedAt: fila.createdAt,
      requestedBy:
        fila.requestedBy.person === null
          ? 'Persona no identificada'
          : `${fila.requestedBy.person.givenName} ${fila.requestedBy.person.familyName}`,
      requestedByMe: fila.requestedById === actor.userId,
    })),
  );
}
