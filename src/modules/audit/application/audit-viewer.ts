import { z } from 'zod';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Visor de bitácoras con permisos (PRD §20.4).
 *
 * El visor filtra **por el alcance del actor**: un auditor ve su ámbito
 * definido, nunca todo el sistema. El filtro se aplica en la consulta, no en la
 * vista, de modo que los eventos fuera de alcance no llegan a cargarse.
 *
 * La paginación es por cursor porque la bitácora crece sin techo y un
 * desplazamiento por número de página se vuelve más lento cuanto más atrás se
 * mira, justo cuando se investiga algo antiguo.
 */

export const auditFilterSchema = z.object({
  objectKind: z.string().max(60).optional(),
  objectId: z.string().max(60).optional(),
  action: z.string().max(120).optional(),
  actorId: z.uuid().optional(),
  legalEntityId: z.uuid().optional(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(),
  correlationId: z.string().max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;

export interface AuditEventView {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly objectKind: string;
  readonly objectId: string;
  readonly outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  readonly reason: string | null;
  readonly actorLabel: string;
  readonly correlationId: string;
  readonly chainSequence: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export async function queryAuditEvents(
  actor: ActorContext,
  filter: AuditFilter,
): Promise<UseCaseResult<Page<AuditEventView>>> {
  const parsed = auditFilterSchema.safeParse(filter);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const decision = can(actor, 'audit.audit.read', {
    kind: 'AuditEvent',
    legalEntityId: parsed.data.legalEntityId ?? null,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  // Alcance del actor: si sus nombramientos están acotados a entidades
  // jurídicas, la consulta no puede salir de ellas aunque el filtro pida más.
  const scopedEntities =
    actor.actorKind === 'ROOT_SUPERADMIN' || actor.legalEntityScope.length === 0
      ? undefined
      : actor.legalEntityScope;

  const where = {
    ...(data.objectKind === undefined ? {} : { objectKind: data.objectKind }),
    ...(data.objectId === undefined ? {} : { objectId: data.objectId }),
    ...(data.action === undefined ? {} : { action: data.action }),
    ...(data.actorId === undefined ? {} : { actorId: data.actorId }),
    ...(data.outcome === undefined ? {} : { outcome: data.outcome }),
    ...(data.correlationId === undefined ? {} : { correlationId: data.correlationId }),
    ...(data.from === undefined && data.to === undefined
      ? {}
      : {
          occurredAt: {
            ...(data.from === undefined ? {} : { gte: new Date(data.from) }),
            ...(data.to === undefined ? {} : { lte: new Date(data.to) }),
          },
        }),
    ...(scopedEntities === undefined
      ? data.legalEntityId === undefined
        ? {}
        : { legalEntityId: data.legalEntityId }
      : { legalEntityId: { in: [...scopedEntities] } }),
  };

  const rows = await db().auditEvent.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: data.limit + 1,
    ...(data.cursor === undefined ? {} : { cursor: { id: data.cursor }, skip: 1 }),
    select: {
      id: true,
      occurredAt: true,
      action: true,
      objectKind: true,
      objectId: true,
      outcome: true,
      reason: true,
      correlationId: true,
      chainSequence: true,
      actorId: true,
    },
  });

  // El nombre legible del actor se resuelve aparte: incluirlo en la selección
  // anidada obligaría a una unión por cada fila de la página.
  const actorLabels = new Map(
    (
      await db().actor.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.actorId))] } },
        select: { id: true, label: true },
      })
    ).map((actorRow) => [actorRow.id, actorRow.label]),
  );

  const hasMore = rows.length > data.limit;
  const page = hasMore ? rows.slice(0, data.limit) : rows;

  return ok({
    items: page.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      action: row.action,
      objectKind: row.objectKind,
      objectId: row.objectId,
      outcome: row.outcome,
      reason: row.reason,
      actorLabel: actorLabels.get(row.actorId) ?? 'Actor desconocido',
      correlationId: row.correlationId,
      chainSequence: row.chainSequence.toString(),
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  });
}

export interface SecurityEventView {
  readonly id: string;
  readonly occurredAt: Date;
  readonly kind: string;
  readonly severity: string;
  readonly subjectLabel: string | null;
  readonly correlationId: string;
}

export async function querySecurityEvents(
  actor: ActorContext,
  filter: { limit?: number; cursor?: string; severity?: 'INFO' | 'WARNING' | 'CRITICAL' } = {},
): Promise<UseCaseResult<Page<SecurityEventView>>> {
  const decision = can(actor, 'audit.security.read', { kind: 'SecurityEvent' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);

  const rows = await db().securityEvent.findMany({
    where: filter.severity === undefined ? {} : { severity: filter.severity },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(filter.cursor === undefined ? {} : { cursor: { id: filter.cursor }, skip: 1 }),
    select: {
      id: true,
      occurredAt: true,
      kind: true,
      severity: true,
      subjectLabel: true,
      correlationId: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return ok({
    items: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  });
}
