import type { Prisma } from '@prisma-client/client';
import { db } from '@/platform/db/client';

/**
 * Unidad de trabajo (docs/ARCHITECTURE.md §6).
 *
 * El acto y su evidencia se escriben en la MISMA transacción: si la transacción
 * falla no queda rastro de un acto que no ocurrió, y si el acto ocurre la
 * evidencia existe siempre (ADR-0011).
 */
export type Tx = Prisma.TransactionClient;

export interface UnitOfWorkOptions {
  /** Milisegundos máximos de la transacción. */
  readonly timeoutMs?: number;
  /** Milisegundos máximos esperando a obtener conexión. */
  readonly maxWaitMs?: number;
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
}

export async function transaction<T>(
  work: (tx: Tx) => Promise<T>,
  options: UnitOfWorkOptions = {},
): Promise<T> {
  return db().$transaction(work, {
    timeout: options.timeoutMs ?? 15_000,
    maxWait: options.maxWaitMs ?? 5_000,
    ...(options.isolationLevel === undefined ? {} : { isolationLevel: options.isolationLevel }),
  });
}

/**
 * Concurrencia optimista (docs/DATA_MODEL.md §3).
 *
 * Toda actualización de una entidad crítica incluye la versión de fila leída.
 * Si otra transacción la modificó entretanto, la actualización no encuentra la
 * fila y el caso de uso responde `CONFLICT` en vez de pisar el cambio ajeno.
 */
export class ConcurrencyError extends Error {
  constructor(readonly entity: string, readonly id: string) {
    super(`La fila ${entity}:${id} cambió mientras se editaba.`);
    this.name = 'ConcurrencyError';
  }
}

export function expectOneUpdated(count: number, entity: string, id: string): void {
  if (count !== 1) throw new ConcurrencyError(entity, id);
}
