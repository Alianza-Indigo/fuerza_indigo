import { retryUnreconciledWebhooks } from '@/modules/billing';
import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { requestContext } from '@/platform/http/request-context';
import { logger } from '@/platform/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reintento y alerta de eventos de cobro sin conciliar (F3-OPS-001).
 *
 * Corre cada cinco minutos porque un evento adelantado suele resolverse en el
 * siguiente intento: esperar más dejaría a una persona sin su derecho activado
 * durante ese rato, por un desorden de entrega del que ella no tiene culpa.
 *
 * Responde 503 cuando queda algo sin conciliar tras agotar los reintentos. No
 * es un fallo de esta ruta: es la señal que la supervisión externa necesita para
 * que un descuadre no viva callado hasta el corte semestral.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const context = await requestContext();
  const resumen = await retryUnreconciledWebhooks(context.correlationId);

  logger.info('Conciliación de eventos de cobro ejecutada', {
    module: 'billing',
    correlationId: context.correlationId,
    outcome: resumen.exhausted > 0 ? 'failed' : 'success',
    context: { ...resumen },
  });

  return Response.json(resumen, { status: resumen.exhausted > 0 ? 503 : 200 });
}
