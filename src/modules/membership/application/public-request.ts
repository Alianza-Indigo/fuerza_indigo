import { z } from 'zod';

import type { IntakeContext } from '@/modules/support';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { recordAudit } from '@/platform/audit/audit-service';
import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { systemContext } from '@/platform/kernel/actor-context';
import { fingerprint, hashToken, newOpaqueToken, newPublicId } from '@/platform/kernel/ids';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { sendTemplatedMail } from '@/platform/mail/mailer';
import { logger } from '@/platform/observability/logger';

/**
 * Alta pública de afiliación.
 *
 * Las vías de agremiado y agremiado honorario crean directamente una
 * `MembershipApplication` en estado `SUBMITTED`; no pasan por la bandeja de
 * mensajes. La vía protegida crea el registro propio de beneficiario, porque
 * no es membresía, no concede voz ni voto y nunca genera cuota.
 */

export const PUBLIC_MEMBERSHIP_MODALITIES = [
  'UNION_MEMBER',
  'HONORARY_AFFILIATE',
  'PROTECTED_BENEFICIARY',
] as const;
export const PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE = 'PRIVACY_NOTICE_MEMBERSHIP_INTAKE';

const PUBLIC_REGISTRATION_ACTOR_LABEL = 'Registro público de afiliación';
const PUBLIC_REGISTRATION_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxSubmissions: 5 } as const;
const ACCOUNT_SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function optionalText<T extends z.ZodType<string, string>>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
}

export const publicMembershipRequestSchema = z
  .object({
    modality: z.enum(PUBLIC_MEMBERSHIP_MODALITIES, {
      error: () => 'Elige una categoría de registro.',
    }),
    givenName: z.string().trim().min(1, { error: () => 'Escribe tu nombre.' }).max(80),
    familyName: z.string().trim().min(1, { error: () => 'Escribe tu primer apellido.' }).max(80),
    secondFamilyName: optionalText(z.string().trim().max(80)),
    curp: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][AEIOU][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:[0-2]\d|3[01])[HM](?:AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/, {
        error: () => 'Revisa la CURP: debe tener los 18 caracteres del documento oficial.',
      }),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: () => 'Escribe un correo electrónico válido.' }).max(254)),
    phone: optionalText(
      z
        .string()
        .trim()
        .max(30)
        .regex(/^[0-9+()\s-]{7,30}$/, {
          error: () => 'El teléfono sólo lleva números, espacios y los signos + ( ) -.',
        }),
    ),
    territory: z.string().trim().min(2, { error: () => 'Escribe el estado o municipio desde donde haces tu solicitud.' }).max(160),
    occupation: z.string().trim().min(2, { error: () => 'Escribe tu ocupación actual.' }).max(160),
    promoterReference: optionalText(
      z
        .string()
        .trim()
        .min(2, { error: () => 'Escribe el número de agremiado o el nombre del promotor.' })
        .max(160),
    ),
    workRelation: optionalText(z.enum(['SUBORDINATE', 'INDEPENDENT'])),
    otherUnionMembership: optionalText(z.enum(['NONE', 'SAME_TRADE', 'DIFFERENT_TRADE'])),
    otherUnionClarification: optionalText(z.string().trim().max(2000)),
    neurodivergentConnection: optionalText(
      z
        .string()
        .trim()
        .min(30, { error: () => 'Cuéntanos un poco más: con treinta caracteres basta para empezar.' })
        .max(2000),
    ),
    protectedProfile: optionalText(z.enum(['NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'])),
    context: optionalText(z.string().trim().max(2000)),
    ageConfirmed: z.boolean(),
    acceptsStatutes: z.boolean(),
    acceptedPrivacyNotice: z.literal(true, {
      error: () => 'Necesitamos que aceptes el aviso de privacidad para recibir tu solicitud.',
    }),
  })
  .superRefine((value, refinement) => {
    if (value.modality !== 'PROTECTED_BENEFICIARY' && !value.acceptsStatutes) {
      refinement.addIssue({
        code: 'custom',
        path: ['acceptsStatutes'],
        message: 'Para enviar la solicitud debes aceptar los estatutos y las declaraciones.',
      });
    }

    if (value.modality === 'UNION_MEMBER') {
      if (!value.ageConfirmed) {
        refinement.addIssue({
          code: 'custom',
          path: ['ageConfirmed'],
          message: 'Para solicitar afiliación sindical debes confirmar que tienes 15 años o más.',
        });
      }
      if (value.workRelation === undefined) {
        refinement.addIssue({ code: 'custom', path: ['workRelation'], message: 'Elige cómo realizas tu trabajo.' });
      }
      if (value.otherUnionMembership === undefined) {
        refinement.addIssue({
          code: 'custom',
          path: ['otherUnionMembership'],
          message: 'Indica si actualmente perteneces a otro sindicato.',
        });
      }
      if (
        value.otherUnionMembership !== undefined &&
        value.otherUnionMembership !== 'NONE' &&
        (value.otherUnionClarification?.length ?? 0) < 20
      ) {
        refinement.addIssue({
          code: 'custom',
          path: ['otherUnionClarification'],
          message: 'Explica brevemente a qué sindicato perteneces. Con veinte caracteres basta.',
        });
      }
      if (value.neurodivergentConnection === undefined) {
        refinement.addIssue({
          code: 'custom',
          path: ['neurodivergentConnection'],
          message: 'Cuéntanos qué tipo de contacto tienes con personas neurodivergentes en tu trabajo.',
        });
      }
    }

    if (value.modality === 'HONORARY_AFFILIATE' && value.neurodivergentConnection === undefined) {
      refinement.addIssue({
        code: 'custom',
        path: ['neurodivergentConnection'],
        message: 'Cuéntanos qué tipo de contacto tienes con personas neurodivergentes.',
      });
    }

    if (value.modality === 'PROTECTED_BENEFICIARY' && value.protectedProfile === undefined) {
      refinement.addIssue({
        code: 'custom',
        path: ['protectedProfile'],
        message: 'Elige el perfil desde el que solicitas tu registro como beneficiario protegido.',
      });
    }
  });

export type PublicMembershipRequestInput = z.input<typeof publicMembershipRequestSchema>;

function validationDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return details;
}

export interface PublicMembershipRequestResult {
  readonly folio: string;
  readonly destination: 'APPLICATION' | 'PROTECTED_BENEFICIARY';
  /** Forma en que la persona puede terminar de preparar su acceso. */
  readonly accountAccess: 'SETUP_LINK' | 'EMAIL' | 'EXISTING';
  /** Solo se expone al navegador que acaba de crear la cuenta. */
  readonly accountSetupUrl?: string;
}

async function nextApplicationFolio(tx: Tx, prefix: string, year: number): Promise<string> {
  const series = `${prefix}-${year}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`folio:${series}`}))`;
  const used = await tx.membershipApplication.count({ where: { folio: { startsWith: `${series}-` } } });
  return `${series}-${String(used + 1).padStart(5, '0')}`;
}

function protectedProfileLabel(profile: 'NEURODIVERGENT_PERSON' | 'FAMILY_MEMBER' | 'CAREGIVER'): string {
  return profile === 'NEURODIVERGENT_PERSON'
    ? 'Persona neurodivergente'
    : profile === 'FAMILY_MEMBER'
      ? 'Familiar de una persona neurodivergente'
      : 'Persona cuidadora';
}

/** Reutiliza una persona solo cuando la CURP o su cuenta identifican el mismo registro. */
async function existingPerson(curp: string, email: string) {
  const [byCurp, byAccount] = await Promise.all([
    db().person.findUnique({ where: { curp }, select: { id: true, curp: true, primaryEmail: true } }),
    db().user.findUnique({
      where: { email },
      select: { id: true, person: { select: { id: true, curp: true, primaryEmail: true } } },
    }),
  ]);

  if (byCurp !== null && byAccount !== null && byCurp.id !== byAccount.person.id) return { conflict: true as const };
  const person = byCurp ?? byAccount?.person ?? null;
  if (person !== null && person.curp !== null && person.curp !== curp) return { conflict: true as const };
  if (person !== null && person.primaryEmail !== null && person.primaryEmail.toLowerCase() !== email) {
    return { conflict: true as const };
  }
  return {
    conflict: false as const,
    person,
    hasDigitalAccount: person !== null && byAccount?.person.id === person.id,
    userId: person !== null && byAccount?.person.id === person.id ? byAccount.id : null,
  };
}

async function ensureAutomaticPortalRole(
  tx: Tx,
  actor: ReturnType<typeof systemContext>,
  input: {
    userId: string;
    personId: string;
    legalEntityId: string;
    roleCode: 'APPLICANT' | 'PROTECTED_BENEFICIARY';
  },
): Promise<void> {
  const role = await tx.role.findUnique({ where: { code: input.roleCode }, select: { id: true } });
  if (role === null) throw new Error(`Falta el rol automático ${input.roleCode}.`);

  const existing = await tx.roleAssignment.findFirst({
    where: {
      userId: input.userId,
      roleId: role.id,
      legalEntityId: input.legalEntityId,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (existing !== null) return;

  // RoleAssignment conserva una FK histórica a una cuenta otorgante. Para los
  // roles automáticos de autoservicio usamos la cuenta destinataria como ancla;
  // la bitácora deja claro que el actor real fue el registro público del sistema.
  const assignment = await tx.roleAssignment.create({
    data: {
      userId: input.userId,
      roleId: role.id,
      legalEntityId: input.legalEntityId,
      grantedById: input.userId,
      grantReason:
        input.roleCode === 'APPLICANT'
          ? 'Asignación automática al presentar una solicitud pública de afiliación.'
          : 'Asignación automática al registrarse como beneficiario protegido.',
    },
    select: { id: true },
  });
  await recordAudit(tx, actor, {
    action: AUDIT_ACTIONS.ROLE_GRANTED,
    objectKind: 'RoleAssignment',
    objectId: assignment.id,
    outcome: 'SUCCESS',
    legalEntityId: input.legalEntityId,
    onBehalfOfPersonId: input.personId,
    metadata: { role: input.roleCode, origin: 'public-membership-registration', automatic: true },
  });
}

export async function submitPublicMembershipRequest(
  input: PublicMembershipRequestInput,
  context: IntakeContext,
): Promise<UseCaseResult<PublicMembershipRequestResult>> {
  const parsed = publicMembershipRequestSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(validationDetails(parsed.error)));
  const data = parsed.data;
  const now = new Date();
  const originFingerprint = fingerprint(context.ipHash ?? 'origen-desconocido', env().AUTH_SECRET);

  const [recentApplications, recentBeneficiaries] = await Promise.all([
    db().membershipApplication.count({
      where: {
        originFingerprint,
        createdAt: { gte: new Date(now.getTime() - PUBLIC_REGISTRATION_RATE_LIMIT.windowMs) },
      },
    }),
    db().protectedBeneficiary.count({
      where: {
        originFingerprint,
        createdAt: { gte: new Date(now.getTime() - PUBLIC_REGISTRATION_RATE_LIMIT.windowMs) },
      },
    }),
  ]);
  if (recentApplications + recentBeneficiaries >= PUBLIC_REGISTRATION_RATE_LIMIT.maxSubmissions) {
    return fail(errors.rateLimited(Math.ceil(PUBLIC_REGISTRATION_RATE_LIMIT.windowMs / 1000)));
  }

  const entity = await db().legalEntity.findUnique({
    where: { code: 'FUERZA_INDIGO' },
    select: { id: true, documentSeriesPrefix: true },
  });
  if (entity === null) return fail(errors.notFound('entidad FUERZA_INDIGO inexistente'));

  const [notice, systemActor, identity] = await Promise.all([
    db().consentVersion.findFirst({
      where: { code: PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE, legalEntityId: entity.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    }),
    db().actor.findFirst({
      where: { kind: 'SYSTEM_JOB', label: PUBLIC_REGISTRATION_ACTOR_LABEL },
      select: { id: true },
    }),
    existingPerson(data.curp, data.email),
  ]);

  if (notice === null) {
    return fail(
      errors.ruleViolation(
        'Ahora mismo no podemos recibir solicitudes por este formulario. Escríbenos directamente y te atendemos igual.',
        `no hay aviso de privacidad publicado (${PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE})`,
      ),
    );
  }
  if (systemActor === null) {
    return fail(errors.ruleViolation('El registro público no está disponible en este momento.', 'falta actor de registro público'));
  }
  if (identity.conflict) {
    return fail(
      errors.conflict(
        'La CURP o el correo ya pertenecen a otro expediente. Entra a tu cuenta o solicita ayuda para corregirlo.',
        'CURP y correo apuntan a personas distintas',
      ),
    );
  }

  const category = data.modality === 'PROTECTED_BENEFICIARY' ? null : data.modality;
  const [membershipType, statute, genericOccupation] =
    category === null
      ? [null, null, null]
      : await Promise.all([
          db().membershipType.findFirst({
            where: {
              legalEntityId: entity.id,
              category,
              isActive: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            select: { id: true },
          }),
          db().normativeRuleSet.findFirst({
            where: { status: 'IN_FORCE' },
            orderBy: { effectiveFrom: 'desc' },
            select: { id: true, version: true },
          }),
          category === 'UNION_MEMBER'
            ? db().specialtyCatalog.findUnique({ where: { code: 'OTRA_ACTIVIDAD' }, select: { id: true } })
            : Promise.resolve(null),
        ]);

  if (category !== null && (membershipType === null || statute === null || (category === 'UNION_MEMBER' && genericOccupation === null))) {
    return fail(
      errors.ruleViolation(
        'La solicitud de afiliación no está disponible en este momento. Inténtalo más tarde.',
        'falta calidad vigente, estatuto en vigor o especialidad genérica',
      ),
    );
  }

  const [activeApplication, activeMembership, activeBeneficiary] = await Promise.all([
    identity.person === null || category === null
      ? null
      : db().membershipApplication.findFirst({
          where: {
            personId: identity.person.id,
            category,
            status: {
              in: ['DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'PENDING_PAYMENT'],
            },
          },
          select: { folio: true },
        }),
    identity.person === null || category === null
      ? null
      : db().membership.findFirst({
          where: { personId: identity.person.id, category, status: 'ACTIVE' },
          select: { memberNumber: true },
        }),
    identity.person === null || category !== null
      ? null
      : db().protectedBeneficiary.findFirst({
          where: { personId: identity.person.id, status: { notIn: ['CLOSED', 'ARCHIVED'] } },
          select: { publicId: true },
        }),
  ]);
  if (activeApplication !== null) {
    return fail(
      errors.conflict(
        `Ya existe una solicitud de afiliación en trámite con folio ${activeApplication.folio}. No necesitas enviarla otra vez.`,
        'solicitud viva para la misma persona y categoría',
      ),
    );
  }
  if (activeMembership !== null) {
    return fail(
      errors.conflict(
        `La persona ya tiene esa calidad activa con número ${activeMembership.memberNumber}.`,
        'membresía activa de la misma categoría',
      ),
    );
  }
  if (activeBeneficiary !== null) {
    return fail(
      errors.conflict(
        `Ya existe un registro protegido vigente con folio ${activeBeneficiary.publicId}. No necesitas enviarlo otra vez.`,
        'beneficiario protegido vigente',
      ),
    );
  }

  const actor = systemContext({
    actorId: systemActor.id,
    jobType: 'public-membership-registration',
    correlationId: context.correlationId,
  });

  try {
    const registered = await transaction(async (tx) => {
      const person =
        identity.person === null
          ? await tx.person.create({
              data: {
                publicId: newPublicId(),
                curp: data.curp,
                givenName: data.givenName,
                familyName: data.familyName,
                secondFamilyName: data.secondFamilyName ?? null,
                primaryEmail: data.email,
                primaryPhone: data.phone ?? null,
                createdByActorId: systemActor.id,
                updatedByActorId: systemActor.id,
              },
              select: { id: true, publicId: true },
            })
          : await tx.person.update({
              where: { id: identity.person.id },
              data: {
                curp: data.curp,
                primaryEmail: data.email,
                ...(data.phone === undefined ? {} : { primaryPhone: data.phone }),
                updatedByActorId: systemActor.id,
                rowVersion: { increment: 1 },
              },
              select: { id: true, publicId: true },
            });

      if (identity.person === null) {
        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.PERSON_CREATED,
          objectKind: 'Person',
          objectId: person.id,
          outcome: 'SUCCESS',
          legalEntityId: entity.id,
          onBehalfOfPersonId: person.id,
          metadata: { origin: 'public-membership-registration' },
        });
      } else {
        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.PERSON_UPDATED,
          objectKind: 'Person',
          objectId: person.id,
          outcome: 'SUCCESS',
          legalEntityId: entity.id,
          onBehalfOfPersonId: person.id,
          metadata: { origin: 'public-membership-registration', fields: ['curp', 'primaryEmail', 'primaryPhone'] },
          });
      }

      // La solicitud pública también abre la cuenta de acceso. Antes solo se
      // creaban Person y MembershipApplication: la persona aparecía en la
      // bandeja, pero no existía en user_account y por tanto jamás podía entrar
      // a consultar su propio trámite. La cuenta nace ACTIVE porque durante la
      // puesta en marcha la verificación por correo está deshabilitada; el
      // testigo únicamente permite elegir la primera contraseña.
      let accountSetupToken: string | null = null;
      let accountUserId = identity.userId;
      if (!identity.hasDigitalAccount) {
        accountSetupToken = newOpaqueToken();
        const user = await tx.user.create({
          data: {
            personId: person.id,
            email: data.email,
            status: 'ACTIVE',
            mustChangePassword: true,
            createdByActorId: systemActor.id,
            updatedByActorId: systemActor.id,
          },
          select: { id: true },
        });
        accountUserId = user.id;
        await tx.actor.create({
          data: {
            kind: 'PERSON',
            userId: user.id,
            label: [data.givenName, data.familyName].join(' '),
          },
        });
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(accountSetupToken),
            expiresAt: new Date(now.getTime() + ACCOUNT_SETUP_TTL_MS),
            requestIpHash: context.ipHash,
          },
        });
        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.USER_INVITED,
          objectKind: 'User',
          objectId: user.id,
          outcome: 'SUCCESS',
          legalEntityId: entity.id,
          onBehalfOfPersonId: person.id,
          metadata: { origin: 'public-membership-registration', status: 'ACTIVE' },
        });
      }
      if (accountUserId === null) throw new Error('No fue posible vincular la cuenta del registro público.');

      await ensureAutomaticPortalRole(tx, actor, {
        userId: accountUserId,
        personId: person.id,
        legalEntityId: entity.id,
        roleCode: category === null ? 'PROTECTED_BENEFICIARY' : 'APPLICANT',
      });

      const consent = await tx.consent.create({
        data: {
          personId: person.id,
          consentVersionId: notice.id,
          purpose: 'MEMBERSHIP',
          grantedById: person.id,
          scope: { legalEntityId: entity.id, intake: 'public-membership-registration' },
          evidence: {
            noticeCode: PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE,
            noticeVersion: notice.version,
            acceptedAt: now.toISOString(),
            medium: 'WEB_FORM',
          },
        },
        select: { id: true },
      });

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.CONSENT_GRANTED,
        objectKind: 'Consent',
        objectId: consent.id,
        outcome: 'SUCCESS',
        legalEntityId: entity.id,
        onBehalfOfPersonId: person.id,
        metadata: { noticeCode: PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE, noticeVersion: notice.version },
      });

      if (category === null) {
        const profile = data.protectedProfile!;
        const beneficiary = await tx.protectedBeneficiary.create({
          data: {
            publicId: newPublicId(),
            personId: person.id,
            legalEntityId: entity.id,
            originKind: profile === 'NEURODIVERGENT_PERSON' ? 'SELF' : 'FAMILY_OR_CAREGIVER',
            initialNeed: [
              `Perfil declarado: ${protectedProfileLabel(profile)}.`,
              data.context ?? 'Registro preventivo; por ahora no declaró una necesidad específica.',
            ].join('\n\n'),
            occupationText: data.occupation,
            territoryHint: data.territory,
            promoterReference: data.promoterReference ?? null,
            originFingerprint,
            hasDigitalAccount: true,
            privacyLevel: 'REINFORCED',
            createdByActorId: systemActor.id,
            updatedByActorId: systemActor.id,
          },
          select: { id: true, publicId: true },
        });

        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.BENEFICIARY_REGISTERED,
          objectKind: 'ProtectedBeneficiary',
          objectId: beneficiary.id,
          outcome: 'SUCCESS',
          legalEntityId: entity.id,
          onBehalfOfPersonId: person.id,
          metadata: { publicId: beneficiary.publicId, origin: 'public-registration' },
        });
        return {
          folio: beneficiary.publicId,
          destination: 'PROTECTED_BENEFICIARY' as const,
          personId: person.id,
          accountSetupToken,
        };
      }

      const folio = await nextApplicationFolio(tx, entity.documentSeriesPrefix, now.getUTCFullYear());
      const routeFields =
        category === 'UNION_MEMBER'
          ? {
              occupationSpecialtyId: genericOccupation!.id,
              workRelationKind: data.workRelation!,
              neurodivergentContactStatement: data.neurodivergentConnection!,
              otherUnionMembership: data.otherUnionMembership!,
              otherUnionClarification: data.otherUnionClarification ?? null,
              honoraryProfile: null,
            }
          : {
              occupationSpecialtyId: null,
              workRelationKind: null,
              neurodivergentContactStatement: data.neurodivergentConnection ?? null,
              otherUnionMembership: null,
              otherUnionClarification: null,
              honoraryProfile: 'PROFESSIONAL_OR_COLLABORATOR' as const,
            };

      const application = await tx.membershipApplication.create({
        data: {
          folio,
          personId: person.id,
          membershipTypeId: membershipType!.id,
          category,
          legalEntityId: entity.id,
          status: 'SUBMITTED',
          submittedAt: now,
          occupationText: data.occupation,
          territoryHint: data.territory,
          promoterReference: data.promoterReference ?? null,
          originFingerprint,
          acceptedRuleSetId: statute!.id,
          originalSummary: {
            enviadoEl: now.toISOString(),
            solicitante: {
              publicId: person.publicId,
              nombre: [data.givenName, data.familyName, data.secondFamilyName].filter(Boolean).join(' '),
              curp: data.curp,
              correo: data.email,
              telefono: data.phone ?? null,
            },
            categoria: category,
            ocupacionDeclarada: data.occupation,
            territorioDeclarado: data.territory,
            promotor: data.promoterReference ?? null,
            estatutoAceptado: statute!.version,
            avisoPrivacidad: { codigo: PUBLIC_MEMBERSHIP_INTAKE_NOTICE_CODE, version: notice.version },
            formaDeTrabajo: data.workRelation ?? null,
            contactoNeurodivergente: data.neurodivergentConnection ?? null,
            otroSindicato: data.otherUnionMembership ?? null,
            aclaracionOtroSindicato: data.otherUnionClarification ?? null,
            formaDeColaboracion: data.context ?? null,
            origen: 'FORMULARIO_PUBLICO',
          },
          ...routeFields,
          createdByActorId: systemActor.id,
          updatedByActorId: systemActor.id,
        },
        select: { id: true, folio: true },
      });

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
        objectKind: 'MembershipApplication',
        objectId: application.id,
        outcome: 'SUCCESS',
        legalEntityId: entity.id,
        onBehalfOfPersonId: person.id,
        metadata: { folio: application.folio, category, origin: 'public-registration' },
      });

      return {
        folio: application.folio,
        destination: 'APPLICATION' as const,
        personId: person.id,
        accountSetupToken,
      };
    });

    if (registered.accountSetupToken === null) {
      return ok({
        folio: registered.folio,
        destination: registered.destination,
        accountAccess: 'EXISTING' as const,
      });
    }

    const accountSetupUrl = `${env().APP_URL}/activar/${registered.accountSetupToken}`;
    if (env().ACCOUNT_ACTIVATION_DELIVERY === 'email') {
      try {
        await sendTemplatedMail({
          to: data.email,
          templateCode: 'USER_INVITATION',
          variables: {
            givenName: data.givenName,
            activationUrl: accountSetupUrl,
            expiresInHours: '168',
          },
          correlationId: context.correlationId,
        });
        return ok({
          folio: registered.folio,
          destination: registered.destination,
          accountAccess: 'EMAIL' as const,
        });
      } catch (error) {
        // La cuenta y la solicitud ya quedaron guardadas. Entregamos el enlace
        // en pantalla para no dejar a la persona fuera por una falla de correo.
        logger.error('No se pudo enviar el enlace de acceso de la afiliación pública', {
          module: 'membership',
          correlationId: context.correlationId,
          outcome: 'failed',
          context: { personId: registered.personId, error: String(error) },
        });
      }
    }

    return ok({
      folio: registered.folio,
      destination: registered.destination,
      accountAccess: 'SETUP_LINK' as const,
      accountSetupUrl,
    });
  } catch (error) {
    const uniqueConflict =
      typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
    if (uniqueConflict) {
      return fail(
        errors.conflict(
          'Ya existe un expediente con esa CURP. Entra a tu cuenta o solicita ayuda para revisarlo.',
          'conflicto único durante registro público',
        ),
      );
    }
    throw error;
  }
}
