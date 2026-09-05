import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { expireDueMemberships } from '@/modules/membership';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vencimiento de membresías (PRD §3.6).
 *
 * Constata lo que ya pasó: la vigencia la fijó la calidad al activarse y el
 * calendario solo la alcanza. Vencer **no es dar de baja**: la persona sigue en
 * el registro con su historial entero, y renovar la devuelve.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const jobType = 'membership-expiry';
  const actor = systemContext({
    actorId: await systemActorId(jobType),
    jobType,
    correlationId: newCorrelationId(),
  });

  const result = await expireDueMemberships(actor);
  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }
  return Response.json(result.data);
}
