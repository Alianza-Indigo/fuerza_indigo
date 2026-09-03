import type { JobStatus } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import type { Tx } from '@/platform/db/unit-of-work';
import { logger } from '@/platform/observability/logger';
import { newCorrelationId } from '@/platform/kernel/ids';

/**
 * Cola de trabajos en base de datos (ADR-0017, PRD §17.5).
 *
 * El entorno es serverless: una cola en memoria no sobreviviría entre
 * invocaciones. La tabla da además algo que una cola externa no daría gratis:
 * el estado de cada trabajo es consultable y auditable como cualquier otro dato.
 */

export interface EnqueueInput {
  readonly jobType: string;
  /** Discrimina el efecto. `(jobType, businessKey)` es único mientras no termina. */
  readonly businessKey: string;
  readonly payload?: Record<string, unknown>;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
  readonly correlationId?: string;
}

/**
 * Encola de forma idempotente.
 *
 * Si ya existe un trabajo vivo con la misma clave de negocio, devuelve el
 * existente en lugar de crear otro: el índice único parcial lo garantiza en la
 * base, y aquí se evita el error innecesario.
 */
export async function enqueue(input: EnqueueInput): Promise<{ id: string; created: boolean }> {
  const existing = await db().backgroundJob.findFirst({
    where: {
      jobType: input.jobType,
      businessKey: input.businessKey,
      status: { notIn: ['SUCCEEDED', 'CANCELLED'] },
    },
    select: { id: true },
  });
  if (existing !== null) return { id: existing.id, created: false };

  const created = await db().backgroundJob.create({
    data: {
      jobType: input.jobType,
      businessKey: input.businessKey,
      payload: (input.payload ?? {}) as never,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
      correlationId: input.correlationId ?? newCorrelationId(),
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export interface ClaimedJob {
  readonly id: string;
  readonly jobType: string;
  readonly businessKey: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly correlationId: string;
}

/**
 * Toma un lote de trabajos con bloqueo.
 *
 * `FOR UPDATE SKIP LOCKED` permite que varias instancias despachen a la vez sin
 * pisarse: cada una se lleva trabajos distintos en lugar de esperar turno.
 */
export async function claimBatch(claimedBy: string, limit = 10): Promise<ClaimedJob[]> {
  const rows = await db().$queryRaw<
    { id: string; jobType: string; businessKey: string; payload: unknown; attempts: number; maxAttempts: number; correlationId: string }[]
  >`
    UPDATE background_job AS j
       SET status = 'CLAIMED',
           "claimedAt" = now(),
           "claimedBy" = ${claimedBy},
           "updatedAt" = now()
     WHERE j.id IN (
       SELECT c.id
         FROM background_job AS c
        WHERE c.status = 'PENDING'
          AND c."runAt" <= now()
        ORDER BY c."runAt" ASC
        LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
     )
    RETURNING j.id, j."jobType", j."businessKey", j.payload, j.attempts, j."maxAttempts", j."correlationId"
  `;

  return rows.map((row) => ({
    id: row.id,
    jobType: row.jobType,
    businessKey: row.businessKey,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    correlationId: row.correlationId,
  }));
}

/** Espera exponencial con tope. */
export function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 1000, 15 * 60 * 1000);
}

export async function markSucceeded(jobId: string, result: Record<string, unknown>): Promise<void> {
  await db().backgroundJob.update({
    where: { id: jobId },
    data: { status: 'SUCCEEDED', result: result as never, lastError: null },
  });
}

/**
 * Marca el fallo y decide si reintentar.
 *
 * Al agotar los intentos, el trabajo queda `FAILED` **con alerta**: un trabajo
 * que deja de reintentar en silencio es un trabajo que nadie investiga.
 */
export async function markFailed(job: ClaimedJob, error: unknown): Promise<{ willRetry: boolean }> {
  const attempts = job.attempts + 1;
  const willRetry = attempts < job.maxAttempts;
  const message = error instanceof Error ? error.message : String(error);

  const status: JobStatus = willRetry ? 'PENDING' : 'FAILED';
  await db().backgroundJob.update({
    where: { id: job.id },
    data: {
      status,
      attempts,
      lastError: message.slice(0, 2000),
      ...(willRetry
        ? { runAt: new Date(Date.now() + backoffMs(attempts)) }
        : { alertedAt: new Date() }),
    },
  });

  logger.error(willRetry ? 'Trabajo fallido; se reintentará' : 'Trabajo agotó sus reintentos', {
    module: 'jobs',
    correlationId: job.correlationId,
    outcome: 'failed',
    context: { jobType: job.jobType, attempts, maxAttempts: job.maxAttempts },
  });

  return { willRetry };
}

/** Trabajos que agotaron sus reintentos y siguen sin atenderse. */
export async function stuckJobs(): Promise<{ jobType: string; count: number }[]> {
  const rows = await db().backgroundJob.groupBy({
    by: ['jobType'],
    where: { status: 'FAILED' },
    _count: { _all: true },
  });
  return rows.map((row) => ({ jobType: row.jobType, count: row._count._all }));
}

/* -------------------------------------------------------------------------- */
/* Bandeja de salida (ADR-0025)                                               */
/* -------------------------------------------------------------------------- */

/** Manejador registrado para un evento de dominio. */
export type OutboxHandler = (payload: Record<string, unknown>, correlationId: string) => Promise<void>;

const handlers = new Map<string, Map<string, OutboxHandler>>();

/**
 * Registra un manejador. Quien publica no conoce a quien consume: ambos
 * dependen de este módulo, que está por debajo de los dos en el grafo.
 */
export function onDomainEvent(eventName: string, handlerCode: string, handler: OutboxHandler): void {
  const forEvent = handlers.get(eventName) ?? new Map<string, OutboxHandler>();
  forEvent.set(handlerCode, handler);
  handlers.set(eventName, forEvent);
}

export function registeredHandlers(eventName: string): Map<string, OutboxHandler> {
  return handlers.get(eventName) ?? new Map<string, OutboxHandler>();
}

/** Solo para pruebas: limpia el registro entre casos. */
export function clearHandlersForTests(): void {
  handlers.clear();
}

/**
 * Entrega los mensajes pendientes de la bandeja de salida.
 *
 * Cada manejador es idempotente por `(mensaje, manejador)`: reintentar la
 * entrega no duplica el efecto. Un manejador que falla no impide que los demás
 * del mismo mensaje se entreguen.
 */
export async function dispatchOutbox(limit = 25): Promise<{ delivered: number; failed: number }> {
  const pending = await db().outboxMessage.findMany({
    where: { status: { in: ['PENDING', 'DELIVERING'] }, availableAt: { lte: new Date() } },
    orderBy: { occurredAt: 'asc' },
    take: limit,
    select: { id: true, eventName: true, payload: true, correlationId: true, attempts: true },
  });

  let delivered = 0;
  let failed = 0;

  for (const message of pending) {
    const forEvent = registeredHandlers(message.eventName);

    if (forEvent.size === 0) {
      // Sin manejadores no hay nada que entregar, pero tampoco se descarta en
      // silencio: queda como entregado con constancia de que nadie escuchaba.
      await db().outboxMessage.update({
        where: { id: message.id },
        data: { status: 'DELIVERED', lastError: 'Sin manejadores registrados para este evento' },
      });
      continue;
    }

    let allOk = true;
    for (const [handlerCode, handler] of forEvent) {
      const existing = await db().outboxDelivery.findUnique({
        where: { outboxMessageId_handlerCode: { outboxMessageId: message.id, handlerCode } },
        select: { status: true },
      });
      if (existing?.status === 'DELIVERED') continue;

      try {
        await handler((message.payload ?? {}) as Record<string, unknown>, message.correlationId);
        await db().outboxDelivery.upsert({
          where: { outboxMessageId_handlerCode: { outboxMessageId: message.id, handlerCode } },
          update: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null },
          create: { outboxMessageId: message.id, handlerCode, status: 'DELIVERED', deliveredAt: new Date() },
        });
        delivered += 1;
      } catch (error) {
        allOk = false;
        failed += 1;
        const message_ = error instanceof Error ? error.message : String(error);
        await db().outboxDelivery.upsert({
          where: { outboxMessageId_handlerCode: { outboxMessageId: message.id, handlerCode } },
          update: { status: 'FAILED', attempts: { increment: 1 }, lastError: message_.slice(0, 2000) },
          create: { outboxMessageId: message.id, handlerCode, status: 'FAILED', attempts: 1, lastError: message_.slice(0, 2000) },
        });
      }
    }

    await db().outboxMessage.update({
      where: { id: message.id },
      data: allOk
        ? { status: 'DELIVERED' }
        : {
            status: 'PENDING',
            attempts: { increment: 1 },
            availableAt: new Date(Date.now() + backoffMs(message.attempts + 1)),
          },
    });
  }

  return { delivered, failed };
}

/**
 * Publica un evento de dominio dentro de la transacción del hecho que lo
 * origina. Es lo que hace que no exista un estado en el que el hecho conste y
 * la orden derivada se haya perdido (ADR-0025).
 */
export async function publishDomainEvent(
  tx: Tx,
  input: {
    eventName: string;
    payload: Record<string, unknown>;
    legalEntityId?: string | null;
    correlationId: string;
    actorId: string;
  },
): Promise<string> {
  const created = await tx.outboxMessage.create({
    data: {
      eventName: input.eventName,
      payload: input.payload as never,
      legalEntityId: input.legalEntityId ?? null,
      correlationId: input.correlationId,
      createdByActorId: input.actorId,
    },
    select: { id: true },
  });
  return created.id;
}
