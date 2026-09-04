import { createHash } from 'node:crypto';
import type { AuditOutcome, Prisma, SecurityEventKind, SecuritySeverity } from '@prisma-client/client';
import type { Tx } from '@/platform/db/unit-of-work';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { sanitize } from '@/platform/observability/logger';
import type { AuditAction } from '@/platform/audit/actions';

/**
 * Bitácora institucional anexable y encadenada (PRD §20.4, ADR-0011).
 *
 * Tres propiedades que no son negociables:
 *
 *  1. **Transaccional.** El evento se escribe con el mismo `tx` que el acto. No
 *     existe forma de registrar el acto sin la evidencia ni al revés.
 *  2. **Anexable.** El rol de aplicación carece de UPDATE y DELETE sobre la
 *     tabla; lo garantiza PostgreSQL, no esta clase.
 *  3. **Encadenada.** Cada evento incorpora el hash del anterior de su
 *     partición. Suprimir uno rompe la cadena de forma detectable.
 */

export const GLOBAL_CHAIN = 'GLOBAL';
const ZERO_HASH = '0'.repeat(64);

export interface AuditInput {
  readonly action: AuditAction;
  readonly objectKind: string;
  readonly objectId: string;
  readonly outcome: AuditOutcome;
  readonly legalEntityId?: string | null;
  readonly territorialUnitId?: string | null;
  readonly onBehalfOfPersonId?: string | null;
  readonly reason?: string | null;
  readonly scope?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

/** Campos que entran en el hash. El orden es parte del contrato. */
/**
 * Separador de campos del resumen.
 *
 * El byte nulo no puede aparecer dentro de un `text` de PostgreSQL, de modo que
 * la unión es inyectiva: ninguna combinación distinta de campos produce la misma
 * cadena. Se escribe como secuencia de escape y **no** como byte literal: un
 * byte nulo incrustado en el archivo lo vuelve binario para git y para las
 * búsquedas, y un módulo cuyo diff no se ve es un módulo que nadie revisa.
 */
const SEPARADOR = '\u0000';

/**
 * Resumen del evento, encadenado con el del anterior.
 *
 * Se exporta para poder comprobar de forma directa la propiedad de la que
 * depende toda la garantía: que dos eventos distintos no producen el mismo
 * resumen. La cadena completa se verifica además de extremo a extremo en
 * `verifyAuditChain`.
 */
export function computeHash(input: {
  previousHash: string;
  chainKey: string;
  chainSequence: bigint;
  occurredAt: Date;
  actorId: string;
  action: string;
  objectKind: string;
  objectId: string;
  outcome: string;
  correlationId: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.previousHash,
        input.chainKey,
        input.chainSequence.toString(),
        input.occurredAt.toISOString(),
        input.actorId,
        input.action,
        input.objectKind,
        input.objectId,
        input.outcome,
        input.correlationId,
      ].join(SEPARADOR),
    )
    .digest('hex');
}

/**
 * Escribe un evento de auditoría dentro de la transacción del acto.
 *
 * Toma un bloqueo consultivo de transacción sobre la partición para que dos
 * escrituras simultáneas no calculen la misma posición de cadena. El bloqueo se
 * libera solo al confirmar o revertir, sin intervención.
 */
export async function recordAudit(tx: Tx, actor: ActorContext, input: AuditInput): Promise<{ id: string; hash: string }> {
  const chainKey = input.legalEntityId ?? GLOBAL_CHAIN;

  // Serializa la partición durante esta transacción.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chainKey}))`;

  const previous = await tx.auditEvent.findFirst({
    where: { chainKey },
    orderBy: { chainSequence: 'desc' },
    select: { hash: true, chainSequence: true },
  });

  const chainSequence = (previous?.chainSequence ?? 0n) + 1n;
  const previousHash = previous?.hash ?? ZERO_HASH;
  const occurredAt = new Date();

  const hash = computeHash({
    previousHash,
    chainKey,
    chainSequence,
    occurredAt,
    actorId: actor.actorId,
    action: input.action,
    objectKind: input.objectKind,
    objectId: input.objectId,
    outcome: input.outcome,
    correlationId: actor.correlationId,
  });

  const created = await tx.auditEvent.create({
    data: {
      occurredAt,
      actorId: actor.actorId,
      onBehalfOfPersonId: input.onBehalfOfPersonId ?? null,
      action: input.action,
      objectKind: input.objectKind,
      objectId: input.objectId,
      legalEntityId: input.legalEntityId ?? null,
      territorialUnitId: input.territorialUnitId ?? null,
      outcome: input.outcome,
      reason: input.reason ?? actor.reason,
      scope: sanitize(input.scope ?? {}) as Prisma.InputJsonValue,
      metadata: sanitize(input.metadata ?? {}) as Prisma.InputJsonValue,
      correlationId: actor.correlationId,
      chainKey,
      chainSequence,
      previousHash,
      hash,
    },
    select: { id: true, hash: true },
  });

  return created;
}

/**
 * Verifica la integridad de una partición de la cadena.
 *
 * Devuelve el primer punto de ruptura, si lo hay. Es la comprobación que da
 * sentido al encadenamiento: sin ella, el hash sería decoración.
 */
export async function verifyAuditChain(
  tx: Tx,
  chainKey: string,
): Promise<{ ok: true; verified: number } | { ok: false; brokenAtSequence: bigint; reason: string }> {
  const events = await tx.auditEvent.findMany({
    where: { chainKey },
    orderBy: { chainSequence: 'asc' },
    select: {
      chainSequence: true,
      previousHash: true,
      hash: true,
      occurredAt: true,
      actorId: true,
      action: true,
      objectKind: true,
      objectId: true,
      outcome: true,
      correlationId: true,
    },
  });

  let expectedPrevious = ZERO_HASH;
  let expectedSequence = 1n;

  for (const event of events) {
    if (event.chainSequence !== expectedSequence) {
      return {
        ok: false,
        brokenAtSequence: event.chainSequence,
        reason: `hueco en la sucesión: se esperaba ${expectedSequence} y se encontró ${event.chainSequence}`,
      };
    }
    if (event.previousHash !== expectedPrevious) {
      return { ok: false, brokenAtSequence: event.chainSequence, reason: 'el hash anterior no corresponde' };
    }
    const recomputed = computeHash({
      previousHash: event.previousHash,
      chainKey,
      chainSequence: event.chainSequence,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      action: event.action,
      objectKind: event.objectKind,
      objectId: event.objectId,
      outcome: event.outcome,
      correlationId: event.correlationId,
    });
    if (recomputed !== event.hash) {
      return { ok: false, brokenAtSequence: event.chainSequence, reason: 'el contenido no corresponde con su hash' };
    }
    expectedPrevious = event.hash;
    expectedSequence += 1n;
  }

  return { ok: true, verified: events.length };
}

/* -------------------------------------------------------------------------- */
/* Bitácora de seguridad                                                      */
/* -------------------------------------------------------------------------- */

export interface SecurityInput {
  readonly kind: SecurityEventKind;
  /** Huella estable para agrupar. Nunca el identificador en claro (ADR-0039). */
  readonly subjectKey?: string | null;
  readonly severity?: SecuritySeverity;
  readonly actorId?: string | null;
  /** Nunca la dirección de correo completa en eventos de fallo. */
  readonly subjectLabel?: string | null;
  readonly ipHash?: string | null;
  readonly userAgentClass?: 'MOBILE' | 'DESKTOP' | 'BOT' | 'UNKNOWN' | null;
  readonly detail?: Record<string, unknown>;
  readonly correlationId: string;
}

export async function recordSecurity(tx: Tx, input: SecurityInput): Promise<void> {
  await tx.securityEvent.create({
    data: {
      kind: input.kind,
      severity: input.severity ?? 'INFO',
      actorId: input.actorId ?? null,
      subjectLabel: input.subjectLabel ?? null,
      subjectKey: input.subjectKey ?? null,
      ipHash: input.ipHash ?? null,
      userAgentClass: input.userAgentClass ?? null,
      detail: sanitize(input.detail ?? {}) as Prisma.InputJsonValue,
      correlationId: input.correlationId,
    },
  });
}

/**
 * Oculta parcialmente un correo para poder investigar sin exponerlo.
 * `persona@dominio.lat` → `pe…a@dominio.lat`
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '[correo no válido]';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 3) return `${local[0] ?? ''}…${domain}`;
  return `${local.slice(0, 2)}…${local.slice(-1)}${domain}`;
}
