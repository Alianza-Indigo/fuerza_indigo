import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';

export interface LegalEntityView {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly shortName: string;
  readonly kind: string;
  readonly documentSeriesPrefix: string;
  readonly isActive: boolean;
}

/** Entidades jurídicas del ecosistema (PRD §2.3). */
export async function listLegalEntities(actor: ActorContext): Promise<UseCaseResult<LegalEntityView[]>> {
  const decision = can(actor, 'institution.legal_entity.read', { kind: 'LegalEntity' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const rows = await db().legalEntity.findMany({
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      legalName: true,
      shortName: true,
      kind: true,
      documentSeriesPrefix: true,
      isActive: true,
    },
  });
  return ok(rows);
}
