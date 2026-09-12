import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';

export interface StartupStatus {
  readonly legalEntityReady: boolean;
  readonly membershipNoticeReady: boolean;
  readonly publicNoticeReady: boolean;
  readonly rulesReady: boolean;
  readonly executiveSecretaryReady: boolean;
  readonly people: number;
  readonly applications: number;
  readonly memberships: number;
}

/** Estado real de los requisitos que desbloquean la primera operación. */
export async function startupStatus(actor: ActorContext): Promise<UseCaseResult<StartupStatus>> {
  const decision = can(actor, 'institution.legal_entity.read', { kind: 'LegalEntity' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const now = new Date();
  const fuerza = await db().legalEntity.findUnique({
    where: { code: 'FUERZA_INDIGO' },
    select: { id: true, address: true, registryNumber: true, taxId: true },
  });
  if (fuerza === null) return fail(errors.notFound('Falta la entidad jurídica Fuerza Índigo. Ejecute la semilla.'));

  const [membershipNotice, publicNotice, rules, secretary, people, applications, memberships] = await Promise.all([
    db().consentVersion.count({
      where: { legalEntityId: fuerza.id, code: 'PRIVACY_NOTICE_MEMBERSHIP_INTAKE', status: 'PUBLISHED' },
    }),
    db().consentVersion.count({
      where: { legalEntityId: fuerza.id, code: 'PRIVACY_NOTICE_PUBLIC_INTAKE', status: 'PUBLISHED' },
    }),
    db().normativeRuleSet.count({ where: { status: 'IN_FORCE' } }),
    db().roleAssignment.count({
      where: {
        legalEntityId: fuerza.id,
        role: { code: 'EXECUTIVE_SECRETARY' },
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    }),
    db().person.count({ where: { archivedAt: null } }),
    db().membershipApplication.count({ where: { legalEntityId: fuerza.id } }),
    db().membership.count({ where: { legalEntityId: fuerza.id, status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
  ]);

  return ok({
    legalEntityReady:
      !fuerza.address.toLocaleLowerCase('es-MX').startsWith('por definir') &&
      (fuerza.registryNumber !== null || fuerza.taxId !== null),
    membershipNoticeReady: membershipNotice > 0,
    publicNoticeReady: publicNotice > 0,
    rulesReady: rules > 0,
    executiveSecretaryReady: secretary > 0,
    people,
    applications,
    memberships,
  });
}
