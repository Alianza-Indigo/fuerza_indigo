import { env } from '@/platform/config/env';
import { safeEquals } from '@/platform/kernel/ids';

/**
 * Autenticación de los trabajos programados (PRD §17.5).
 *
 * Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. La comparación es en
 * tiempo constante: una comparación ordinaria filtraría el secreto carácter a
 * carácter por diferencia de duración.
 */
export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get('authorization');
  if (header === null) return false;
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return safeEquals(header.slice(prefix.length), env().CRON_SECRET);
}

/** Respuesta uniforme cuando la invocación no está autorizada. */
export function cronUnauthorized(): Response {
  return Response.json(
    { code: 'UNAUTHENTICATED', message: 'Esta ruta solo la invoca el programador de tareas.' },
    { status: 401 },
  );
}
