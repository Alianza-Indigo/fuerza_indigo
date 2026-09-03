import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { expireDueRoleAssignments } from '@/modules/access';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Revocación de nombramientos vencidos (PRD §4.3).
 *
 * El acceso ya deja de concederse al vencer —el motor solo considera
 * asignaciones vigentes—; este trabajo materializa la revocación para que el
 * historial refleje el hecho institucional, no solo su efecto.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const jobType = 'role-expiry';
  const actor = systemContext({
    actorId: await systemActorId(jobType),
    jobType,
    correlationId: newCorrelationId(),
  });

  const result = await expireDueRoleAssignments(actor);
  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }
  return Response.json(result.data);
}
