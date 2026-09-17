import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { hashToken, newOpaqueToken, newPublicId } from '@/platform/kernel/ids';
import { recordAudit, recordSecurity, maskEmail } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { recordNotification, sendTemplatedMail } from '@/platform/mail/mailer';
import { env } from '@/platform/config/env';
import { checkPasswordPolicy, hashPassword } from '@/platform/auth/password';

/**
 * Activación de cuenta por invitación (PRD §20.1).
 *
 * No hay autoservicio con privilegios: una persona administradora invita, y la
 * persona invitada elige su contraseña mediante un enlace de un solo uso. La
 * invitación reutiliza `PasswordReset` porque el mecanismo es idéntico —testigo
 * opaco, un solo uso, vigencia corta— y duplicar la tabla habría duplicado
 * también los errores.
 */

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: () => 'Escribe un correo electrónico válido.' })),
  givenName: z.string().trim().min(1, { error: () => 'Escribe el nombre de la persona.' }).max(80),
  familyName: z.string().trim().min(1, { error: () => 'Escribe el primer apellido.' }).max(80),
  secondFamilyName: z.string().trim().max(80).optional(),
  territorialUnitId: z.uuid().optional(),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export interface InviteResult {
  readonly userId: string;
  readonly personId: string;
  /**
   * Enlace para establecer la contraseña. Se devuelve cuando la entrega está
   * configurada para el panel; en modo `email` llega cadena vacía.
   */
  readonly invitationUrl: string;
}

export async function inviteUser(actor: ActorContext, input: InviteInput): Promise<UseCaseResult<InviteResult>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const decision = can(actor, 'identity.user.invite', { kind: 'User' });
  if (!decision.allowed) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'WARNING',
        actorId: actor.actorId === '' ? null : actor.actorId,
        detail: { permission: 'identity.user.invite', reason: decision.reason },
        correlationId: actor.correlationId,
      }),
    );
    return fail(errors.forbidden(explain(decision.reason!)));
  }

  const { email, givenName, familyName, secondFamilyName, territorialUnitId } = parsed.data;

  const existing = await db().user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    return fail(
      errors.conflict(
        'Ya existe una cuenta con ese correo. Si la persona no puede entrar, usa la recuperación de contraseña.',
        'correo ya registrado',
      ),
    );
  }

  const token = newOpaqueToken();

  const result = await transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        publicId: newPublicId(),
        givenName,
        familyName,
        secondFamilyName: secondFamilyName ?? null,
        primaryEmail: email,
        territorialUnitId: territorialUnitId ?? null,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        personId: person.id,
        email,
        // La activación por correo está temporalmente deshabilitada. La cuenta
        // nace habilitada, aunque no podrá entrar hasta elegir una contraseña
        // mediante el testigo de un solo uso.
        status: 'ACTIVE',
        mustChangePassword: true,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    // Su actor de atribución existe desde el principio: cualquier acto que
    // ejecute a partir de ahora tiene a quién atribuirse.
    await tx.actor.create({
      data: { kind: 'PERSON', userId: user.id, label: `${givenName} ${familyName}` },
    });

    await tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.PERSON_CREATED,
      objectKind: 'Person',
      objectId: person.id,
      outcome: 'SUCCESS',
      metadata: { origin: 'invitación' },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.USER_INVITED,
      objectKind: 'User',
      objectId: user.id,
      outcome: 'SUCCESS',
      metadata: { subject: maskEmail(email) },
    });

    return { userId: user.id, personId: person.id };
  });

  const invitationUrl = `${env().APP_URL}/activar/${token}`;

  if (env().ACCOUNT_ACTIVATION_DELIVERY === 'email') {
    try {
      const sent = await sendTemplatedMail({
        to: email,
        templateCode: 'USER_INVITATION',
        variables: { givenName, activationUrl: invitationUrl, expiresInHours: '168' },
        correlationId: actor.correlationId,
      });
      await transaction((tx) =>
        recordNotification(tx, {
          personId: result.personId,
          templateCode: 'USER_INVITATION',
          category: 'SECURITY',
          title: sent.rendered.subject,
          body: 'Se envió un enlace para establecer la contraseña de la cuenta.',
          providerMessageId: sent.providerMessageId,
          delivered: true,
        }),
      );
    } catch {
      await transaction((tx) =>
        recordNotification(tx, {
          personId: result.personId,
          templateCode: 'USER_INVITATION',
          category: 'SECURITY',
          title: 'Enlace para establecer contraseña',
          body: 'No fue posible enviar el enlace. Genere uno nuevo desde el panel.',
          providerMessageId: null,
          delivered: false,
        }),
      );
    }
  }

  return ok({ ...result, invitationUrl: env().ACCOUNT_ACTIVATION_DELIVERY === 'panel' ? invitationUrl : '' });
}

export const createAccountSetupLinkSchema = z.object({ userId: z.uuid() });

/**
 * Genera un nuevo testigo para una cuenta que todavía no tiene contraseña.
 *
 * Respeta `ACCOUNT_ACTIVATION_DELIVERY`, que es de donde viene su nombre: en
 * `panel` devuelve el enlace a quien administra, para que lo entregue; en
 * `email` lo manda al buzón de la persona y **no** lo devuelve, porque
 * entregarlo por dos caminos a la vez convierte en dos las copias de una llave
 * que debería tener una sola dueña.
 *
 * Antes ignoraba la variable: mandaba el enlace al panel incluso con la entrega
 * por correo configurada, y dejaba escrito en la bitácora `delivery: 'panel'`
 * pasara lo que pasara. Una configuración que el código no consulta es una
 * configuración que miente.
 */
export async function createAccountSetupLink(
  actor: ActorContext,
  input: z.infer<typeof createAccountSetupLinkSchema>,
): Promise<UseCaseResult<{ setupUrl: string }>> {
  const parsed = createAccountSetupLinkSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ userId: ['La cuenta no es válida.'] }));

  const decision = can(actor, 'identity.user.invite', { kind: 'User', id: parsed.data.userId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const account = await db().user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
      status: true,
      person: { select: { givenName: true } },
      credentials: { where: { type: 'PASSWORD', revokedAt: null }, take: 1, select: { id: true } },
    },
  });
  if (account === null) return fail(errors.notFound('la cuenta no existe'));
  if (account.status === 'DISABLED') return fail(errors.conflict('La cuenta está deshabilitada. Reábrela primero.'));
  if (account.credentials.length > 0) {
    return fail(errors.conflict('La cuenta ya tiene contraseña. Si la olvidó, utilice la recuperación de acceso.'));
  }

  const entrega = env().ACCOUNT_ACTIVATION_DELIVERY;
  const token = newOpaqueToken();
  await transaction(async (tx) => {
    await tx.passwordReset.updateMany({
      where: { userId: account.id, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        userId: account.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await tx.user.update({
      where: { id: account.id },
      data: {
        status: 'ACTIVE',
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ACCOUNT_SETUP_LINK_CREATED,
      objectKind: 'User',
      objectId: account.id,
      outcome: 'SUCCESS',
      metadata: { subject: maskEmail(account.email), delivery: entrega },
    });
  });

  const setupUrl = `${env().APP_URL}/activar/${token}`;
  if (entrega === 'panel') return ok({ setupUrl });

  try {
    await sendTemplatedMail({
      to: account.email,
      templateCode: 'USER_INVITATION',
      variables: { givenName: account.person.givenName, activationUrl: setupUrl, expiresInHours: '168' },
      correlationId: actor.correlationId,
    });
    return ok({ setupUrl: '' });
  } catch {
    // El testigo ya quedó creado y el anterior ya quedó invalidado: negarlo
    // ahora dejaría a la persona sin el viejo y sin el nuevo. Se devuelve el
    // enlace a quien administra para que lo entregue, que es peor que el correo
    // y mucho mejor que dejarla fuera.
    return ok({ setupUrl });
  }
}

/* -------------------------------------------------------------------------- */
/* Activación                                                                 */
/* -------------------------------------------------------------------------- */

export const activateSchema = z
  .object({
    token: z.string().min(10),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    error: () => 'Las dos contraseñas no coinciden.',
    path: ['passwordConfirmation'],
  });

export async function activateAccount(
  input: z.infer<typeof activateSchema>,
  context: { correlationId: string; ipHash: string | null },
): Promise<UseCaseResult<{ userId: string }>> {
  const parsed = activateSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const invitation = await db().passwordReset.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
      invalidatedAt: true,
      user: {
        select: { id: true, email: true, personId: true, status: true, person: { select: { givenName: true } } },
      },
    },
  });

  const invalid =
    invitation === null ||
    invitation.consumedAt !== null ||
    invitation.invalidatedAt !== null ||
    invitation.expiresAt.getTime() <= Date.now();

  if (invalid) {
    return fail(
      errors.ruleViolation(
        'Esta invitación ya no es válida. Pide que te la envíen de nuevo.',
        'invitación inexistente, usada, invalidada o vencida',
      ),
    );
  }

  const policy = checkPasswordPolicy(parsed.data.password, {
    email: invitation.user.email,
    givenName: invitation.user.person.givenName,
  });
  if (!policy.ok) return fail(errors.validation({ password: policy.problems }));

  const hashed = await hashPassword(parsed.data.password);

  await transaction(async (tx) => {
    await tx.passwordReset.update({ where: { id: invitation.id }, data: { consumedAt: new Date() } });
    await tx.credential.create({
      data: {
        userId: invitation.userId,
        type: 'PASSWORD',
        secretHash: hashed.hash,
        algorithmParams: hashed.params,
      },
    });
    await tx.user.update({
      where: { id: invitation.userId },
      data: {
        status: 'ACTIVE',
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    const actorRow = await tx.actor.findUnique({ where: { userId: invitation.userId }, select: { id: true } });
    await recordSecurity(tx, {
      kind: 'PASSWORD_CHANGED',
      actorId: actorRow?.id ?? null,
      subjectLabel: maskEmail(invitation.user.email),
      ipHash: context.ipHash,
      detail: { flow: 'activación por invitación' },
      correlationId: context.correlationId,
    });
  });

  return ok({ userId: invitation.userId });
}
