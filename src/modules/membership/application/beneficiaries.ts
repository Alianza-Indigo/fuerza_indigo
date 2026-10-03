import { z } from 'zod';
import type { Prisma } from '@prisma-client/client';
import type {
  BeneficiaryOrigin,
  BeneficiaryStatus,
  ProtectedBeneficiaryProfile,
} from '@prisma-client/enums';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import {
  can,
  explain,
  legalEntityReach,
  territorialReach,
  type TerritorialReach,
} from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { emitirCredencialDeBeneficiario, revocarCredencialesDeBeneficiario } from './credentials';

const ORIGENES = [
  'SELF',
  'FAMILY_OR_CAREGIVER',
  'UNION_MEMBER',
  'DELEGATE',
  'SOCIAL_STAFF',
  'EXTERNAL_REFERRAL',
] as const;

const PERFILES = ['NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'] as const;
const MOTIVOS_REVOCACION = [
  'IMPERSONATION',
  'DUPLICATE',
  'ADMINISTRATIVE_ERROR',
  'FALSE_INFORMATION',
  'MISUSE',
  'PERSON_REQUEST',
  'OTHER',
] as const;

export const registerBeneficiarySchema = z.object({
  personId: z.uuid({ error: () => 'Elige a la persona que quedará registrada.' }),
  legalEntityId: z.uuid({ error: () => 'Elige la entidad responsable del registro.' }),
  profileKind: z.enum(PERFILES),
  originKind: z.enum(ORIGENES),
  territorialUnitId: z.uuid().nullable().default(null),
  responsiblePersonId: z.uuid().nullable().default(null),
  privacyLevel: z.enum(['STANDARD', 'REINFORCED']).default('REINFORCED'),
});

export type RegisterBeneficiaryInput = z.input<typeof registerBeneficiarySchema>;

export const updateBeneficiarySchema = z.object({
  beneficiaryId: z.uuid(),
  profileKind: z.enum(PERFILES),
  territorialUnitId: z.uuid().nullable().default(null),
  responsiblePersonId: z.uuid().nullable().default(null),
  privacyLevel: z.enum(['STANDARD', 'REINFORCED']),
  privacyChangeReason: z.string().trim().max(600).nullable().default(null),
});

export type UpdateBeneficiaryInput = z.input<typeof updateBeneficiarySchema>;

export const revokeBeneficiarySchema = z.object({
  beneficiaryId: z.uuid(),
  reasonKind: z.enum(MOTIVOS_REVOCACION),
  reason: z.string().trim().min(15, { error: () => 'Explica la revocación. Mínimo quince caracteres.' }).max(1000),
});

export type RevokeBeneficiaryInput = z.infer<typeof revokeBeneficiarySchema>;

export const restoreBeneficiarySchema = z.object({
  beneficiaryId: z.uuid(),
  reason: z.string().trim().min(15, { error: () => 'Explica la restauración. Mínimo quince caracteres.' }).max(1000),
});

export type RestoreBeneficiaryInput = z.infer<typeof restoreBeneficiarySchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

function esMenorDeEdad(birthDate: Date | null): boolean {
  if (birthDate === null) return false;
  const hoy = new Date();
  const cumple = new Date(
    Date.UTC(birthDate.getUTCFullYear() + 18, birthDate.getUTCMonth(), birthDate.getUTCDate()),
  );
  return cumple > hoy;
}

function filtroTerritorial(alcance: TerritorialReach): Prisma.ProtectedBeneficiaryWhereInput | null {
  if (alcance === 'ALL') return {};
  if (alcance.length === 0) return null;
  return {
    OR: alcance.flatMap((scope) => [
      { territorialUnit: { path: { equals: scope.path } } },
      ...(scope.includesDescendants
        ? [{ territorialUnit: { path: { startsWith: `${scope.path}/` } } }]
        : []),
    ]),
  };
}

export async function registerBeneficiary(
  actor: ActorContext,
  input: RegisterBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string; publicId: string }>> {
  const parsed = registerBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const datos = parsed.data;
  const propio = datos.personId === actor.personId;
  const decision = can(
    actor,
    propio ? 'membership.beneficiary.create_own' : 'membership.beneficiary.create',
    { kind: 'ProtectedBeneficiary', legalEntityId: datos.legalEntityId },
    { hasLiveAssignment: () => propio },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (propio && datos.originKind !== 'SELF') {
    return fail(errors.validation({ originKind: ['Si te registras tú, el origen es «la propia persona».'] }));
  }

  const persona = await db().person.findUnique({
    where: { id: datos.personId },
    select: { id: true, birthDate: true, mergedIntoPersonId: true, user: { select: { id: true } } },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));
  if (persona.mergedIntoPersonId !== null) {
    return fail(errors.ruleViolation('Ese registro de persona quedó fusionado. Usa el registro que se conservó.', 'persona fusionada'));
  }
  if (datos.responsiblePersonId === datos.personId) {
    return fail(errors.validation({ responsiblePersonId: ['Nadie es responsable de sí mismo.'] }));
  }

  const menor = esMenorDeEdad(persona.birthDate);
  if (menor && datos.privacyLevel === 'STANDARD') {
    return fail(errors.ruleViolation('El registro de una persona menor de edad exige privacidad reforzada.', 'privacidad estándar para menor'));
  }
  if (menor && datos.responsiblePersonId === null) {
    return fail(errors.validation({ responsiblePersonId: ['Para una persona menor de edad indica quién la representa.'] }));
  }

  const existente = await db().protectedBeneficiary.findUnique({
    where: { personId_legalEntityId: { personId: datos.personId, legalEntityId: datos.legalEntityId } },
    select: { publicId: true, status: true },
  });
  if (existente !== null) {
    const detalle = existente.status === 'REVOKED' ? 'Está revocado; solo el Superadmin puede restaurarlo.' : 'Ya está vigente.';
    return fail(errors.conflict(`La persona ya tiene el registro ${existente.publicId}. ${detalle}`, 'registro protegido duplicado'));
  }

  const creada = await transaction(async (tx) => {
    const registro = await tx.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: datos.personId,
        legalEntityId: datos.legalEntityId,
        profileKind: datos.profileKind,
        originKind: datos.originKind,
        registeredById: actor.userId,
        territorialUnitId: datos.territorialUnitId,
        responsiblePersonId: datos.responsiblePersonId,
        hasDigitalAccount: persona.user !== null,
        privacyLevel: menor ? 'REINFORCED' : datos.privacyLevel,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, publicId: true, personId: true, legalEntityId: true, territorialUnitId: true },
    });
    await emitirCredencialDeBeneficiario(tx, actor, registro);
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_REGISTERED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: datos.legalEntityId,
      onBehalfOfPersonId: datos.personId,
      ...(datos.territorialUnitId === null ? {} : { territorialUnitId: datos.territorialUnitId }),
      metadata: { origen: datos.originKind, perfil: datos.profileKind, menorDeEdad: menor, propio },
    });
    return registro;
  });
  return ok({ beneficiaryId: creada.id, publicId: creada.publicId });
}

export async function updateBeneficiary(
  actor: ActorContext,
  input: UpdateBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string }>> {
  const parsed = updateBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const datos = parsed.data;
  const registro = await db().protectedBeneficiary.findUnique({
    where: { id: datos.beneficiaryId },
    select: {
      id: true,
      status: true,
      personId: true,
      legalEntityId: true,
      privacyLevel: true,
      territorialUnit: { select: { path: true } },
      person: { select: { birthDate: true } },
    },
  });
  if (registro === null) return fail(errors.notFound('registro protegido inexistente'));
  const decision = can(actor, 'membership.beneficiary.update', {
    kind: 'ProtectedBeneficiary',
    id: registro.id,
    legalEntityId: registro.legalEntityId,
    territorialPath: registro.territorialUnit?.path ?? null,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (registro.status === 'REVOKED') return fail(errors.conflict('El registro está revocado.', 'registro revocado'));
  if (datos.responsiblePersonId === registro.personId) {
    return fail(errors.validation({ responsiblePersonId: ['Nadie es responsable de sí mismo.'] }));
  }

  const menor = esMenorDeEdad(registro.person.birthDate);
  const bajaLaPrivacidad = registro.privacyLevel === 'REINFORCED' && datos.privacyLevel === 'STANDARD';
  if (bajaLaPrivacidad && menor) {
    return fail(errors.ruleViolation('El registro de una persona menor de edad exige privacidad reforzada.', 'privacidad estándar para menor'));
  }
  if (bajaLaPrivacidad && (datos.privacyChangeReason ?? '').trim().length < 15) {
    return fail(errors.validation({ privacyChangeReason: ['Explica por qué se baja la privacidad. Mínimo quince caracteres.'] }));
  }

  await transaction(async (tx) => {
    await tx.protectedBeneficiary.update({
      where: { id: registro.id },
      data: {
        profileKind: datos.profileKind,
        territorialUnitId: datos.territorialUnitId,
        responsiblePersonId: datos.responsiblePersonId,
        privacyLevel: menor ? 'REINFORCED' : datos.privacyLevel,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_UPDATED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      ...(bajaLaPrivacidad ? { reason: datos.privacyChangeReason } : {}),
      metadata: { perfil: datos.profileKind, privacidad: menor ? 'REINFORCED' : datos.privacyLevel, bajaLaPrivacidad },
    });
  });
  return ok({ beneficiaryId: registro.id });
}

export async function revokeBeneficiary(
  actor: ActorContext,
  input: RevokeBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string }>> {
  const parsed = revokeBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const datos = parsed.data;
  const registro = await db().protectedBeneficiary.findUnique({
    where: { id: datos.beneficiaryId },
    select: {
      id: true,
      status: true,
      personId: true,
      legalEntityId: true,
      territorialUnit: { select: { path: true } },
    },
  });
  if (registro === null) return fail(errors.notFound('registro protegido inexistente'));
  const decision = can({ ...actor, reason: datos.reason }, 'membership.beneficiary.revoke', {
    kind: 'ProtectedBeneficiary',
    id: registro.id,
    legalEntityId: registro.legalEntityId,
    territorialPath: registro.territorialUnit?.path ?? null,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (registro.status === 'REVOKED') return fail(errors.conflict('El registro ya está revocado.', 'registro revocado'));

  await transaction(async (tx) => {
    const now = new Date();
    await tx.protectedBeneficiary.update({
      where: { id: registro.id },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revocationReasonKind: datos.reasonKind,
        revocationReason: datos.reason,
        revokedByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await revocarCredencialesDeBeneficiario(tx, actor, registro, `Registro protegido revocado: ${datos.reason}`);
    await tx.notification.create({
      data: {
        personId: registro.personId,
        category: 'MEMBERSHIP',
        title: 'Tu registro protegido fue revocado',
        body: `Motivo: ${datos.reason}`,
        linkPath: '/mi',
        channels: ['IN_APP'],
        relatedKind: 'ProtectedBeneficiary',
        relatedId: registro.id,
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_REVOKED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      reason: datos.reason,
      metadata: { tipoDeMotivo: datos.reasonKind },
    });
  });
  return ok({ beneficiaryId: registro.id });
}

export async function restoreBeneficiary(
  actor: ActorContext,
  input: RestoreBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string }>> {
  const parsed = restoreBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  if (actor.actorKind !== 'ROOT_SUPERADMIN') {
    return fail(errors.forbidden('solo el Superadmin raíz puede restaurar un registro revocado'));
  }
  const registro = await db().protectedBeneficiary.findUnique({
    where: { id: parsed.data.beneficiaryId },
    select: {
      id: true,
      status: true,
      personId: true,
      legalEntityId: true,
      territorialUnitId: true,
      territoryHint: true,
    },
  });
  if (registro === null) return fail(errors.notFound('registro protegido inexistente'));
  if (registro.status !== 'REVOKED') return fail(errors.conflict('El registro ya está vigente.', 'registro activo'));

  await transaction(async (tx) => {
    await tx.protectedBeneficiary.update({
      where: { id: registro.id },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
        revocationReasonKind: null,
        revocationReason: null,
        revokedByActorId: null,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    await emitirCredencialDeBeneficiario(tx, actor, registro, `Registro restaurado: ${parsed.data.reason}`);
    await tx.notification.create({
      data: {
        personId: registro.personId,
        category: 'MEMBERSHIP',
        title: 'Tu registro protegido fue restaurado',
        body: 'Tu registro vuelve a estar vigente y se emitió una credencial nueva.',
        linkPath: '/mi',
        channels: ['IN_APP'],
        relatedKind: 'ProtectedBeneficiary',
        relatedId: registro.id,
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_RESTORED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      reason: parsed.data.reason,
    });
  });
  return ok({ beneficiaryId: registro.id });
}

export interface BeneficiaryRow {
  readonly id: string;
  readonly publicId: string;
  readonly personId: string;
  readonly personName: string;
  readonly legalEntityId: string;
  readonly legalEntity: string;
  readonly profileKind: ProtectedBeneficiaryProfile;
  readonly originKind: BeneficiaryOrigin;
  readonly status: BeneficiaryStatus;
  readonly privacyLevel: 'STANDARD' | 'REINFORCED';
  readonly territorialUnitId: string | null;
  readonly territory: string | null;
  readonly territorialPath: string | null;
  readonly responsiblePersonId: string | null;
  readonly responsiblePersonName: string | null;
  readonly hasDigitalAccount: boolean;
  readonly promoterReference: string | null;
  readonly physicalCredentialRequested: boolean;
  readonly registeredAt: Date;
  readonly revokedAt: Date | null;
  readonly revocationReasonKind: string | null;
  readonly revocationReason: string | null;
}

const beneficiarySelect = {
  id: true,
  publicId: true,
  personId: true,
  legalEntityId: true,
  profileKind: true,
  originKind: true,
  status: true,
  privacyLevel: true,
  hasDigitalAccount: true,
  promoterReference: true,
  physicalCredentialRequested: true,
  createdAt: true,
  revokedAt: true,
  revocationReasonKind: true,
  revocationReason: true,
  territorialUnitId: true,
  responsiblePersonId: true,
  legalEntity: { select: { shortName: true } },
  territorialUnit: { select: { name: true, path: true } },
  person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
  responsiblePerson: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
} as const;

function aFila(fila: Prisma.ProtectedBeneficiaryGetPayload<{ select: typeof beneficiarySelect }>): BeneficiaryRow {
  return {
    id: fila.id,
    publicId: fila.publicId,
    personId: fila.personId,
    personName: nombreCompleto(fila.person),
    legalEntityId: fila.legalEntityId,
    legalEntity: fila.legalEntity.shortName,
    profileKind: fila.profileKind,
    originKind: fila.originKind,
    status: fila.status,
    privacyLevel: fila.privacyLevel,
    territorialUnitId: fila.territorialUnitId,
    territory: fila.territorialUnit?.name ?? null,
    territorialPath: fila.territorialUnit?.path ?? null,
    responsiblePersonId: fila.responsiblePersonId,
    responsiblePersonName: fila.responsiblePerson === null ? null : nombreCompleto(fila.responsiblePerson),
    hasDigitalAccount: fila.hasDigitalAccount,
    promoterReference: fila.promoterReference,
    physicalCredentialRequested: fila.physicalCredentialRequested,
    registeredAt: fila.createdAt,
    revokedAt: fila.revokedAt,
    revocationReasonKind: fila.revocationReasonKind,
    revocationReason: fila.revocationReason,
  };
}

export async function beneficiaryDetail(
  actor: ActorContext,
  beneficiaryId: string,
): Promise<UseCaseResult<BeneficiaryRow>> {
  const fila = await db().protectedBeneficiary.findUnique({ where: { id: beneficiaryId }, select: beneficiarySelect });
  if (fila === null) return fail(errors.notFound('registro protegido inexistente'));
  const propio = fila.personId === actor.personId;
  const permission = propio ? 'membership.beneficiary.read_own' : 'membership.beneficiary.read';
  const decision = can(
    actor,
    permission,
    {
      kind: 'ProtectedBeneficiary',
      id: fila.id,
      legalEntityId: fila.legalEntityId,
      territorialPath: fila.territorialUnit?.path ?? null,
      containsPersonalData: true,
    },
    { hasLiveAssignment: () => propio },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (fila.privacyLevel === 'REINFORCED' && !propio) {
    await transaction((tx) => recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_FILE_READ,
      objectKind: 'ProtectedBeneficiary',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      onBehalfOfPersonId: fila.personId,
      ...(fila.territorialUnitId === null ? {} : { territorialUnitId: fila.territorialUnitId }),
      metadata: { privacidad: fila.privacyLevel },
    }));
  }
  return ok(aFila(fila));
}

export async function beneficiaryRegistry(
  actor: ActorContext,
  filtros: { status?: BeneficiaryStatus; query?: string } = {},
): Promise<UseCaseResult<BeneficiaryRow[]>> {
  const decision = can(actor, 'membership.beneficiary.read', {
    kind: 'ProtectedBeneficiary',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  const entidades = legalEntityReach(actor, 'membership.beneficiary.read');
  const territorio = filtroTerritorial(territorialReach(actor, 'membership.beneficiary.read'));
  if (entidades !== 'ALL' && entidades.length === 0) return ok([]);
  if (territorio === null) return ok([]);
  const texto = (filtros.query ?? '').trim();
  const filas = await db().protectedBeneficiary.findMany({
    where: {
      ...(entidades === 'ALL' ? {} : { legalEntityId: { in: [...entidades] } }),
      ...territorio,
      ...(filtros.status === undefined ? {} : { status: filtros.status }),
      ...(texto === '' ? {} : {
        OR: [
          { publicId: texto },
          { person: { familyName: { contains: texto, mode: 'insensitive' as const } } },
          { person: { givenName: { contains: texto, mode: 'insensitive' as const } } },
        ],
      }),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: beneficiarySelect,
  });
  return ok(filas.map(aFila));
}

export async function ownBeneficiaryRegistrations(actor: ActorContext): Promise<UseCaseResult<BeneficiaryRow[]>> {
  if (actor.personId === null) return ok([]);
  const decision = can(
    actor,
    'membership.beneficiary.read_own',
    { kind: 'ProtectedBeneficiary', containsPersonalData: true },
    { hasLiveAssignment: () => true },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  const filas = await db().protectedBeneficiary.findMany({
    where: { personId: actor.personId },
    orderBy: { createdAt: 'desc' },
    select: beneficiarySelect,
  });
  return ok(filas.map(aFila));
}
