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
 * `subject` es siempre un valor ya seudonimizado —hash de IP o correo
 * enmascarado—: aquí no entra ningún dato personal en claro.
 */
export async function checkRateLimit(
  kind: 'LOGIN_FAILURE' | 'PASSWORD_RESET_REQUESTED' | 'SUPERADMIN_LOGIN',
  discriminator: { ipHash?: string | null; subjectLabel?: string | null },
  rule: RateLimitRule,
): Promise<RateLimitVerdict> {
  const since = new Date(Date.now() - rule.windowMs);

  const where: Record<string, unknown> = { kind, occurredAt: { gte: since } };
  if (discriminator.ipHash !== undefined && discriminator.ipHash !== null) where['ipHash'] = discriminator.ipHash;
  if (discriminator.subjectLabel !== undefined && discriminator.subjectLabel !== null) {
    where['subjectLabel'] = discriminator.subjectLabel;
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
