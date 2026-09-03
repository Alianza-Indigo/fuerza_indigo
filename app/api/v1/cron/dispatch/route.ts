import { claimBatch, dispatchOutbox, markFailed, markSucceeded } from '@/platform/jobs/queue';
import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { runJob } from '@/platform/jobs/handlers';
import { logger } from '@/platform/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Despachador de la cola y de la bandeja de salida (ADR-0017, ADR-0025).
 *
 * Esta ruta solo despacha: toma un lote con bloqueo y ejecuta con clave de
 * idempotencia. La lógica de cada trabajo vive en su manejador.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const outbox = await dispatchOutbox();
  const claimed = await claimBatch(`cron-${Date.now()}`);

  let succeeded = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      const result = await runJob(job);
      await markSucceeded(job.id, result);
      succeeded += 1;
    } catch (error) {
      await markFailed(job, error);
      failed += 1;
    }
  }

  logger.info('Despacho ejecutado', {
    module: 'jobs',
    context: { claimed: claimed.length, succeeded, failed, outbox },
  });

  return Response.json({ jobs: { claimed: claimed.length, succeeded, failed }, outbox });
}
