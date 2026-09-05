import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { remindOverdueClarifications } from '@/modules/membership';
import { systemActorId } from '@/platform/auth/superadmin';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Plazos de aclaración vencidos (PRD §8.1 paso 10).
 *
 * Recuerda a quien no contestó que todavía puede hacerlo. No rechaza, no cierra
 * y no resuelve: un plazo vencido hace visible una situación, no decide sobre
 * nadie (ADR-0080).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();

  const jobType = 'clarification-due';
  const actor = systemContext({
    actorId: await systemActorId(jobType),
    jobType,
    correlationId: newCorrelationId(),
  });

  const result = await remindOverdueClarifications(actor);
  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }
  return Response.json(result.data);
}
