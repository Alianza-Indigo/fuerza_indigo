import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { applyRetention } from '@/platform/files/retention';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aplicación de políticas de conservación (PRD §17.4, §20.3).
 *
 * Un bloqueo legal activo suspende cualquier acción sobre los objetos
 * alcanzados: manda sobre la política de retención, siempre.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const jobType = 'retention';
  const actor = systemContext({
    actorId: await systemActorId(jobType),
    jobType,
    correlationId: newCorrelationId(),
  });

  const result = await applyRetention(actor);
  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }
  return Response.json(result.data);
}
