import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

export type Person360Mode = 'PERSON_360' | 'VIEW_AS';

export interface Person360View {
  readonly identity: {
    readonly id: string;
    readonly publicId: string;
    readonly displayName: string;
    readonly preferredName: string | null;
    readonly curp: string | null;
    readonly birthDate: Date | null;
    readonly genderIdentity: string;
    readonly nationality: string | null;
    readonly primaryEmail: string | null;
    readonly primaryPhone: string | null;
    readonly alternateContact: string | null;
    readonly addressLine: string | null;
    readonly postalCode: string | null;
    readonly stateCode: string | null;
    readonly municipalityCode: string | null;
    readonly territory: string | null;
    readonly archivedAt: Date | null;
  };
  readonly account: null | {
    readonly id: string;
    readonly email: string;
    readonly status: string;
    readonly emailVerifiedAt: Date | null;
    readonly lastLoginAt: Date | null;
    readonly lockedUntil: Date | null;
    readonly hasPassword: boolean;
    readonly activeSessions: number;
  };
  readonly roles: readonly {
    readonly id: string;
    readonly role: string;
    readonly legalEntity: string | null;
    readonly organization: string | null;
    readonly territories: readonly string[];
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly revokedAt: Date | null;
  }[];
  readonly applications: readonly {
    readonly id: string;
    readonly folio: string;
    readonly category: string;
    readonly type: string;
    readonly legalEntity: string;
    readonly status: string;
    readonly submittedAt: Date | null;
    readonly resolutionAt: Date | null;
  }[];
  readonly memberships: readonly {
    readonly id: string;
    readonly publicId: string;
    readonly memberNumber: string;
    readonly category: string;
    readonly type: string;
    readonly legalEntity: string;
    readonly status: string;
    readonly startedAt: Date;
    readonly expiresAt: Date | null;
    readonly territory: string | null;
  }[];
  readonly beneficiaries: readonly {
    readonly id: string;
    readonly publicId: string;
    readonly status: string;
    readonly urgency: string;
    readonly privacyLevel: string;
    readonly legalEntity: string;
    readonly territory: string | null;
  }[];
  readonly representedBeneficiaries: readonly {
    readonly id: string;
    readonly publicId: string;
    readonly name: string;
    readonly status: string;
  }[];
  readonly credentials: readonly {
    readonly id: string;
    readonly publicCode: string;
    readonly kind: string;
    readonly status: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date | null;
  }[];
  readonly directoryPreferences: readonly {
    readonly id: string;
    readonly visibility: string;
    readonly showPhoto: boolean;
    readonly showProfessionalContact: boolean;
    readonly allowSearchEngineIndexing: boolean;
    readonly grantedAt: Date;
    readonly revokedAt: Date | null;
  }[];
  readonly consents: readonly {
    readonly id: string;
    readonly purpose: string;
    readonly title: string;
    readonly version: number;
    readonly grantedAt: Date;
    readonly expiresAt: Date | null;
    readonly revokedAt: Date | null;
  }[];
  readonly payments: readonly {
    readonly id: string;
    readonly publicId: string;
    readonly amountMinor: string;
    readonly currency: string;
    readonly status: string;
    readonly method: string;
    readonly paidAt: Date | null;
    readonly createdAt: Date;
  }[];
  readonly notifications: readonly {
    readonly id: string;
    readonly category: string;
    readonly title: string;
    readonly body: string;
    readonly linkPath: string | null;
    readonly createdAt: Date;
    readonly readAt: Date | null;
    readonly archivedAt: Date | null;
  }[];
  readonly cases: readonly {
    readonly participationId: string;
    readonly publicId: string;
    readonly folio: string;
    readonly domain: string;
    readonly type: string;
    readonly priority: string;
    readonly status: string;
    readonly role: string;
    readonly canViewCase: boolean;
    readonly openedAt: Date;
    readonly legalEntity: string;
  }[];
  readonly documents: readonly {
    readonly id: string;
    readonly publicId: string;
    readonly subjectKind: string;
    readonly folio: string | null;
    readonly status: string;
    readonly issuedAt: Date;
    readonly template: string;
    readonly legalEntity: string;
  }[];
  readonly signedDocuments: readonly {
    readonly signatureId: string;
    readonly publicId: string;
    readonly folio: string | null;
    readonly status: string;
    readonly signedAt: Date;
    readonly signatureKind: string;
    readonly template: string;
  }[];
  readonly audit: readonly {
    readonly id: string;
    readonly occurredAt: Date;
    readonly action: string;
    readonly objectKind: string;
    readonly outcome: string;
    readonly actorLabel: string;
  }[];
}

function displayName(person: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
  preferredName: string | null;
}): string {
  return (
    person.preferredName ??
    [person.givenName, person.middleName, person.familyName, person.secondFamilyName]
      .filter((part): part is string => part !== null && part !== '')
      .join(' ')
  );
}

export async function getPerson360(
  actor: ActorContext,
  publicId: string,
  mode: Person360Mode = 'PERSON_360',
): Promise<UseCaseResult<Person360View>> {
  const decision = can(actor, 'identity.person.read_sensitive', {
    kind: 'Person',
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const person = await db().person.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      curp: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      preferredName: true,
      birthDate: true,
      genderIdentity: true,
      nationality: true,
      primaryEmail: true,
      primaryPhone: true,
      alternateContact: true,
      addressLine: true,
      postalCode: true,
      stateCode: true,
      municipalityCode: true,
      archivedAt: true,
      territorialUnit: { select: { name: true } },
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          lockedUntil: true,
          credentials: {
            where: { type: 'PASSWORD', revokedAt: null },
            take: 1,
            select: { id: true },
          },
          sessions: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
            select: { id: true },
          },
          roleAssignments: {
            orderBy: { startsAt: 'desc' },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              revokedAt: true,
              role: { select: { code: true } },
              legalEntity: { select: { shortName: true } },
              organization: { select: { legalName: true, tradeName: true } },
              territorialScopes: {
                select: { territorialUnit: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (person === null) return fail(errors.notFound('Esa persona no existe.'));

  const [
    applications,
    memberships,
    beneficiaries,
    representedBeneficiaries,
    credentials,
    directoryPreferences,
    consents,
    payments,
    notifications,
    cases,
    signedDocuments,
    audit,
  ] = await Promise.all([
    db().membershipApplication.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        folio: true,
        category: true,
        status: true,
        submittedAt: true,
        resolutionAt: true,
        membershipType: { select: { name: true } },
        legalEntity: { select: { shortName: true } },
      },
    }),
    db().membership.findMany({
      where: { personId: person.id },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        publicId: true,
        memberNumber: true,
        category: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        membershipType: { select: { name: true } },
        legalEntity: { select: { shortName: true } },
        territorialUnit: { select: { name: true } },
      },
    }),
    db().protectedBeneficiary.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        publicId: true,
        status: true,
        urgencyLevel: true,
        privacyLevel: true,
        legalEntity: { select: { shortName: true } },
        territorialUnit: { select: { name: true } },
      },
    }),
    db().protectedBeneficiary.findMany({
      where: { responsiblePersonId: person.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        publicId: true,
        status: true,
        person: {
          select: {
            givenName: true,
            middleName: true,
            familyName: true,
            secondFamilyName: true,
            preferredName: true,
          },
        },
      },
    }),
    db().memberCredential.findMany({
      where: { personId: person.id },
      orderBy: { issuedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        publicCode: true,
        credentialKind: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
      },
    }),
    db().directoryPreference.findMany({
      where: { personId: person.id },
      orderBy: { grantedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        visibility: true,
        showPhoto: true,
        showProfessionalContact: true,
        allowSearchEngineIndexing: true,
        grantedAt: true,
        revokedAt: true,
      },
    }),
    db().consent.findMany({
      where: { personId: person.id },
      orderBy: { grantedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        purpose: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
        consentVersion: { select: { title: true, version: true } },
      },
    }),
    db().payment.findMany({
      where: { billingAccount: { personId: person.id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        publicId: true,
        amountMinor: true,
        currency: true,
        status: true,
        method: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    db().notification.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        category: true,
        title: true,
        body: true,
        linkPath: true,
        createdAt: true,
        readAt: true,
        archivedAt: true,
      },
    }),
    db().caseParticipant.findMany({
      where: { personId: person.id, removedAt: null },
      orderBy: { addedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        role: true,
        canViewCase: true,
        case: {
          select: {
            publicId: true,
            folio: true,
            domain: true,
            caseType: true,
            priority: true,
            status: true,
            openedAt: true,
            legalEntity: { select: { shortName: true } },
          },
        },
      },
    }),
    db().signatureRecord.findMany({
      where: { signerPersonId: person.id, revokedAt: null },
      orderBy: { signedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        signedAt: true,
        signatureKind: true,
        document: {
          select: {
            publicId: true,
            folio: true,
            status: true,
            template: { select: { name: true } },
          },
        },
      },
    }),
    db().auditEvent.findMany({
      where: {
        OR: [
          { onBehalfOfPersonId: person.id },
          { objectKind: 'Person', objectId: person.id },
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: {
        id: true,
        occurredAt: true,
        action: true,
        objectKind: true,
        outcome: true,
        actor: { select: { label: true } },
      },
    }),
  ]);

  const documentSubjects = [
    ...applications.map((item) => ({ subjectKind: 'MEMBERSHIP_APPLICATION' as const, subjectId: item.id })),
    ...memberships.map((item) => ({ subjectKind: 'MEMBERSHIP' as const, subjectId: item.id })),
    ...credentials.map((item) => ({ subjectKind: 'CREDENTIAL' as const, subjectId: item.id })),
    ...payments.map((item) => ({ subjectKind: 'PAYMENT' as const, subjectId: item.id })),
  ];

  const documents =
    documentSubjects.length === 0
      ? []
      : await db().generatedDocument.findMany({
          where: { OR: documentSubjects },
          orderBy: { issuedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            publicId: true,
            subjectKind: true,
            folio: true,
            status: true,
            issuedAt: true,
            template: { select: { name: true } },
            legalEntity: { select: { shortName: true } },
          },
        });

  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SUPERADMIN_ACTION,
      objectKind: 'Person',
      objectId: person.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: person.id,
      metadata: { operation: mode === 'VIEW_AS' ? 'person_view_as_readonly' : 'person_360_read' },
    });
  });

  return ok({
    identity: {
      id: person.id,
      publicId: person.publicId,
      displayName: displayName(person),
      preferredName: person.preferredName,
      curp: person.curp,
      birthDate: person.birthDate,
      genderIdentity: person.genderIdentity,
      nationality: person.nationality,
      primaryEmail: person.primaryEmail,
      primaryPhone: person.primaryPhone,
      alternateContact: person.alternateContact,
      addressLine: person.addressLine,
      postalCode: person.postalCode,
      stateCode: person.stateCode,
      municipalityCode: person.municipalityCode,
      territory: person.territorialUnit?.name ?? null,
      archivedAt: person.archivedAt,
    },
    account:
      person.user === null
        ? null
        : {
            id: person.user.id,
            email: person.user.email,
            status: person.user.status,
            emailVerifiedAt: person.user.emailVerifiedAt,
            lastLoginAt: person.user.lastLoginAt,
            lockedUntil: person.user.lockedUntil,
            hasPassword: person.user.credentials.length > 0,
            activeSessions: person.user.sessions.length,
          },
    roles:
      person.user?.roleAssignments.map((assignment) => ({
        id: assignment.id,
        role: assignment.role.code,
        legalEntity: assignment.legalEntity?.shortName ?? null,
        organization: assignment.organization?.tradeName ?? assignment.organization?.legalName ?? null,
        territories: assignment.territorialScopes.map((scope) => scope.territorialUnit.name),
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        revokedAt: assignment.revokedAt,
      })) ?? [],
    applications: applications.map((item) => ({
      id: item.id,
      folio: item.folio,
      category: item.category,
      type: item.membershipType.name,
      legalEntity: item.legalEntity.shortName,
      status: item.status,
      submittedAt: item.submittedAt,
      resolutionAt: item.resolutionAt,
    })),
    memberships: memberships.map((item) => ({
      id: item.id,
      publicId: item.publicId,
      memberNumber: item.memberNumber,
      category: item.category,
      type: item.membershipType.name,
      legalEntity: item.legalEntity.shortName,
      status: item.status,
      startedAt: item.startedAt,
      expiresAt: item.expiresAt,
      territory: item.territorialUnit?.name ?? null,
    })),
    beneficiaries: beneficiaries.map((item) => ({
      id: item.id,
      publicId: item.publicId,
      status: item.status,
      urgency: item.urgencyLevel,
      privacyLevel: item.privacyLevel,
      legalEntity: item.legalEntity.shortName,
      territory: item.territorialUnit?.name ?? null,
    })),
    representedBeneficiaries: representedBeneficiaries.map((item) => ({
      id: item.id,
      publicId: item.publicId,
      name: displayName(item.person),
      status: item.status,
    })),
    credentials: credentials.map((item) => ({
      id: item.id,
      publicCode: item.publicCode,
      kind: item.credentialKind,
      status: item.status,
      issuedAt: item.issuedAt,
      expiresAt: item.expiresAt,
    })),
    directoryPreferences,
    consents: consents.map((item) => ({
      id: item.id,
      purpose: item.purpose,
      title: item.consentVersion.title,
      version: item.consentVersion.version,
      grantedAt: item.grantedAt,
      expiresAt: item.expiresAt,
      revokedAt: item.revokedAt,
    })),
    payments: payments.map((item) => ({
      ...item,
      amountMinor: item.amountMinor.toString(),
    })),
    notifications,
    cases: cases.map((item) => ({
      participationId: item.id,
      publicId: item.case.publicId,
      folio: item.case.folio,
      domain: item.case.domain,
      type: item.case.caseType,
      priority: item.case.priority,
      status: item.case.status,
      role: item.role,
      canViewCase: item.canViewCase,
      openedAt: item.case.openedAt,
      legalEntity: item.case.legalEntity.shortName,
    })),
    documents: documents.map((item) => ({
      id: item.id,
      publicId: item.publicId,
      subjectKind: item.subjectKind,
      folio: item.folio,
      status: item.status,
      issuedAt: item.issuedAt,
      template: item.template.name,
      legalEntity: item.legalEntity.shortName,
    })),
    signedDocuments: signedDocuments.map((item) => ({
      signatureId: item.id,
      publicId: item.document.publicId,
      folio: item.document.folio,
      status: item.document.status,
      signedAt: item.signedAt,
      signatureKind: item.signatureKind,
      template: item.document.template.name,
    })),
    audit: audit.map((item) => ({
      id: item.id,
      occurredAt: item.occurredAt,
      action: item.action,
      objectKind: item.objectKind,
      outcome: item.outcome,
      actorLabel: item.actor.label,
    })),
  });
}
