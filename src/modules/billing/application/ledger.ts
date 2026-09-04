import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { parseAmountToMinor } from '@/platform/i18n';
import type { LedgerDirection, LedgerSourceKind } from '@prisma-client/enums';

/**
 * Libro auxiliar inmutable (PRD §11.5, F3-LIB-001).
 *
 * Un asiento no se edita ni se borra: la base no lo permite. La migración de
 * esta fase le revocó a la aplicación `UPDATE` y `DELETE` sobre `ledger_entry`
 * y solo le devolvió la columna que enlaza con el corte de conciliación, que no
 * altera el hecho asentado. No es una convención que alguien pueda saltarse con
 * una consulta directa: es el motor.
 *
 * **Una corrección es un asiento nuevo.** El de reversión apunta al original y
 * lleva su motivo. Así, quien lea el libro dentro de un año ve el error y su
 * corrección, en vez de un libro limpio que no explica por qué los totales de
 * marzo cambiaron en septiembre.
 *
 * **Un asiento no se puede revertir dos veces.** La columna que apunta al
 * original es única, así que el segundo intento choca contra el índice. Vuelve a
 * ser el motor y no una comprobación que se pueda olvidar.
 *
 * El catálogo de cuentas es auxiliar e interno. No pretende ser un plan contable
 * autorizado: la plataforma vincula comprobantes, no sustituye a un sistema
 * contable (PRD §26).
 */

/**
 * Cuentas del catálogo auxiliar.
 *
 * Es una lista cerrada y no texto libre. Con texto libre, «CUOTAS» y
 * «Cuotas sindicales» acabarían siendo dos cuentas distintas en el mismo
 * reporte, y nadie sabría cuál sumar.
 */
export const ACCOUNT_CODES = {
  INGRESO_CUOTAS: 'Cuotas sindicales',
  INGRESO_INSCRIPCION: 'Inscripciones',
  INGRESO_SERVICIOS: 'Servicios y programas',
  INGRESO_DONATIVOS: 'Donativos',
  INGRESO_OTROS: 'Otros ingresos',
  EGRESO_DEVOLUCIONES: 'Devoluciones a personas',
  EGRESO_COMISIONES: 'Comisiones de la pasarela',
  EGRESO_OPERACION: 'Gastos de operación',
  PATRIMONIO_ALTA: 'Altas de patrimonio',
  PATRIMONIO_BAJA: 'Bajas de patrimonio',
  AJUSTE: 'Ajuste',
} as const;

export type AccountCode = keyof typeof ACCOUNT_CODES;

/** Qué cuenta corresponde a cada tipo de concepto del catálogo. */
const CUENTA_POR_CONCEPTO: Record<string, AccountCode> = {
  ENROLLMENT_FEE: 'INGRESO_INSCRIPCION',
  UNION_DUE_ORDINARY: 'INGRESO_CUOTAS',
  UNION_DUE_EXTRAORDINARY: 'INGRESO_CUOTAS',
  HONORARY_MEMBERSHIP: 'INGRESO_CUOTAS',
  SERVICE_SUBSCRIPTION: 'INGRESO_SERVICIOS',
  COURSE: 'INGRESO_SERVICIOS',
  CIAN_SERVICE: 'INGRESO_SERVICIOS',
  CENI_PROGRAM: 'INGRESO_SERVICIOS',
  CENI_ASSESSMENT: 'INGRESO_SERVICIOS',
  CENI_CERTIFICATION: 'INGRESO_SERVICIOS',
  RENEWAL: 'INGRESO_CUOTAS',
  DONATION: 'INGRESO_DONATIVOS',
};

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface PostEntryInput {
  readonly legalEntityId: string;
  readonly entryDate: Date;
  readonly direction: LedgerDirection;
  readonly accountCode: AccountCode;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly sourceKind: LedgerSourceKind;
  readonly sourceId: string;
  readonly description: string;
  readonly reason?: string;
}

/**
 * Asienta un movimiento. Es la única puerta de escritura del libro.
 *
 * Se llama desde dentro de la transacción del hecho que lo origina —el pago
 * confirmado, la devolución ejecutada, el movimiento de patrimonio— para que no
 * pueda existir un cobro sin su asiento ni un asiento sin su cobro.
 */
export async function postEntry(
  tx: Tx,
  actor: ActorContext,
  input: PostEntryInput,
): Promise<{ id: string }> {
  if (input.amountMinor <= 0n) {
    // El sentido lo dice `direction`, no el signo. Un importe negativo con
    // dirección de ingreso sería un asiento que dice dos cosas a la vez.
    throw new Error('Un asiento del libro lleva importe positivo; el sentido lo dice su dirección.');
  }

  return tx.ledgerEntry.create({
    data: {
      legalEntityId: input.legalEntityId,
      entryDate: input.entryDate,
      direction: input.direction,
      accountCode: input.accountCode,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      description: input.description.slice(0, 400),
      reason: input.reason ?? null,
      createdByActorId: actor.actorId,
    },
    select: { id: true },
  });
}

/**
 * Asienta el ingreso de un pago confirmado, una sola vez.
 *
 * La idempotencia se apoya en el par origen–identificador: si ya hay un asiento
 * de ese pago, no se crea otro. Es lo que permite llamarlo desde el manejador
 * de un webhook que la pasarela puede reenviar.
 */
export async function postPaymentEntry(tx: Tx, actor: ActorContext, paymentId: string): Promise<boolean> {
  const yaAsentado = await tx.ledgerEntry.findFirst({
    where: { sourceKind: 'PAYMENT', sourceId: paymentId },
    select: { id: true },
  });
  if (yaAsentado !== null) return false;

  // Una exención no llega aquí: su importe es cero y el libro registra
  // movimientos de dinero. Lo que se dejó de cobrar se informa aparte,
  // comparando el precio vigente con lo cobrado.
  const pago = await tx.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      legalEntityId: true,
      amountMinor: true,
      currency: true,
      paidAt: true,
      publicId: true,
      catalogPrice: { select: { product: { select: { kind: true, name: true } } } },
    },
  });
  if (pago === null || pago.amountMinor <= 0n) return false;

  const cuenta = CUENTA_POR_CONCEPTO[pago.catalogPrice?.product.kind ?? ''] ?? 'INGRESO_OTROS';

  await postEntry(tx, actor, {
    legalEntityId: pago.legalEntityId,
    entryDate: pago.paidAt ?? new Date(),
    direction: 'CREDIT',
    accountCode: cuenta,
    amountMinor: pago.amountMinor,
    currency: pago.currency,
    sourceKind: 'PAYMENT',
    sourceId: pago.id,
    description: `${pago.catalogPrice?.product.name ?? 'Cobro'} · ${pago.publicId}`,
  });

  return true;
}

/** Asienta la salida de una devolución ejecutada, una sola vez. */
export async function postRefundEntry(tx: Tx, actor: ActorContext, refundId: string): Promise<boolean> {
  const yaAsentado = await tx.ledgerEntry.findFirst({
    where: { sourceKind: 'REFUND', sourceId: refundId },
    select: { id: true },
  });
  if (yaAsentado !== null) return false;

  const devolucion = await tx.refund.findUnique({
    where: { id: refundId },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      processedAt: true,
      payment: { select: { legalEntityId: true, publicId: true } },
    },
  });
  if (devolucion === null || devolucion.amountMinor <= 0n) return false;

  await postEntry(tx, actor, {
    legalEntityId: devolucion.payment.legalEntityId,
    entryDate: devolucion.processedAt ?? new Date(),
    direction: 'DEBIT',
    accountCode: 'EGRESO_DEVOLUCIONES',
    amountMinor: devolucion.amountMinor,
    currency: devolucion.currency,
    sourceKind: 'REFUND',
    sourceId: devolucion.id,
    description: `Devolución del cobro ${devolucion.payment.publicId}`,
  });

  return true;
}

/* -------------------------------------------------------------------------- */
/* Ajustes y reversiones                                                      */
/* -------------------------------------------------------------------------- */

export const postAdjustmentSchema = z.object({
  legalEntityId: z.uuid(),
  entryDate: z.coerce.date(),
  direction: z.enum(['DEBIT', 'CREDIT'] as const),
  accountCode: z.enum(Object.keys(ACCOUNT_CODES) as [AccountCode, ...AccountCode[]]),
  amount: z.string().trim().min(1),
  currency: z.enum(['MXN', 'USD'] as const),
  description: z.string().trim().min(10).max(400),
  reason: z.string().trim().min(15, {
    error: () => 'Un ajuste sin motivo escrito es un descuadre disfrazado. Explica de dónde sale.',
  }).max(600),
});

export async function postAdjustment(
  actor: ActorContext,
  input: z.input<typeof postAdjustmentSchema>,
): Promise<UseCaseResult<{ entryId: string }>> {
  const parsed = postAdjustmentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'billing.ledger.adjust', {
    kind: 'LedgerEntry',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const importe = parseAmountToMinor(data.amount, data.currency);
  if (!importe.ok) return fail(errors.validation({ amount: [importe.reason] }));
  if (importe.minor <= 0n) return fail(errors.validation({ amount: ['El importe tiene que ser mayor que cero.'] }));

  const resultado = await transaction(async (tx) => {
    const asiento = await postEntry(tx, actor, {
      legalEntityId: data.legalEntityId,
      entryDate: data.entryDate,
      direction: data.direction,
      accountCode: data.accountCode,
      amountMinor: importe.minor,
      currency: data.currency,
      sourceKind: 'MANUAL_ADJUSTMENT',
      // Un ajuste no nace de otra fila: se apunta a sí mismo a través de su
      // propio identificador, que se conoce después de crearlo. Se usa el de la
      // entidad para que el par origen–identificador siga siendo consultable.
      sourceId: data.legalEntityId,
      description: data.description,
      reason: data.reason,
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.LEDGER_ADJUSTMENT_POSTED,
      objectKind: 'LedgerEntry',
      objectId: asiento.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: {
        cuenta: data.accountCode,
        direccion: data.direction,
        importe: importe.minor.toString(),
        motivo: data.reason,
      },
    });

    return asiento;
  });

  return ok({ entryId: resultado.id });
}

export const reverseEntrySchema = z.object({
  entryId: z.uuid(),
  reason: z.string().trim().min(15, {
    error: () => 'Explica qué estaba mal en el asiento original. Es lo que va a leer quien revise las cuentas.',
  }).max(600),
});

/**
 * Revierte un asiento con otro asiento.
 *
 * El original no se toca —no se puede—, y el nuevo lleva la dirección
 * contraria, el mismo importe y un enlace al que corrige.
 */
export async function reverseEntry(
  actor: ActorContext,
  input: z.infer<typeof reverseEntrySchema>,
): Promise<UseCaseResult<{ entryId: string }>> {
  const parsed = reverseEntrySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const original = await db().ledgerEntry.findUnique({
    where: { id: parsed.data.entryId },
    select: {
      id: true,
      legalEntityId: true,
      direction: true,
      accountCode: true,
      amountMinor: true,
      currency: true,
      entryDate: true,
      description: true,
      reconciliationId: true,
    },
  });
  if (original === null) return fail(errors.notFound('asiento inexistente'));

  const decision = can(actor, 'billing.ledger.adjust', {
    kind: 'LedgerEntry',
    id: original.id,
    legalEntityId: original.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Un asiento de un periodo ya cerrado no se revierte dentro de ese periodo:
  // el corte cerrado es un hecho con firma. La corrección va al periodo abierto.
  if (original.reconciliationId !== null) {
    const corte = await db().reconciliation.findUnique({
      where: { id: original.reconciliationId },
      select: { status: true },
    });
    if (corte?.status === 'CLOSED') {
      return fail(
        errors.ruleViolation(
          'Ese asiento pertenece a un corte ya cerrado. La corrección tiene que asentarse en el periodo abierto.',
          'reversión dentro de un corte de conciliación cerrado',
        ),
      );
    }
  }

  try {
    const resultado = await transaction(async (tx) => {
      const reversion = await tx.ledgerEntry.create({
        data: {
          legalEntityId: original.legalEntityId,
          entryDate: new Date(),
          direction: original.direction === 'CREDIT' ? 'DEBIT' : 'CREDIT',
          accountCode: original.accountCode,
          amountMinor: original.amountMinor,
          currency: original.currency,
          sourceKind: 'MANUAL_ADJUSTMENT',
          sourceId: original.id,
          description: `Reversión de: ${original.description}`.slice(0, 400),
          reason: parsed.data.reason,
          createdByActorId: actor.actorId,
          reversalOfEntryId: original.id,
        },
        select: { id: true },
      });

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.LEDGER_ENTRY_REVERSED,
        objectKind: 'LedgerEntry',
        objectId: reversion.id,
        outcome: 'SUCCESS',
        legalEntityId: original.legalEntityId,
        metadata: { revierte: original.id, motivo: parsed.data.reason, importe: original.amountMinor.toString() },
      });

      return reversion;
    });

    return ok({ entryId: resultado.id });
  } catch (error) {
    // El enlace al original es único: revertir dos veces choca contra el
    // índice. La comprobación vive en el motor y no en una consulta previa,
    // que dos peticiones simultáneas podrían pasar a la vez.
    const yaRevertido =
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
    if (yaRevertido) {
      return fail(
        errors.conflict(
          'Ese asiento ya está revertido. Revertirlo dos veces duplicaría la corrección.',
          'reversión duplicada',
        ),
      );
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                    */
/* -------------------------------------------------------------------------- */

export interface LedgerRow {
  readonly id: string;
  readonly entryDate: Date;
  readonly direction: LedgerDirection;
  readonly accountCode: string;
  readonly accountLabel: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly description: string;
  readonly reason: string | null;
  readonly sourceKind: LedgerSourceKind;
  readonly legalEntityShortName: string;
  readonly reversed: boolean;
  readonly isReversal: boolean;
  readonly reconciled: boolean;
}

export interface LedgerTotals {
  readonly creditMinor: bigint;
  readonly debitMinor: bigint;
  readonly netMinor: bigint;
}

export async function ledgerEntries(
  actor: ActorContext,
  filter: { from?: Date; to?: Date; legalEntityId?: string } = {},
): Promise<UseCaseResult<{ rows: LedgerRow[]; totals: LedgerTotals }>> {
  const decision = can(actor, 'billing.ledger.read', {
    kind: 'LedgerEntry',
    ...(filter.legalEntityId === undefined ? {} : { legalEntityId: filter.legalEntityId }),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;
  const where = {
    ...(filter.legalEntityId !== undefined
      ? { legalEntityId: filter.legalEntityId }
      : entidades.length === 0
        ? {}
        : { legalEntityId: { in: [...entidades] } }),
    ...(filter.from === undefined && filter.to === undefined
      ? {}
      : {
          entryDate: {
            ...(filter.from === undefined ? {} : { gte: filter.from }),
            ...(filter.to === undefined ? {} : { lt: filter.to }),
          },
        }),
  };

  const filas = await db().ledgerEntry.findMany({
    where,
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      entryDate: true,
      direction: true,
      accountCode: true,
      amountMinor: true,
      currency: true,
      description: true,
      reason: true,
      sourceKind: true,
      reconciliationId: true,
      reversalOfEntryId: true,
      legalEntity: { select: { shortName: true } },
      reversedBy: { select: { id: true } },
    },
  });

  // Los totales se calculan sobre **todo** el periodo, no sobre la página que
  // se muestra: un total que solo suma lo visible es un total falso.
  const [creditos, debitos] = await Promise.all([
    db().ledgerEntry.aggregate({ where: { ...where, direction: 'CREDIT' }, _sum: { amountMinor: true } }),
    db().ledgerEntry.aggregate({ where: { ...where, direction: 'DEBIT' }, _sum: { amountMinor: true } }),
  ]);

  const creditMinor = creditos._sum.amountMinor ?? 0n;
  const debitMinor = debitos._sum.amountMinor ?? 0n;

  return ok({
    rows: filas.map((fila) => ({
      id: fila.id,
      entryDate: fila.entryDate,
      direction: fila.direction,
      accountCode: fila.accountCode,
      accountLabel: ACCOUNT_CODES[fila.accountCode as AccountCode] ?? fila.accountCode,
      amountMinor: fila.amountMinor,
      currency: fila.currency,
      description: fila.description,
      reason: fila.reason,
      sourceKind: fila.sourceKind,
      legalEntityShortName: fila.legalEntity.shortName,
      reversed: fila.reversedBy !== null,
      isReversal: fila.reversalOfEntryId !== null,
      reconciled: fila.reconciliationId !== null,
    })),
    totals: { creditMinor, debitMinor, netMinor: creditMinor - debitMinor },
  });
}
