import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { hashPassword, needsRehash, verifyPassword } from '@/platform/auth/password';
import { issueSession, type IssuedSession } from '@/platform/auth/session';
import { checkRateLimit, lockoutFor, RATE_LIMITS } from '@/platform/auth/rate-limit';
import { maskEmail, recordSecurity } from '@/platform/audit/audit-service';
import type { Argon2Params } from '@/platform/auth/password';

/**
 * Inicio de sesión ordinario (PRD §20.1, docs/SECURITY.md §2).
 *
 * Propiedades que hay que preservar al tocar este archivo:
 *
 *  · La respuesta es **idéntica** para cuenta inexistente, contraseña incorrecta
 *    y cuenta deshabilitada. Distinguirlas permitiría enumerar el padrón.
 *  · Se verifica un hash **siempre**, incluso cuando la cuenta no existe, para
 *    que el tiempo de respuesta no revele su existencia.
 *  · Cada intento fallido deja `SecurityEvent`: es lo que alimenta el límite de
 *    tasa y lo que permite detectar un ataque.
 */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: () => 'Escribe un correo electrónico válido.' })),
  password: z.string().min(1, { error: () => 'Escribe tu contraseña.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginContext {
  readonly correlationId: string;
  readonly ipHash: string | null;
  readonly userAgentSummary: string | null;
  readonly deviceLabel: string | null;
}

/**
 * Hash de referencia para el camino en el que la cuenta no existe.
 * Es un hash real de un valor aleatorio: verificarlo cuesta lo mismo que
 * verificar el de una cuenta legítima.
 */
let decoyHash: string | null = null;
async function decoy(): Promise<string> {
  decoyHash ??= (await hashPassword(`inexistente-${Math.random()}`)).hash;
  return decoyHash;
}

const GENERIC_FAILURE = 'El correo o la contraseña no coinciden.';

export async function login(input: LoginInput, context: LoginContext): Promise<UseCaseResult<IssuedSession>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      (details[key] ??= []).push(issue.message);
    }
    return fail(errors.validation(details));
  }

  const { email, password } = parsed.data;
  const masked = maskEmail(email);

  // 1. Límite de tasa por origen y por cuenta.
  const byIp = await checkRateLimit('LOGIN_FAILURE', { ipHash: context.ipHash }, RATE_LIMITS.loginByIp);
  const byAccount = await checkRateLimit('LOGIN_FAILURE', { subjectLabel: masked }, RATE_LIMITS.loginByAccount);
  if (!byIp.allowed || !byAccount.allowed) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'RATE_LIMITED',
        severity: 'WARNING',
        subjectLabel: masked,
        ipHash: context.ipHash,
        detail: { scope: byIp.allowed ? 'account' : 'ip' },
        correlationId: context.correlationId,
      }),
    );
    const retryAfter = Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds);
    return fail(errors.rateLimited(retryAfter));
  }

  const user = await db().user.findUnique({
    where: { email },
    select: {
      id: true,
      status: true,
      failedAttempts: true,
      lockedUntil: true,
      sessionVersion: true,
      person: { select: { id: true, givenName: true } },
      credentials: {
        where: { type: 'PASSWORD', revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, secretHash: true, algorithmParams: true },
      },
    },
  });

  const credential = user?.credentials[0];

  // 2. Verificación de contraseña. Se ejecuta SIEMPRE, exista o no la cuenta.
  const passwordOk = await verifyPassword(credential?.secretHash ?? (await decoy()), password);

  const isLocked = user?.lockedUntil !== null && user?.lockedUntil !== undefined && user.lockedUntil > new Date();
  const canSignIn = user !== null && user.status === 'ACTIVE' && credential !== undefined && passwordOk && !isLocked;

  if (!canSignIn) {
    await transaction(async (tx) => {
      await recordSecurity(tx, {
        kind: 'LOGIN_FAILURE',
        severity: 'INFO',
        subjectLabel: masked,
        ipHash: context.ipHash,
        // El motivo se guarda para poder investigar, pero NO se devuelve.
        detail: {
          reason:
            user === null
              ? 'cuenta inexistente'
              : isLocked
                ? 'cuenta bloqueada temporalmente'
                : user.status !== 'ACTIVE'
                  ? `cuenta en estado ${user.status}`
                  : 'contraseña incorrecta',
        },
        correlationId: context.correlationId,
      });

      if (user !== null) {
        const attempts = user.failedAttempts + 1;
        await tx.user.update({
          where: { id: user.id },
          data: { failedAttempts: attempts, lockedUntil: lockoutFor(attempts) },
        });
      }
    });

    return fail(errors.unauthenticated(GENERIC_FAILURE));
  }

  // 3. Autenticación correcta: se abre sesión y se restablece el contador.
  const session = await transaction(async (tx) => {
    const issued = await issueSession(tx, {
      userId: user.id,
      actorKind: 'PERSON',
      sessionVersion: user.sessionVersion,
      ipHash: context.ipHash,
      userAgentSummary: context.userAgentSummary,
      deviceLabel: context.deviceLabel,
    });

    await tx.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // Elevación transparente de parámetros: si el hash se generó con parámetros
    // anteriores a los vigentes, se vuelve a cifrar ahora que tenemos la
    // contraseña en claro. La persona no se entera y su credencial mejora.
    if (needsRehash(credential.algorithmParams as Partial<Argon2Params>)) {
      const rehashed = await hashPassword(password);
      await tx.credential.update({
        where: { id: credential.id },
        data: { secretHash: rehashed.hash, algorithmParams: rehashed.params },
      });
    }

    const actor = await tx.actor.findUnique({ where: { userId: user.id }, select: { id: true } });
    await recordSecurity(tx, {
      kind: 'LOGIN_SUCCESS',
      actorId: actor?.id ?? null,
      subjectLabel: masked,
      ipHash: context.ipHash,
      correlationId: context.correlationId,
    });

    return issued;
  });

  return ok(session);
}
