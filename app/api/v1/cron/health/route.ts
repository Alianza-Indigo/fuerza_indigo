import { healthReport } from '@/platform/health/health-check';
import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { logger } from '@/platform/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verificación periódica de salud (PRD §17.5).
 *
 * Responde 200 cuando todo está en orden y 503 cuando algo falló, para que el
 * programador de tareas y la supervisión externa lo detecten sin leer el cuerpo.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const report = await healthReport();
  logger.info('Verificación de salud ejecutada', {
    module: 'health',
    outcome: report.status === 'failed' ? 'failed' : 'success',
    context: { status: report.status },
  });

  return Response.json(report, { status: report.status === 'failed' ? 503 : 200 });
}
