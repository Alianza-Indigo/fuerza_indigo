import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { checkPasswordPolicy, hashPassword } from '@/platform/auth/password';
import { revokeAllSessions } from '@/platform/auth/session';
import { checkRateLimit, RATE_LIMITS } from '@/platform/auth/rate-limit';
import { hashToken, newOpaqueToken } from '@/platform/kernel/ids';
import { maskEmail, recordAudit, recordSecurity } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { recordNotification, sendTemplatedMail } from '@/platform/mail/mailer';
import { env } from '@/platform/config/env';
import { systemContext } from '@/platform/kernel/actor-context';

/**
 * Recuperación de contraseña (PRD §20.1, docs/SECURITY.md §2).
 *
 * La respuesta al solicitante es **idéntica** exista o no la cuenta: es la única
 * forma de que este flujo no se convierta en un oráculo para saber quién está
 * registrado, dato especialmente sensible en un padrón sindical.
 */

const RESET_TTL_MS = 60 * 60 * 1000;

export const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: () => 'Escribe un correo electrónico válido.' })),
});

export interface RequestResetContext {
  readonly correlationId: string;
  readonly ipHash: string | null;
}

/** Siempre devuelve éxito. Lo que cambia por dentro es si se envía o no correo. */
export async function requestPasswordReset(
  input: z.infer<typeof requestResetSchema>,
  context: RequestResetContext,
): Promise<UseCaseResult<{ accepted: true }>> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(errors.validation({ email: ['Escribe un correo electrónico válido.'] }));
  }

  const email = parsed.data.email;
  const masked = maskEmail(email);

  const limit = await checkRateLimit(
    'PASSWORD_RESET_REQUESTED',
    { ipHash: context.ipHash },
    RATE_LIMITS.passwordResetByIp,
  );
  if (!limit.allowed) {
    // Incluso al limitar se devuelve la misma respuesta afirmativa: un 429
    // distinguible por correo volvería a convertir esto en un oráculo.
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'RATE_LIMITED',
        severity: 'WARNING',
        subjectLabel: masked,
        ipHash: context.ipHash,
        detail: { flow: 'password_reset' },
        correlationId: context.correlationId,
      }),
    );
    return ok({ accepted: true });
  }

  const user = await db().user.findUnique({
    where: { email },
    select: { id: true, status: true, personId: true, person: { select: { locale: true } } },
  });

  await transaction((tx) =>
    recordSecurity(tx, {
      kind: 'PASSWORD_RESET_REQUESTED',
      subjectLabel: masked,
      ipHash: context.ipHash,
      detail: { existed: user !== null },
      correlationId: context.correlationId,
    }),
  );

  if (user === null || user.status === 'DISABLED') return ok({ accepted: true });

  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await transaction(async (tx) => {
    // Cualquier solicitud anterior queda invalidada: solo el enlace más reciente
    // sirve, de modo que un correo antiguo interceptado no vale nada.
    await tx.passwordReset.updateMany({
      where: { userId: user.id, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        requestIpHash: context.ipHash,
      },
    });
  });

  const resetUrl = `${env().APP_URL}/recuperar/${token}`;
  try {
    const sent = await sendTemplatedMail({
      to: email,
      templateCode: 'PASSWORD_RESET',
      variables: { resetUrl, expiresInHours: '1' },
      locale: user.person.locale,
      correlationId: context.correlationId,
    });
    await transaction((tx) =>
      recordNotification(tx, {
        personId: user.personId,
        templateCode: 'PASSWORD_RESET',
        category: 'SECURITY',
        title: sent.rendered.subject,
        body: 'Se envió un enlace de recuperación por correo.',
        providerMessageId: sent.providerMessageId,
        delivered: true,
      }),
    );
  } catch {
    // El fallo del proveedor no cambia la respuesta ni deja a la persona sin
    // información: queda registrado y el aviso aparece en su centro de
    // notificaciones cuando entre.
    await transaction((tx) =>
      recordNotification(tx, {
        personId: user.personId,
        templateCode: 'PASSWORD_RESET',
        category: 'SECURITY',
        title: 'Solicitud de recuperación de contraseña',
        body: 'No fue posible enviar el correo. Vuelve a solicitarlo o escribe a soporte.',
        providerMessageId: null,
        delivered: false,
      }),
    );
  }

  return ok({ accepted: true });
}

/* -------------------------------------------------------------------------- */
/* Consumo del enlace                                                         */
/* -------------------------------------------------------------------------- */

export const completeResetSchema = z
  .object({
    token: z.string().min(10),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    error: () => 'Las dos contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  });

export async function completePasswordReset(
  input: z.infer<typeof completeResetSchema>,
  context: { correlationId: string; ipHash: string | null },
): Promise<UseCaseResult<{ userId: string }>> {
  const parsed = completeResetSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const reset = await db().passwordReset.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
      invalidatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          personId: true,
          status: true,
          person: { select: { givenName: true, locale: true } },
        },
      },
    },
  });

  const invalid =
    reset === null ||
    reset.consumedAt !== null ||
    reset.invalidatedAt !== null ||
    reset.expiresAt.getTime() <= Date.now();

  if (invalid) {
    return fail(
      errors.ruleViolation(
        'Este enlace ya no es válido. Solicita uno nuevo desde la pantalla de recuperación.',
        'enlace de recuperación inexistente, usado, invalidado o vencido',
      ),
    );
  }

  const policy = checkPasswordPolicy(parsed.data.password, {
    email: reset.user.email,
    givenName: reset.user.person.givenName,
  });
  if (!policy.ok) return fail(errors.validation({ password: policy.problems }));

  const hashed = await hashPassword(parsed.data.password);

  await transaction(async (tx) => {
    await tx.passwordReset.update({ where: { id: reset.id }, data: { consumedAt: new Date() } });

    await tx.credential.updateMany({
      where: { userId: reset.userId, type: 'PASSWORD', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.credential.create({
      data: {
        userId: reset.userId,
        type: 'PASSWORD',
        secretHash: hashed.hash,
        algorithmParams: hashed.params,
      },
    });

    // Recuperar la contraseña también desbloquea la cuenta: dejar a alguien
    // fuera indefinidamente convierte una medida de seguridad en una denegación
    // de servicio contra la persona legítima.
    await tx.user.update({
      where: { id: reset.userId },
      data: { failedAttempts: 0, lockedUntil: null, status: reset.user.status === 'INVITED' ? 'ACTIVE' : reset.user.status },
    });

    // Cambiar la contraseña cierra todas las sesiones abiertas.
    await revokeAllSessions(tx, reset.userId, 'PASSWORD_CHANGE');

    const actor = await tx.actor.findUnique({ where: { userId: reset.userId }, select: { id: true } });
    await recordSecurity(tx, {
      kind: 'PASSWORD_CHANGED',
      actorId: actor?.id ?? null,
      subjectLabel: maskEmail(reset.user.email),
      ipHash: context.ipHash,
      correlationId: context.correlationId,
    });

    if (actor !== null) {
      await recordAudit(
        tx,
        { ...systemContext({ actorId: actor.id, jobType: 'password-reset', correlationId: context.correlationId }) },
        {
          action: AUDIT_ACTIONS.PASSWORD_CHANGED,
          objectKind: 'User',
          objectId: reset.userId,
          outcome: 'SUCCESS',
          reason: 'restablecimiento solicitado por la persona titular',
        },
      );
    }
  });

  return ok({ userId: reset.userId });
}
