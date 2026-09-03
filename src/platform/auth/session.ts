import type { SessionRevoke } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import type { Tx } from '@/platform/db/unit-of-work';
import { hashToken, newOpaqueToken } from '@/platform/kernel/ids';

/**
 * Sesiones en base de datos (ADR-0003, PRD §20.1).
 *
 * El testigo es opaco y se entrega una sola vez; la base guarda solo su hash.
 * Cada validación consulta la base: a cambio de ese costo, la revocación surte
 * efecto de inmediato, que es lo que el PRD exige y lo que un JSON Web Token no
 * puede ofrecer.
 */

/** Duración de la sesión ordinaria. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Duración de la sesión del Superadmin raíz: corta a propósito (PRD §4.4). */
export const SUPERADMIN_SESSION_TTL_MS = 60 * 60 * 1000;

export const SESSION_COOKIE = 'fi_session';
export const SUPERADMIN_COOKIE = 'fi_root_session';

export interface IssuedSession {
  /** Se entrega a la persona una sola vez; nunca se vuelve a poder leer. */
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface IssueSessionInput {
  readonly userId: string | null;
  readonly actorKind: 'PERSON' | 'ROOT_SUPERADMIN';
  readonly sessionVersion: number;
  readonly ipHash: string | null;
  readonly userAgentSummary: string | null;
  readonly deviceLabel?: string | null;
  readonly ttlMs?: number;
}

export async function issueSession(tx: Tx, input: IssueSessionInput): Promise<IssuedSession> {
  const token = newOpaqueToken();
  const ttl = input.ttlMs ?? (input.actorKind === 'ROOT_SUPERADMIN' ? SUPERADMIN_SESSION_TTL_MS : SESSION_TTL_MS);
  const expiresAt = new Date(Date.now() + ttl);

  const session = await tx.session.create({
    data: {
      userId: input.userId,
      actorKind: input.actorKind,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash: input.ipHash,
      userAgentSummary: input.userAgentSummary,
      deviceLabel: input.deviceLabel ?? null,
      sessionVersion: input.sessionVersion,
    },
    select: { id: true },
  });

  return { token, sessionId: session.id, expiresAt };
}

export interface ResolvedSession {
  readonly sessionId: string;
  readonly userId: string | null;
  readonly actorKind: 'PERSON' | 'ROOT_SUPERADMIN';
  readonly expiresAt: Date;
}

/**
 * Resuelve un testigo a la sesión viva que le corresponde.
 *
 * Devuelve `null` ante cualquier motivo de invalidez, sin distinguir entre
 * inexistente, revocada, vencida o desfasada por versión: distinguirlos daría
 * información útil a quien prueba testigos.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const session = await db().session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      actorKind: true,
      expiresAt: true,
      revokedAt: true,
      sessionVersion: true,
      user: { select: { sessionVersion: true, status: true } },
    },
  });

  if (session === null) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  if (session.actorKind === 'PERSON') {
    if (session.user === null) return null;
    if (session.user.status !== 'ACTIVE') return null;
    // El incremento de `sessionVersion` en la cuenta invalida sus sesiones sin
    // tener que recorrer y actualizar cada fila.
    if (session.user.sessionVersion !== session.sessionVersion) return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    actorKind: session.actorKind,
    expiresAt: session.expiresAt,
  };
}

/** Marca actividad. No renueva la vigencia: la sesión tiene duración fija. */
export async function touchSession(sessionId: string): Promise<void> {
  await db().session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });
}

export async function revokeSession(tx: Tx, sessionId: string, reason: SessionRevoke): Promise<void> {
  await tx.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoca todas las sesiones de una cuenta e incrementa su versión, de modo que
 * cualquier testigo emitido antes deje de ser válido aunque no se haya marcado.
 */
export async function revokeAllSessions(
  tx: Tx,
  userId: string,
  reason: SessionRevoke,
  options: { exceptSessionId?: string } = {},
): Promise<number> {
  const result = await tx.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId === undefined ? {} : { id: { not: options.exceptSessionId } }),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });

  const cuenta = await tx.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  // La sesión exceptuada se lleva consigo la versión nueva.
  //
  // Sin esto, «cerrar todo lo demás» cerraba también la sesión desde la que se
  // pedía: el incremento de versión invalida por definición todas las sesiones
  // de la cuenta, incluida la que se acababa de excluir del `updateMany`. La
  // pantalla prometía conservarla y la cerraba.
  if (options.exceptSessionId !== undefined) {
    await tx.session.update({
      where: { id: options.exceptSessionId },
      data: { sessionVersion: cuenta.sessionVersion },
    });
  }

  return result.count;
}

export interface OwnSessionView {
  readonly id: string;
  readonly issuedAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly deviceLabel: string | null;
  readonly userAgentSummary: string | null;
  readonly isCurrent: boolean;
}

/** Sesiones propias de una persona (PRD §20.1). */
export async function listOwnSessions(userId: string, currentSessionId: string | null): Promise<OwnSessionView[]> {
  const sessions = await db().session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      issuedAt: true,
      lastSeenAt: true,
      expiresAt: true,
      deviceLabel: true,
      userAgentSummary: true,
    },
  });
  return sessions.map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
}

/** Atributos de la cookie de sesión (docs/SECURITY.md §2). */
export function sessionCookieOptions(expiresAt: Date, strict: boolean) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: strict ? ('strict' as const) : ('lax' as const),
    path: '/',
    expires: expiresAt,
  };
}
