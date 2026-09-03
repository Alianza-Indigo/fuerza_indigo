import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { listOwnSessions, revokeAllSessions, revokeSession, type OwnSessionView } from '@/platform/auth/session';
import { recordAudit, recordSecurity } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Gestión de las sesiones propias (PRD §20.1).
 *
 * Cada persona ve y cierra sus sesiones. Cerrar la de otra persona es un permiso
 * distinto, crítico y con motivo obligatorio.
 */

export async function myActiveSessions(actor: ActorContext): Promise<UseCaseResult<OwnSessionView[]>> {
  if (actor.userId === null) return fail(errors.unauthenticated());
  return ok(await listOwnSessions(actor.userId, actor.sessionId));
}

export async function closeOwnSession(actor: ActorContext, sessionId: string): Promise<UseCaseResult<{ closed: boolean }>> {
  if (actor.userId === null) return fail(errors.unauthenticated());

  const session = await db().session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, revokedAt: true },
  });

  // Una sesión ajena responde NOT_FOUND, no FORBIDDEN: en el portal personal,
  // confirmar que el identificador existe ya sería revelar de más.
  if (session === null || session.userId !== actor.userId) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'WARNING',
        actorId: actor.actorId === '' ? null : actor.actorId,
        detail: { resource: 'Session', reason: 'sesión de otra persona' },
        correlationId: actor.correlationId,
      }),
    );
    return fail(errors.notFound('la sesión no pertenece a la persona que la cierra'));
  }

  if (session.revokedAt !== null) return ok({ closed: false });

  await transaction(async (tx) => {
    await revokeSession(tx, sessionId, 'LOGOUT');
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      objectKind: 'Session',
      objectId: sessionId,
      outcome: 'SUCCESS',
      reason: 'cierre solicitado por la persona titular',
    });
  });

  return ok({ closed: true });
}

/** Cierra todas las sesiones propias salvo la actual. */
export async function closeOtherSessions(actor: ActorContext): Promise<UseCaseResult<{ closed: number }>> {
  if (actor.userId === null) return fail(errors.unauthenticated());

  const closed = await transaction(async (tx) => {
    const count = await revokeAllSessions(tx, actor.userId!, 'ADMIN_ACTION', {
      ...(actor.sessionId === null ? {} : { exceptSessionId: actor.sessionId }),
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ALL_SESSIONS_REVOKED,
      objectKind: 'User',
      objectId: actor.userId!,
      outcome: 'SUCCESS',
      reason: 'cierre masivo solicitado por la persona titular',
      metadata: { closed: count },
    });
    return count;
  });

  return ok({ closed });
}

/** Cierre de la sesión en curso. */
export async function logout(actor: ActorContext): Promise<UseCaseResult<{ ok: true }>> {
  if (actor.sessionId === null) return ok({ ok: true });

  await transaction(async (tx) => {
    await revokeSession(tx, actor.sessionId!, 'LOGOUT');
    await recordSecurity(tx, {
      kind: 'LOGOUT',
      actorId: actor.actorId === '' ? null : actor.actorId,
      ipHash: actor.ipHash,
      correlationId: actor.correlationId,
    });
  });

  return ok({ ok: true });
}
