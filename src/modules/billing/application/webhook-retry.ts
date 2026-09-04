import { db } from '@/platform/db/client';
import { logger } from '@/platform/observability/logger';
import { processWebhookEvent } from './webhook-processing';

/**
 * Reintento y alerta de eventos de cobro (PRD §11.4, F3-OPS-001).
 *
 * Un evento sin conciliar casi siempre se arregla solo: llegó antes que aquel
 * del que depende, y al reintentarlo un rato después ya encuentra su
 * referencia. Lo que no puede pasar es que se quede así para siempre sin que
 * nadie lo sepa, porque un evento sin conciliar es dinero que entró o salió y
 * que el sistema no supo dónde poner.
 *
 * Por eso hay dos cosas y no una: reintentar, que resuelve la mayoría, y
 * **avisar** de lo que sigue sin resolverse, que es lo que impide que un
 * descuadre viva callado hasta el corte semestral.
 */

/** Cuánto se espera antes de volver a intentar un evento sin conciliar. */
export const RETRY_AFTER_MS = 5 * 60 * 1000;

/**
 * Cuántas veces se reintenta antes de dejar de hacerlo.
 *
 * Con reintentos cada cinco minutos, doce intentos cubren una hora. Pasada esa
 * hora, lo que falta no es tiempo: es una intervención, y seguir reintentando
 * solo escondería el problema detrás de un registro que se repite.
 */
export const MAX_ATTEMPTS = 12;

/** A partir de cuándo un evento sin conciliar deja de ser normal y pasa a ser una alerta. */
export const ALERT_AFTER_MS = 60 * 60 * 1000;

export interface ReconcileSummary {
  readonly retried: number;
  readonly resolved: number;
  readonly stillUnreconciled: number;
  readonly alerted: number;
  readonly exhausted: number;
}

export async function retryUnreconciledWebhooks(correlationId: string): Promise<ReconcileSummary> {
  const listos = await db().stripeWebhookEvent.findMany({
    where: {
      processingStatus: { in: ['UNRECONCILED', 'FAILED'] },
      attempts: { lt: MAX_ATTEMPTS },
      receivedAt: { lte: new Date(Date.now() - RETRY_AFTER_MS) },
    },
    orderBy: { receivedAt: 'asc' },
    take: 100,
    select: { id: true },
  });

  let resolved = 0;
  let stillUnreconciled = 0;

  for (const evento of listos) {
    const resultado = await processWebhookEvent(evento.id, correlationId);
    if (resultado.kind === 'PROCESSED' || resultado.kind === 'IGNORED' || resultado.kind === 'ALREADY_DONE') {
      resolved += 1;
    } else {
      stillUnreconciled += 1;
    }
  }

  // La alerta se marca una sola vez por evento: `alertedAt` es lo que impide
  // que un problema que dura una semana genere un aviso cada hora hasta que
  // alguien deje de leerlos.
  const paraAvisar = await db().stripeWebhookEvent.findMany({
    where: {
      processingStatus: { in: ['UNRECONCILED', 'FAILED'] },
      alertedAt: null,
      receivedAt: { lte: new Date(Date.now() - ALERT_AFTER_MS) },
    },
    take: 100,
    select: { id: true, stripeEventId: true, eventType: true, stripeAccountKey: true, attempts: true, lastError: true },
  });

  for (const evento of paraAvisar) {
    logger.error('Evento de cobro sin conciliar', {
      module: 'billing',
      correlationId,
      outcome: 'failed',
      context: {
        stripeEventId: evento.stripeEventId,
        eventType: evento.eventType,
        cuenta: evento.stripeAccountKey,
        intentos: evento.attempts,
        ultimoError: evento.lastError,
      },
    });
  }

  if (paraAvisar.length > 0) {
    await db().stripeWebhookEvent.updateMany({
      where: { id: { in: paraAvisar.map((evento) => evento.id) } },
      data: { alertedAt: new Date() },
    });
  }

  const exhausted = await db().stripeWebhookEvent.count({
    where: { processingStatus: { in: ['UNRECONCILED', 'FAILED'] }, attempts: { gte: MAX_ATTEMPTS } },
  });

  return {
    retried: listos.length,
    resolved,
    stillUnreconciled,
    alerted: paraAvisar.length,
    exhausted,
  };
}
