import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { ACCOUNT_CODES, type AccountCode } from './ledger';
import { startOfDayInZone } from '@/platform/i18n';

/**
 * Cortes y reportes de rendición de cuentas (PRD §11.5, F3-LIB-004 y F3-LIB-005).
 *
 * Rendir cuentas es un derecho de quien está afiliado, no una concesión de la
 * administración. Por eso el reporte tiene dos lecturas con permisos distintos:
 *
 *  · **Agregada**, para cualquier persona afiliada: totales por cuenta y por
 *    periodo, sin un solo dato de una persona identificable. Es lo que se lleva
 *    a una asamblea.
 *  · **Detallada**, para quien lleva las finanzas y para quien fiscaliza: la
 *    misma información con el desglose que permite auditarla.
 *
 * Una exportación **siempre** deja rastro: quién, cuándo, qué periodo y con qué
 * motivo. Un archivo con los movimientos de dinero de la organización que sale
 * sin dejar constancia es un archivo del que después nadie responde.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface AccountTotal {
  readonly accountCode: string;
  readonly accountLabel: string;
  readonly creditMinor: bigint;
  readonly debitMinor: bigint;
}

export interface AccountabilityReport {
  readonly legalEntityShortName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  readonly totals: readonly AccountTotal[];
  readonly incomeMinor: bigint;
  readonly expenseMinor: bigint;
  readonly netMinor: bigint;
  /** Lo que la organización dejó de cobrar por becas y descuentos. */
  readonly forgoneMinor: bigint;
  readonly paymentsCount: number;
  readonly exemptionsCount: number;
  readonly assetsValueMinor: bigint;
  readonly assetsCount: number;
  /** Cortes del periodo que quedaron con diferencias sin cerrar. */
  readonly openDifferences: number;
}

export const reportSchema = z.object({
  legalEntityId: z.uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Semestres naturales de un año.
 *
 * El PRD contrata cortes semestrales. Se calculan aquí y no se piden a mano
 * para que dos personas que rinden cuentas del mismo semestre estén hablando
 * exactamente del mismo periodo.
 */
export function semesterRange(year: number, half: 1 | 2): { periodStart: string; periodEnd: string } {
  return half === 1
    ? { periodStart: `${String(year)}-01-01`, periodEnd: `${String(year)}-06-30` }
    : { periodStart: `${String(year)}-07-01`, periodEnd: `${String(year)}-12-31` };
}

export async function accountabilityReport(
  actor: ActorContext,
  input: z.input<typeof reportSchema>,
): Promise<UseCaseResult<AccountabilityReport>> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'billing.accountability.read', {
    kind: 'Reconciliation',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const inicio = startOfDayInZone(data.periodStart, actor.timeZone);
  const ultimoDia = startOfDayInZone(data.periodEnd, actor.timeZone);
  if (inicio === null || ultimoDia === null) {
    return fail(errors.validation({ periodStart: ['Las fechas del periodo no son días del calendario.'] }));
  }
  const fin = new Date(ultimoDia.getTime() + 24 * 60 * 60 * 1000);

  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { shortName: true },
  });
  if (entidad === null) return fail(errors.notFound('entidad jurídica inexistente'));

  const enPeriodo = { legalEntityId: data.legalEntityId, entryDate: { gte: inicio, lt: fin } };

  const [porCuenta, cobros, exenciones, bienes, cortesAbiertos] = await Promise.all([
    db().ledgerEntry.groupBy({
      by: ['accountCode', 'direction'],
      where: enPeriodo,
      _sum: { amountMinor: true },
    }),
    db().payment.findMany({
      where: {
        legalEntityId: data.legalEntityId,
        status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        paidAt: { gte: inicio, lt: fin },
      },
      select: {
        amountMinor: true,
        method: true,
        catalogPrice: { select: { amountMinor: true } },
      },
    }),
    db().payment.count({
      where: {
        legalEntityId: data.legalEntityId,
        method: 'EXEMPTION',
        paidAt: { gte: inicio, lt: fin },
      },
    }),
    db().assetRegister.aggregate({
      where: { legalEntityId: data.legalEntityId, status: { not: 'DISPOSED' } },
      _sum: { documentedValueMinor: true },
      _count: true,
    }),
    db().reconciliation.count({
      where: {
        legalEntityId: data.legalEntityId,
        periodStart: { gte: inicio },
        periodEnd: { lte: fin },
        status: 'WITH_DIFFERENCES',
      },
    }),
  ]);

  const acumulado = new Map<string, { creditMinor: bigint; debitMinor: bigint }>();
  for (const grupo of porCuenta) {
    const actual = acumulado.get(grupo.accountCode) ?? { creditMinor: 0n, debitMinor: 0n };
    const suma = grupo._sum.amountMinor ?? 0n;
    acumulado.set(
      grupo.accountCode,
      grupo.direction === 'CREDIT'
        ? { ...actual, creditMinor: actual.creditMinor + suma }
        : { ...actual, debitMinor: actual.debitMinor + suma },
    );
  }

  const totals: AccountTotal[] = [...acumulado.entries()]
    .map(([accountCode, valores]) => ({
      accountCode,
      accountLabel: ACCOUNT_CODES[accountCode as AccountCode] ?? accountCode,
      creditMinor: valores.creditMinor,
      debitMinor: valores.debitMinor,
    }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const incomeMinor = totals.reduce((suma, fila) => suma + fila.creditMinor, 0n);
  const expenseMinor = totals.reduce((suma, fila) => suma + fila.debitMinor, 0n);

  // Lo que se dejó de cobrar: la diferencia entre el precio vigente del
  // concepto y lo que la persona pagó. No está en el libro y no debe estarlo
  // (ADR-0061), pero rendir cuentas sin decirlo escondería el esfuerzo social
  // de la organización, que es justo lo contrario de rendir cuentas.
  const forgoneMinor = cobros.reduce((suma, pago) => {
    const base = pago.catalogPrice?.amountMinor ?? pago.amountMinor;
    const perdonado = base - pago.amountMinor;
    return perdonado > 0n ? suma + perdonado : suma;
  }, 0n);

  return ok({
    legalEntityShortName: entidad.shortName,
    periodStart: inicio,
    periodEnd: fin,
    currency: 'MXN',
    totals,
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    forgoneMinor,
    paymentsCount: cobros.length,
    exemptionsCount: exenciones,
    assetsValueMinor: bienes._sum.documentedValueMinor ?? 0n,
    assetsCount: bienes._count,
    openDifferences: cortesAbiertos,
  });
}

/* -------------------------------------------------------------------------- */
/* Exportaciones                                                              */
/* -------------------------------------------------------------------------- */

export const exportSchema = z.object({
  legalEntityId: z.uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(15, {
    error: () => 'Escribe para qué se exporta. Queda en la bitácora junto a tu nombre y la hora.',
  }).max(400),
});

export interface FinancialExport {
  readonly fileName: string;
  readonly content: string;
  readonly rows: number;
}

/** Escapa un campo para un archivo separado por comas. */
function campo(valor: string | number | bigint | null): string {
  if (valor === null) return '';
  const texto = typeof valor === 'string' ? valor : valor.toString();
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Exporta el libro de un periodo.
 *
 * Devuelve el contenido en vez de escribir un archivo: quien llama decide si lo
 * ofrece como descarga o lo guarda. Lo que **no** es opcional es el asiento de
 * auditoría, que se escribe antes de devolver nada.
 *
 * Los importes salen en unidades menores, como están guardados. Convertirlos a
 * decimales en el archivo reintroduciría la coma flotante en el único sitio
 * donde el dato sale del sistema y ya nadie lo puede comprobar.
 */
export async function exportLedger(
  actor: ActorContext,
  input: z.input<typeof exportSchema>,
): Promise<UseCaseResult<FinancialExport>> {
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'billing.report.export', {
    kind: 'LedgerEntry',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const inicio = startOfDayInZone(data.periodStart, actor.timeZone);
  const ultimoDia = startOfDayInZone(data.periodEnd, actor.timeZone);
  if (inicio === null || ultimoDia === null) {
    return fail(errors.validation({ periodStart: ['Las fechas del periodo no son días del calendario.'] }));
  }
  const fin = new Date(ultimoDia.getTime() + 24 * 60 * 60 * 1000);

  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { code: true, shortName: true },
  });
  if (entidad === null) return fail(errors.notFound('entidad jurídica inexistente'));

  const filas = await db().ledgerEntry.findMany({
    where: { legalEntityId: data.legalEntityId, entryDate: { gte: inicio, lt: fin } },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      entryDate: true,
      direction: true,
      accountCode: true,
      amountMinor: true,
      currency: true,
      sourceKind: true,
      sourceId: true,
      description: true,
      reason: true,
      reversalOfEntryId: true,
      reconciliationId: true,
    },
  });

  const encabezado = [
    'identificador',
    'fecha',
    'sentido',
    'cuenta',
    'cuenta_nombre',
    'importe_unidades_menores',
    'moneda',
    'origen',
    'origen_id',
    'descripcion',
    'motivo',
    'revierte_a',
    'corte',
  ].join(',');

  const cuerpo = filas.map((fila) =>
    [
      campo(fila.id),
      campo(fila.entryDate.toISOString()),
      campo(fila.direction),
      campo(fila.accountCode),
      campo(ACCOUNT_CODES[fila.accountCode as AccountCode] ?? fila.accountCode),
      campo(fila.amountMinor),
      campo(fila.currency),
      campo(fila.sourceKind),
      campo(fila.sourceId),
      campo(fila.description),
      campo(fila.reason),
      campo(fila.reversalOfEntryId),
      campo(fila.reconciliationId),
    ].join(','),
  );

  // La auditoría se escribe **antes** de devolver el archivo. Si se escribiera
  // después, un fallo entre las dos cosas dejaría datos financieros fuera del
  // sistema sin ninguna constancia de que salieron.
  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.FINANCIAL_REPORT_EXPORTED,
      objectKind: 'LedgerEntry',
      objectId: data.legalEntityId,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: {
        periodo: `${data.periodStart} → ${data.periodEnd}`,
        asientos: filas.length,
        motivo: data.reason,
      },
    });
  });

  return ok({
    fileName: `libro-${entidad.code.toLowerCase()}-${data.periodStart}-a-${data.periodEnd}.csv`,
    // Con marca de orden de bytes para que una hoja de cálculo abra los
    // acentos bien en lugar de mostrarlos rotos.
    content: `﻿${encabezado}\n${cuerpo.join('\n')}\n`,
    rows: filas.length,
  });
}
