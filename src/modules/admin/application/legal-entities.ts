import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

export interface LegalEntityView {
  readonly id: string;
  readonly code: string;
  readonly legalName: string;
  readonly shortName: string;
  readonly kind: string;
  readonly taxId: string | null;
  readonly registryNumber: string | null;
  readonly address: string;
  readonly contactEmail: string;
  readonly privacyNoticeUrl: string | null;
  readonly documentSeriesPrefix: string;
  readonly isActive: boolean;
  readonly rowVersion: number;
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
      taxId: true,
      registryNumber: true,
      address: true,
      contactEmail: true,
      privacyNoticeUrl: true,
      documentSeriesPrefix: true,
      isActive: true,
      rowVersion: true,
    },
  });
  return ok(rows);
}

const optionalText = z.string().trim().max(500).transform((value) => value === '' ? null : value);

export const updateLegalEntitySchema = z.object({
  legalEntityId: z.uuid(),
  rowVersion: z.number().int().nonnegative(),
  legalName: z.string().trim().min(5).max(200),
  shortName: z.string().trim().min(2).max(80),
  taxId: optionalText,
  registryNumber: optionalText,
  address: z.string().trim().min(10).max(400),
  contactEmail: z.email().max(320),
  privacyNoticeUrl: z.union([z.literal(''), z.url().max(500)]).transform((value) => value === '' ? null : value),
  reason: z.string().trim().min(10).max(1000),
});

export type UpdateLegalEntityInput = z.input<typeof updateLegalEntitySchema>;

/** Completa o actualiza la ficha de una entidad jurídica ya constituida. */
export async function updateLegalEntity(
  actor: ActorContext,
  input: UpdateLegalEntityInput,
): Promise<UseCaseResult<{ legalEntityId: string }>> {
  const parsed = updateLegalEntitySchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(details));
  }

  const data = parsed.data;
  const context = { ...actor, reason: data.reason };
  const decision = can(context, 'institution.legal_entity.manage', {
    kind: 'LegalEntity',
    id: data.legalEntityId,
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const exists = await db().legalEntity.findUnique({ where: { id: data.legalEntityId }, select: { id: true } });
  if (exists === null) return fail(errors.notFound('La entidad jurídica no existe.'));

  const changed = await transaction(async (tx) => {
    const updated = await tx.legalEntity.updateMany({
      where: { id: data.legalEntityId, rowVersion: data.rowVersion },
      data: {
        legalName: data.legalName,
        shortName: data.shortName,
        taxId: data.taxId,
        registryNumber: data.registryNumber,
        address: data.address,
        contactEmail: data.contactEmail,
        privacyNoticeUrl: data.privacyNoticeUrl,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) return false;

    await recordAudit(tx, context, {
      action: AUDIT_ACTIONS.LEGAL_ENTITY_UPDATED,
      objectKind: 'LegalEntity',
      objectId: data.legalEntityId,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      reason: data.reason,
      metadata: { campos: ['legalName', 'shortName', 'taxId', 'registryNumber', 'address', 'contactEmail', 'privacyNoticeUrl'] },
    });
    return true;
  });

  if (!changed) return fail(errors.conflict('La ficha cambió mientras la editabas. Recarga la página y revisa los datos.'));
  return ok({ legalEntityId: data.legalEntityId });
}
