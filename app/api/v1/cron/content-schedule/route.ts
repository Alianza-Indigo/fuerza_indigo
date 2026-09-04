import { cronUnauthorized, isAuthorizedCron } from '@/platform/http/cron-auth';
import { publishDueContent } from '@/modules/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Publicación de contenidos programados (PRD §16.1).
 *
 * Corre cada cinco minutos. Una convocatoria con fecha de salida no admite el
 * retraso de una hora: cinco minutos es el margen que hace que «sale el jueves a
 * las nueve» signifique lo que dice.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return cronUnauthorized();
  return Response.json(await publishDueContent());
}
