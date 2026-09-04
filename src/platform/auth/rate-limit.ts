import { db } from '@/platform/db/client';

/**
 * Límite de intentos y protección contra abuso (PRD §20.1, §20.5).
 *
 * El recuento vive en la base porque el entorno de ejecución es serverless: una
 * cuenta en memoria del proceso no serviría de nada cuando cada petición puede
 * atenderla una instancia distinta. Se apoya en `SecurityEvent`, que ya se
 * escribe por otras razones, en lugar de introducir una tabla nueva.
 */

export interface RateLimitRule {
  readonly windowMs: number;
  readonly maxAttempts: number;
}

export const RATE_LIMITS = {
  /** Intentos de inicio de sesión por dirección de origen. */
  loginByIp: { windowMs: 15 * 60 * 1000, maxAttempts: 20 } satisfies RateLimitRule,
  /** Intentos de inicio de sesión sobre una misma cuenta. */
  loginByAccount: { windowMs: 15 * 60 * 1000, maxAttempts: 8 } satisfies RateLimitRule,
  /** Solicitudes de recuperación por origen. */
  passwordResetByIp: { windowMs: 60 * 60 * 1000, maxAttempts: 10 } satisfies RateLimitRule,
  /** Acceso de Superadmin: mucho más estrecho, por lo que está en juego. */
  superadminLogin: { windowMs: 15 * 60 * 1000, maxAttempts: 5 } satisfies RateLimitRule,
} as const;

export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly attempts: number;
  readonly retryAfterSeconds: number;
}

/**
 * Cuenta los eventos de fallo recientes que comparten discriminante.
 *
 * Los dos discriminantes son valores ya seudonimizados —hash de la dirección de
 * origen y huella HMAC del correo—: aquí no entra ningún dato personal en claro.
 *
 * `subjectKey` y no `subjectLabel`: la máscara de un correo no es inyectiva y
 * hacía que dos personas distintas compartieran cupo (`D-F1-015`).
 */
export async function checkRateLimit(
  kind: 'LOGIN_FAILURE' | 'PASSWORD_RESET_REQUESTED' | 'SUPERADMIN_LOGIN',
  discriminator: { ipHash?: string | null; subjectKey?: string | null },
  rule: RateLimitRule,
): Promise<RateLimitVerdict> {
  const since = new Date(Date.now() - rule.windowMs);

  // Un discriminante ausente NO significa «cuenta todo». Si al no conocerse el
  // origen se omitiera el filtro, el recuento abarcaría los fallos de todo el
  // sistema y bastaría con un atacante sin origen identificable para agotar el
  // cupo y dejar fuera a todas las personas legítimas: una medida contra el
  // abuso convertida en el abuso mismo. Un origen desconocido se agrupa con los
  // demás orígenes desconocidos, que es un cubo acotado y separado.
  const where: Record<string, unknown> = { kind, occurredAt: { gte: since } };
  if ('ipHash' in discriminator) where['ipHash'] = discriminator.ipHash ?? null;
  if ('subjectKey' in discriminator) where['subjectKey'] = discriminator.subjectKey ?? null;

  if (where['ipHash'] === undefined && where['subjectKey'] === undefined) {
    throw new Error(
      'checkRateLimit exige al menos un discriminante. Sin él, el recuento abarcaría todo el sistema.',
    );
  }

  const attempts = await db().securityEvent.count({ where: where as never });
  const allowed = attempts < rule.maxAttempts;

  return {
    allowed,
    attempts,
    retryAfterSeconds: allowed ? 0 : Math.ceil(rule.windowMs / 1000),
  };
}

/**
 * Bloqueo progresivo de la cuenta.
 *
 * Se desbloquea sola al vencer el plazo, y también mediante recuperación de
 * contraseña: dejar a alguien fuera de su cuenta indefinidamente convierte una
 * medida de seguridad en una denegación de servicio contra la persona legítima.
 */
export function lockoutFor(failedAttempts: number): Date | null {
  if (failedAttempts < 5) return null;
  const minutes = Math.min(2 ** (failedAttempts - 5), 60);
  return new Date(Date.now() + minutes * 60 * 1000);
}
