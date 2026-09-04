import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { accountForLegalEntity } from '@/platform/payments/accounts';
import { startOfDayInZone } from '@/platform/i18n';
import type { ReconciliationExceptionKind, ReconciliationStatus, StripeAccountKey } from '@prisma-client/enums';

/**
 * Conciliación por entidad y periodo (PRD §11.5, F3-LIB-002).
 *
 * Conciliar es responder a una pregunta incómoda: ¿lo que el libro dice que
 * entró es lo mismo que la pasarela confirmó? Cuando no lo es, el corte **no
 * redondea la diferencia ni la esconde**: la nombra, una excepción por cada
 * cosa que no cuadra, con su referencia y su importe.
 *
 * Lo que se compara:
 *
 *  · **Lo esperado**: la suma de los asientos del libro en el periodo.
 *  · **Lo observado**: la suma de los cobros que la pasarela confirmó en ese
 *    mismo periodo, para esa misma cuenta.
 *
 * Un corte cerrado es un hecho con firma y fecha. Después de cerrarlo, un
 * asiento de ese periodo ya no se revierte dentro de él: la corrección va al
 * periodo abierto, que es como se corrige un libro que no se puede reescribir.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const runReconciliationSchema = z.object({
  legalEntityId: z.uuid(),
  /** Días del calendario. Se interpretan en la zona de quien concilia (ADR-0051). */
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'Elige el día en que empieza el periodo.' }),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'Elige el día en que termina el periodo.' }),
});

export interface ReconciliationResult {
  readonly reconciliationId: string;
  readonly status: ReconciliationStatus;
  readonly expectedTotalMinor: bigint;
  readonly observedTotalMinor: bigint;
  readonly differenceMinor: bigint;
  readonly exceptions: number;
}

/**
 * Corre un corte y deja registradas sus diferencias.
 *
 * Es idempotente por periodo: volver a correrlo sobre el mismo rango actualiza
 * el corte abierto en vez de crear otro. Correr dos veces la misma conciliación
 * y obtener dos cortes distintos haría imposible saber cuál vale.
 */
export async function runReconciliation(
  actor: ActorContext,
  input: z.input<typeof runReconciliationSchema>,
): Promise<UseCaseResult<ReconciliationResult>> {
  const parsed = runReconciliationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'billing.reconciliation.close', {
    kind: 'Reconciliation',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const inicio = startOfDayInZone(data.periodStart, actor.timeZone);
  const finDelDia = startOfDayInZone(data.periodEnd, actor.timeZone);
  if (inicio === null || finDelDia === null) {
    return fail(errors.validation({ periodStart: ['Las fechas del periodo no son días del calendario.'] }));
  }

  // El periodo incluye el último día completo: quien pide del 1 al 31 espera
  // que el 31 cuente entero, no hasta su medianoche.
  const fin = new Date(finDelDia.getTime() + 24 * 60 * 60 * 1000);
  if (fin.getTime() <= inicio.getTime()) {
    return fail(errors.validation({ periodEnd: ['El periodo termina antes de empezar.'] }));
  }

  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { id: true, code: true },
  });
  if (entidad === null) return fail(errors.notFound('entidad jurídica inexistente'));

  const cuenta = accountForLegalEntity(entidad.code);
  if (cuenta === null) {
    return fail(errors.dependencyUnavailable(`entidad ${entidad.code} sin cuenta de cobro asignada`));
  }

  const existente = await db().reconciliation.findUnique({
    where: {
      legalEntityId_stripeAccountKey_periodStart_periodEnd: {
        legalEntityId: data.legalEntityId,
        stripeAccountKey: cuenta,
        periodStart: inicio,
        periodEnd: fin,
      },
    },
    select: { id: true, status: true },
  });

  if (existente?.status === 'CLOSED') {
    return fail(
      errors.conflict(
        'Ese periodo ya está cerrado. Un corte cerrado no se vuelve a correr.',
        'intento de reconciliar un periodo cerrado',
      ),
    );
  }

  const resultado = await transaction(async (tx) => {
    // Lo que el libro dice: ingresos menos salidas del periodo.
    const [creditos, debitos] = await Promise.all([
      tx.ledgerEntry.aggregate({
        where: { legalEntityId: data.legalEntityId, direction: 'CREDIT', entryDate: { gte: inicio, lt: fin } },
        _sum: { amountMinor: true },
      }),
      tx.ledgerEntry.aggregate({
        where: { legalEntityId: data.legalEntityId, direction: 'DEBIT', entryDate: { gte: inicio, lt: fin } },
        _sum: { amountMinor: true },
      }),
    ]);
    const esperado = (creditos._sum.amountMinor ?? 0n) - (debitos._sum.amountMinor ?? 0n);

    // Lo que la pasarela confirmó, y lo que devolvió.
    const [cobrado, devuelto] = await Promise.all([
      tx.payment.aggregate({
        where: {
          legalEntityId: data.legalEntityId,
          stripeAccountKey: cuenta,
          status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
          paidAt: { gte: inicio, lt: fin },
        },
        _sum: { amountMinor: true },
      }),
      tx.refund.aggregate({
        where: {
          status: 'SUCCEEDED',
          processedAt: { gte: inicio, lt: fin },
          payment: { legalEntityId: data.legalEntityId, stripeAccountKey: cuenta },
        },
        _sum: { amountMinor: true },
      }),
    ]);
    const observado = (cobrado._sum.amountMinor ?? 0n) - (devuelto._sum.amountMinor ?? 0n);

    const diferencia = observado - esperado;

    const corte =
      existente === null
        ? await tx.reconciliation.create({
            data: {
              legalEntityId: data.legalEntityId,
              stripeAccountKey: cuenta,
              periodStart: inicio,
              periodEnd: fin,
              expectedTotalMinor: esperado,
              observedTotalMinor: observado,
              differenceMinor: diferencia,
              status: diferencia === 0n ? 'BALANCED' : 'WITH_DIFFERENCES',
              createdByActorId: actor.actorId,
            },
            select: { id: true },
          })
        : await tx.reconciliation.update({
            where: { id: existente.id },
            data: {
              expectedTotalMinor: esperado,
              observedTotalMinor: observado,
              differenceMinor: diferencia,
              status: diferencia === 0n ? 'BALANCED' : 'WITH_DIFFERENCES',
            },
            select: { id: true },
          });

    // Las excepciones se recalculan enteras: conservarlas acumularía las de
    // corridas anteriores y el corte diría que hay diferencias ya resueltas.
    await tx.reconciliationException.deleteMany({ where: { reconciliationId: corte.id, resolvedAt: null } });

    const excepciones: {
      kind: ReconciliationExceptionKind;
      reference: string;
      amountMinor: bigint;
      detail: string;
    }[] = [];

    // Cobros confirmados sin su asiento en el libro.
    const sinAsiento = await tx.payment.findMany({
      where: {
        legalEntityId: data.legalEntityId,
        stripeAccountKey: cuenta,
        status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
        paidAt: { gte: inicio, lt: fin },
        amountMinor: { gt: 0 },
      },
      select: { id: true, publicId: true, amountMinor: true },
    });
    for (const pago of sinAsiento) {
      const asiento = await tx.ledgerEntry.findFirst({
        where: { sourceKind: 'PAYMENT', sourceId: pago.id },
        select: { id: true },
      });
      if (asiento === null) {
        excepciones.push({
          kind: 'UNMATCHED_IN_LEDGER',
          reference: pago.publicId,
          amountMinor: pago.amountMinor,
          detail: 'La pasarela confirmó este cobro y el libro no tiene su asiento.',
        });
      }
    }

    // Eventos de la pasarela que quedaron sin procesar en el periodo: cada uno
    // puede ser dinero que entró y que el sistema no supo dónde poner.
    const sinProcesar = await tx.stripeWebhookEvent.findMany({
      where: {
        stripeAccountKey: cuenta,
        receivedAt: { gte: inicio, lt: fin },
        processingStatus: { in: ['UNRECONCILED', 'FAILED', 'RECEIVED', 'PROCESSING'] },
      },
      select: { stripeEventId: true, eventType: true, processingStatus: true },
      take: 200,
    });
    for (const evento of sinProcesar) {
      excepciones.push({
        kind: 'UNPROCESSED_EVENT',
        reference: evento.stripeEventId,
        amountMinor: 0n,
        detail: `Evento ${evento.eventType} en estado ${evento.processingStatus}.`,
      });
    }

    // La diferencia que quede sin explicar por lo anterior se nombra igual: no
    // se redondea ni se deja fuera del corte.
    const explicado = excepciones
      .filter((excepcion) => excepcion.kind === 'UNMATCHED_IN_LEDGER')
      .reduce((suma, excepcion) => suma + excepcion.amountMinor, 0n);
    const sinExplicar = diferencia - explicado;
    if (sinExplicar !== 0n) {
      excepciones.push({
        kind: 'AMOUNT_MISMATCH',
        reference: `${data.periodStart}/${data.periodEnd}`,
        amountMinor: sinExplicar < 0n ? -sinExplicar : sinExplicar,
        detail:
          sinExplicar > 0n
            ? 'La pasarela confirmó más de lo que el libro registra, y no lo explica ningún cobro sin asiento.'
            : 'El libro registra más de lo que la pasarela confirma.',
      });
    }

    if (excepciones.length > 0) {
      await tx.reconciliationException.createMany({
        data: excepciones.map((excepcion) => ({ ...excepcion, reconciliationId: corte.id })),
      });
    }

    // Los asientos del periodo quedan enlazados al corte. Es lo único que la
    // aplicación puede actualizar de un asiento, y no altera el hecho asentado.
    await tx.ledgerEntry.updateMany({
      where: {
        legalEntityId: data.legalEntityId,
        entryDate: { gte: inicio, lt: fin },
        reconciliationId: null,
      },
      data: { reconciliationId: corte.id },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.RECONCILIATION_OPENED,
      objectKind: 'Reconciliation',
      objectId: corte.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: {
        periodo: `${data.periodStart} → ${data.periodEnd}`,
        esperado: esperado.toString(),
        observado: observado.toString(),
        diferencia: diferencia.toString(),
        excepciones: excepciones.length,
      },
    });

    return {
      reconciliationId: corte.id,
      status: diferencia === 0n ? ('BALANCED' as const) : ('WITH_DIFFERENCES' as const),
      expectedTotalMinor: esperado,
      observedTotalMinor: observado,
      differenceMinor: diferencia,
      exceptions: excepciones.length,
    };
  });

  return ok(resultado);
}

export const closeReconciliationSchema = z.object({
  reconciliationId: z.uuid(),
  note: z.string().trim().max(600).optional(),
});

/**
 * Cierra un corte.
 *
 * Un corte con diferencias **sí** se puede cerrar, y esa es una decisión
 * deliberada: obligar a cuadrar antes de cerrar empujaría a inventar un ajuste
 * que cuadre, que es peor que un corte cerrado que dice la verdad. Lo que se
 * exige es que cada diferencia esté nombrada y que quien cierra deje su nota.
 */
export async function closeReconciliation(
  actor: ActorContext,
  input: z.infer<typeof closeReconciliationSchema>,
): Promise<UseCaseResult<{ reconciliationId: string }>> {
  const parsed = closeReconciliationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) {
    return fail(errors.forbidden('actor sin cuenta: cerrar un corte exige persona identificable'));
  }

  const corte = await db().reconciliation.findUnique({
    where: { id: parsed.data.reconciliationId },
    select: { id: true, legalEntityId: true, status: true, differenceMinor: true },
  });
  if (corte === null) return fail(errors.notFound('corte inexistente'));

  const decision = can(actor, 'billing.reconciliation.close', {
    kind: 'Reconciliation',
    id: corte.id,
    legalEntityId: corte.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (corte.status === 'CLOSED') return fail(errors.conflict('Ese corte ya está cerrado.'));

  // Cerrar con diferencias exige nota. Sin ella, el corte diría que algo no
  // cuadró y no diría qué se hizo al respecto.
  if (corte.differenceMinor !== 0n && (parsed.data.note ?? '').trim().length < 15) {
    return fail(
      errors.validation({
        note: ['Este corte tiene diferencias. Escribe qué se encontró y qué se va a hacer antes de cerrarlo.'],
      }),
    );
  }

  await transaction(async (tx) => {
    await tx.reconciliation.updateMany({
      where: { id: corte.id, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedById: actor.userId, closedAt: new Date() },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.RECONCILIATION_CLOSED,
      objectKind: 'Reconciliation',
      objectId: corte.id,
      outcome: 'SUCCESS',
      legalEntityId: corte.legalEntityId,
      metadata: { diferencia: corte.differenceMinor.toString(), nota: parsed.data.note ?? null },
    });
  });

  return ok({ reconciliationId: corte.id });
}

export interface ReconciliationRow {
  readonly id: string;
  readonly legalEntityShortName: string;
  readonly stripeAccountKey: StripeAccountKey;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly expectedTotalMinor: bigint;
  readonly observedTotalMinor: bigint;
  readonly differenceMinor: bigint;
  readonly status: ReconciliationStatus;
  readonly closedAt: Date | null;
  readonly exceptions: readonly {
    readonly id: string;
    readonly kind: ReconciliationExceptionKind;
    readonly reference: string;
    readonly amountMinor: bigint;
    readonly detail: string;
    readonly resolvedAt: Date | null;
  }[];
}

export async function reconciliationList(actor: ActorContext): Promise<UseCaseResult<ReconciliationRow[]>> {
  const decision = can(actor, 'billing.ledger.read', { kind: 'Reconciliation' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;

  const filas = await db().reconciliation.findMany({
    where: entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } },
    orderBy: { periodStart: 'desc' },
    take: 50,
    select: {
      id: true,
      stripeAccountKey: true,
      periodStart: true,
      periodEnd: true,
      expectedTotalMinor: true,
      observedTotalMinor: true,
      differenceMinor: true,
      status: true,
      closedAt: true,
      legalEntity: { select: { shortName: true } },
      exceptions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, reference: true, amountMinor: true, detail: true, resolvedAt: true },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      legalEntityShortName: fila.legalEntity.shortName,
      stripeAccountKey: fila.stripeAccountKey,
      periodStart: fila.periodStart,
      periodEnd: fila.periodEnd,
      expectedTotalMinor: fila.expectedTotalMinor,
      observedTotalMinor: fila.observedTotalMinor,
      differenceMinor: fila.differenceMinor,
      status: fila.status,
      closedAt: fila.closedAt,
      exceptions: fila.exceptions,
    })),
  );
}
