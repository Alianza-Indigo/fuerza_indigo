import { del } from '@vercel/blob';
import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { logger } from '@/platform/observability/logger';

/**
 * Aplicación de las políticas de conservación (PRD §17.4, §20.3).
 *
 * Orden de precedencia, sin excepciones:
 *
 *  1. **Bloqueo legal activo** → no se toca nada, punto.
 *  2. **Referencia viva** → se pospone y queda constancia.
 *  3. Vencida la política → se aplica su acción declarada.
 *
 * El borrado físico va **después** del borrado lógico y de la auditoría: si el
 * almacén falla, el registro ya refleja la decisión y el siguiente ciclo lo
 * reintenta, en lugar de perder la constancia de lo que se quiso hacer.
 */

export interface RetentionResult {
  readonly evaluated: number;
  readonly anonymized: number;
  readonly deleted: number;
  readonly archived: number;
  readonly heldByLegalHold: number;
  readonly postponedByReference: number;
}

export async function applyRetention(actor: ActorContext, limit = 100): Promise<UseCaseResult<RetentionResult>> {
  const decision = can(actor, 'files.retention.manage', { kind: 'RetentionPolicy' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const candidates = await db().fileObject.findMany({
    where: { deletedAt: null, retentionPolicyId: { not: null } },
    take: limit,
    select: {
      id: true,
      legalEntityId: true,
      createdAt: true,
      contextKind: true,
      contextId: true,
      legalHold: { select: { id: true, releasedAt: true } },
      retentionPolicy: { select: { code: true, retentionMonths: true, actionOnExpiry: true } },
      versions: { select: { blobPathname: true } },
    },
  });

  const result: { -readonly [K in keyof RetentionResult]: RetentionResult[K] } = {
    evaluated: candidates.length,
    anonymized: 0,
    deleted: 0,
    archived: 0,
    heldByLegalHold: 0,
    postponedByReference: 0,
  };

  const now = Date.now();

  for (const file of candidates) {
    const policy = file.retentionPolicy;
    if (policy === null) continue;

    const expiresAt = new Date(file.createdAt);
    expiresAt.setMonth(expiresAt.getMonth() + policy.retentionMonths);
    if (expiresAt.getTime() > now) continue;

    // 1. El bloqueo legal manda sobre la retención.
    if (file.legalHold !== null && file.legalHold.releasedAt === null) {
      result.heldByLegalHold += 1;
      continue;
    }

    // 2. Un objeto referenciado por un expediente vivo no se toca.
    //    En la Fase 1 el único contexto con expedientes es el propio sistema;
    //    las fases que introducen casos, CIAN y CENI amplían esta comprobación
    //    con sus tablas. Mientras tanto se comprueba lo que existe.
    if (file.contextKind !== 'SYSTEM' && file.contextId !== null) {
      result.postponedByReference += 1;
      continue;
    }

    await transaction(async (tx) => {
      switch (policy.actionOnExpiry) {
        case 'ANONYMIZE':
          await tx.fileObject.update({
            where: { id: file.id },
            data: {
              originalFileName: 'documento-anonimizado',
              ownerPersonId: null,
              archivedAt: new Date(),
              updatedByActorId: actor.actorId,
            },
          });
          result.anonymized += 1;
          break;

        case 'ARCHIVE_COLD':
          await tx.fileObject.update({
            where: { id: file.id },
            data: { archivedAt: new Date(), updatedByActorId: actor.actorId },
          });
          result.archived += 1;
          break;

        case 'DELETE':
          await tx.fileObject.update({
            where: { id: file.id },
            data: { deletedAt: new Date(), updatedByActorId: actor.actorId },
          });
          result.deleted += 1;
          break;
      }

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.RETENTION_APPLIED,
        objectKind: 'FileObject',
        objectId: file.id,
        outcome: 'SUCCESS',
        legalEntityId: file.legalEntityId,
        reason: `Política ${policy.code}: ${policy.actionOnExpiry} tras ${policy.retentionMonths} meses`,
      });
    });

    if (policy.actionOnExpiry === 'DELETE') {
      for (const version of file.versions) {
        try {
          await del(version.blobPathname, { token: env().BLOB_READ_WRITE_TOKEN });
        } catch (error) {
          logger.warn('No se pudo borrar el objeto del almacén; se reintentará', {
            module: 'files',
            correlationId: actor.correlationId,
            context: { fileObjectId: file.id, error },
          });
        }
      }
    }
  }

  return ok(result);
}
