import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { dispatchExpiryAlerts } from '@/modules/notifications';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Alertas de vencimientos (PRD §24 Fase 9).
 *
 * Avisa de lo que se acerca —membresías y nombramientos por vencer— al centro de
 * notificaciones de cada persona, una sola vez por vencimiento. Correrlo a diario
 * no repite un aviso: el propio aviso es la marca de que ya se dio.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const jobType = 'expiry-alerts';
  const actor = systemContext({
    actorId: await systemActorId(jobType),
    jobType,
    correlationId: newCorrelationId(),
  });

  const result = await dispatchExpiryAlerts(actor);
  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }
  return Response.json(result.data);
}
