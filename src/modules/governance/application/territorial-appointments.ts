import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { uploadFile } from '@/platform/files/file-service';
import { segmentoDeRuta } from './territory';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO = /^[A-Z][A-Z0-9_]{2,43}$/;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

function sumarMeses(desde: Date, meses: number): Date {
  const fin = new Date(desde.getTime());
  const diaOriginal = fin.getUTCDate();
  fin.setUTCMonth(fin.getUTCMonth() + meses);
  if (fin.getUTCDate() !== diaOriginal) fin.setUTCDate(0);
  return fin;
}

export const createTerritorialDeploymentByAppointmentSchema = z.object({
  level: z.enum(['STATE', 'MUNICIPALITY', 'SECTION']),
  code: z.string().trim().toUpperCase().regex(CODIGO, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos, con un máximo de 44 caracteres.',
  }),
  name: z.string().trim().min(3).max(120),
  parentId: z.uuid({ error: () => 'Elige la unidad de la que dependerá.' }),
  legalEntityId: z.uuid({ error: () => 'Elige la entidad jurídica responsable.' }),
  appointedMembershipId: z.uuid({ error: () => 'Elige a la persona responsable.' }),
  appointedOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  termMonths: z.coerce.number().int().positive().max(120),
  reelectionAllowed: z.boolean().default(false),
  stateCode: z.string().trim().max(10).nullable().default(null),
  municipalityCode: z.string().trim().max(15).nullable().default(null),
  contactEmail: z.email({ error: () => 'Revisa el correo de contacto.' }).nullable().default(null),
  reason: z.string().trim().min(20, {
    error: () => 'Explica el motivo del nombramiento en al menos veinte caracteres.',
  }).max(2000),
}).superRefine((value, ctx) => {
  if (value.level === 'MUNICIPALITY' && value.municipalityCode === null) {
    ctx.addIssue({ code: 'custom', path: ['municipalityCode'], message: 'La delegación municipal necesita la clave del municipio.' });
  }
  if (value.level === 'STATE' && value.stateCode === null) {
    ctx.addIssue({ code: 'custom', path: ['stateCode'], message: 'La delegación estatal necesita la clave de la entidad.' });
  }
});

export type CreateTerritorialDeploymentByAppointmentInput = z.infer<
  typeof createTerritorialDeploymentByAppointmentSchema
>;

export interface TerritorialAppointmentResult {
  readonly territorialUnitId: string;
  readonly unionBodyId: string;
  readonly officeDefinitionId: string;
  readonly officeTermId: string;
  readonly appointmentPublicId: string;
  readonly appointmentNumber: string;
}

interface Issuer {
  readonly officeTermId: string | null;
  readonly name: string;
  readonly capacity: string;
}

async function issuingSecretaryTerm(actor: ActorContext, legalEntityId: string, appointedOn: Date) {
  if (actor.actorKind === 'ROOT_SUPERADMIN') {
    return ok<Issuer>({ officeTermId: null, name: 'Superadmin', capacity: 'autoridad de instalación inicial' });
  }
  if (actor.actorKind !== 'PERSON' || actor.personId === null) {
    return fail(errors.forbidden('Solo el Superadmin o la Secretaría General pueden emitir este nombramiento.'));
  }

  const term = await db().officeTerm.findFirst({
    where: {
      personId: actor.personId,
      startsOn: { lte: appointedOn },
      endsOn: { gt: appointedOn },
      endedEarlyOn: null,
      officeDefinition: {
        kind: 'SECRETARY_GENERAL',
        isActive: true,
        unionBody: { legalEntityId, status: 'ACTIVE' },
      },
    },
    orderBy: { startsOn: 'desc' },
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          middleName: true,
          familyName: true,
          secondFamilyName: true,
          preferredName: true,
        },
      },
      officeDefinition: { select: { name: true } },
    },
  });
  if (term === null) {
    return fail(errors.forbidden('Después del despliegue inicial, el nombramiento debe emitirlo la Secretaría General en funciones.'));
  }
  return ok<Issuer>({
    officeTermId: term.id,
    name: nombreCompleto(term.person),
    capacity: term.officeDefinition.name,
  });
}

const NIVEL: Record<CreateTerritorialDeploymentByAppointmentInput['level'], string> = {
  STATE: 'Delegación estatal',
  MUNICIPALITY: 'Delegación municipal',
  SECTION: 'Seccional',
};

function textoDelAcuerdo(input: {
  readonly number: string;
  readonly appointedOn: string;
  readonly level: CreateTerritorialDeploymentByAppointmentInput['level'];
  readonly unitName: string;
  readonly unitCode: string;
  readonly parentName: string;
  readonly legalEntityName: string;
  readonly responsibleName: string;
  readonly issuer: Issuer;
  readonly endsOn: string;
  readonly reason: string;
}): string {
  return [
    'FUERZA ÍNDIGO',
    'ACUERDO DE CREACIÓN Y NOMBRAMIENTO TERRITORIAL',
    '',
    `Folio: ${input.number}`,
    `Fecha de emisión: ${input.appointedOn}`,
    `Entidad responsable: ${input.legalEntityName}`,
    `Autoridad emisora: ${input.issuer.name}, en carácter de ${input.issuer.capacity}.`,
    '',
    `PRIMERO. Se constituye la ${NIVEL[input.level].toLowerCase()} denominada «${input.unitName}», con código ${input.unitCode}, dependiente de «${input.parentName}».`,
    `SEGUNDO. Se nombra como persona responsable a ${input.responsibleName}, con vigencia del ${input.appointedOn} al ${input.endsOn}.`,
    'TERCERO. El cargo confiere acceso institucional limitado a la unidad creada y a sus unidades descendientes durante la vigencia del nombramiento.',
    `CUARTO. Motivo y alcance: ${input.reason}`,
    '',
    'El presente acuerdo queda registrado en la bitácora institucional. Su copia firmada puede incorporarse al mismo expediente sin recrear ni modificar el acto.',
  ].join('\n');
}

export async function canCreateTerritorialDeploymentByAppointment(actor: ActorContext): Promise<boolean> {
  if (actor.actorKind === 'ROOT_SUPERADMIN') return true;
  if (actor.actorKind !== 'PERSON' || actor.personId === null) return false;
  const now = new Date();
  return (await db().officeTerm.count({
    where: {
      personId: actor.personId,
      startsOn: { lte: now },
      endsOn: { gt: now },
      endedEarlyOn: null,
      officeDefinition: { kind: 'SECRETARY_GENERAL', isActive: true, unionBody: { status: 'ACTIVE' } },
    },
  })) > 0;
}

/**
 * Constituye e instala una delegación o seccional mediante nombramiento.
 * Unidad, autoridad, cargo, periodo, acceso y evidencia nacen juntos: si una
 * sola pieza falla, la transacción no deja una estructura a medias.
 */
export async function createTerritorialDeploymentByAppointment(
  actor: ActorContext,
  input: CreateTerritorialDeploymentByAppointmentInput,
): Promise<UseCaseResult<TerritorialAppointmentResult>> {
  const parsed = createTerritorialDeploymentByAppointmentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;
  const conMotivo: ActorContext = { ...actor, reason: data.reason };

  const parent = await db().territorialUnit.findUnique({
    where: { id: data.parentId },
    select: {
      id: true,
      name: true,
      type: true,
      path: true,
      depth: true,
      countryCode: true,
      stateCode: true,
      municipalityCode: true,
      status: true,
      dissolvedOn: true,
    },
  });
  if (parent === null) return fail(errors.notFound('La unidad de la que dependería no existe.'));
  if (parent.status !== 'ACTIVE' || parent.dissolvedOn !== null) {
    return fail(errors.conflict(`«${parent.name}» debe estar activa para sostener una unidad nueva.`));
  }

  const decisions = [
    can(conMotivo, 'territory.unit.create', {
      kind: 'TerritorialUnit', legalEntityId: data.legalEntityId, territorialPath: parent.path,
    }),
    can(conMotivo, 'governance.body.manage', {
      kind: 'UnionBody', legalEntityId: data.legalEntityId, territorialPath: parent.path,
    }),
    can(conMotivo, 'governance.office.appoint', {
      kind: 'OfficeTerm', legalEntityId: data.legalEntityId, territorialPath: parent.path,
    }),
  ];
  const denied = decisions.find((decision) => !decision.allowed);
  if (denied !== undefined) return fail(errors.forbidden(explain(denied.reason!)));

  if (data.level === 'STATE' && parent.type !== 'STATE') {
    return fail(errors.conflict('Una delegación estatal debe depender de la entidad federativa correspondiente.'));
  }
  if (data.level === 'MUNICIPALITY' && (parent.type !== 'DELEGATION' || parent.municipalityCode !== null)) {
    return fail(errors.conflict('Una delegación municipal debe depender de una delegación estatal.'));
  }
  if (data.level === 'SECTION' && parent.type !== 'DELEGATION') {
    return fail(errors.conflict('Una seccional debe depender de una delegación estatal o municipal.'));
  }

  const appointedOn = new Date(`${data.appointedOn}T00:00:00.000Z`);
  const issuer = await issuingSecretaryTerm(conMotivo, data.legalEntityId, appointedOn);
  if (!issuer.ok) return issuer;

  const [rules, legalEntity, membership, territorialRole, readPermission] = await Promise.all([
    db().normativeRuleSet.findFirst({ where: { status: 'IN_FORCE' }, orderBy: { effectiveFrom: 'desc' }, select: { id: true } }),
    db().legalEntity.findUnique({
      where: { id: data.legalEntityId },
      select: { id: true, isActive: true, legalName: true },
    }),
    db().membership.findUnique({
      where: { id: data.appointedMembershipId },
      select: {
        id: true,
        status: true,
        category: true,
        legalEntityId: true,
        politicalRightsSuspendedUntil: true,
        personId: true,
        membershipType: { select: { grantsPoliticalRights: true } },
        person: {
          select: {
            givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true,
            user: { select: { id: true, status: true } },
          },
        },
      },
    }),
    db().role.findUnique({ where: { code: 'TERRITORIAL_DELEGATE' }, select: { id: true } }),
    db().permission.findUnique({ where: { code: 'territory.unit.read' }, select: { id: true } }),
  ]);

  if (rules === null) return fail(errors.conflict('No hay reglas institucionales en vigor para definir el periodo del cargo.'));
  if (legalEntity === null || !legalEntity.isActive) return fail(errors.conflict('La entidad jurídica no existe o no está activa.'));
  if (membership === null) return fail(errors.notFound('La membresía de la persona responsable no existe.'));
  if (membership.legalEntityId !== data.legalEntityId) {
    return fail(errors.conflict('La persona responsable debe pertenecer a la misma entidad jurídica de la delegación.'));
  }
  if (membership.status !== 'ACTIVE' || membership.category !== 'UNION_MEMBER' || !membership.membershipType.grantsPoliticalRights) {
    return fail(errors.conflict('La persona responsable debe ser agremiada activa y estar en pleno goce de derechos.'));
  }
  if (membership.politicalRightsSuspendedUntil !== null && membership.politicalRightsSuspendedUntil >= appointedOn) {
    return fail(errors.conflict('La persona responsable tiene suspendidos sus derechos políticos en la fecha del nombramiento.'));
  }
  if (territorialRole === null || readPermission === null) {
    return fail(errors.conflict('Falta el catálogo institucional necesario para conceder el cargo territorial.'));
  }

  const code = data.code;
  const bodyCode = `AUT_${code}`;
  const officeCode = `DEL_${code}`;
  const path = `${parent.path === '/' ? '' : parent.path}/${segmentoDeRuta(code)}`;
  const [duplicateUnit, duplicatePath, duplicateBody, duplicateOffice] = await Promise.all([
    db().territorialUnit.findUnique({ where: { code }, select: { id: true } }),
    db().territorialUnit.findUnique({ where: { path }, select: { id: true } }),
    db().unionBody.findUnique({ where: { code: bodyCode }, select: { id: true } }),
    db().officeDefinition.findUnique({ where: { code: officeCode }, select: { id: true } }),
  ]);
  if (duplicateUnit !== null || duplicatePath !== null) return fail(errors.conflict('Ya existe una unidad con ese código o ruta.'));
  if (duplicateBody !== null || duplicateOffice !== null) return fail(errors.conflict('El código coincide con una autoridad o cargo ya existentes.'));

  const stateCode = data.stateCode ?? parent.stateCode;
  const municipalityCode = data.level === 'STATE' ? null : (data.municipalityCode ?? parent.municipalityCode);
  const unitType = data.level === 'SECTION' ? 'SECTION' as const : 'DELEGATION' as const;
  const endsOn = sumarMeses(appointedOn, data.termMonths);
  const personName = nombreCompleto(membership.person);

  const result = await transaction(async (tx) => {
    const unit = await tx.territorialUnit.create({
      data: {
        publicId: newPublicId(), code, name: data.name, type: unitType, parentId: parent.id, path,
        depth: parent.depth + 1, countryCode: parent.countryCode, stateCode, municipalityCode,
        status: 'ACTIVE', createdOn: appointedOn, contactEmail: data.contactEmail,
        createdByActorId: actor.actorId, updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const body = await tx.unionBody.create({
      data: {
        code: bodyCode, name: `Autoridad de ${data.name}`, kind: 'SECTION_DELEGATION',
        territorialUnitId: unit.id, legalEntityId: data.legalEntityId, normativeRuleSetId: rules.id,
        installedOn: appointedOn, createdByActorId: actor.actorId, updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const office = await tx.officeDefinition.create({
      data: {
        code: officeCode, name: `Persona responsable de ${data.name}`, unionBodyId: body.id,
        kind: 'SECTION_DELEGATE', termMonths: data.termMonths, reelectionAllowed: data.reelectionAllowed,
        seats: 1, grantsRoleCode: 'TERRITORIAL_DELEGATE', normativeRuleSetId: rules.id,
        createdByActorId: actor.actorId, updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });
    await tx.officeDefinitionPermission.create({
      data: { officeDefinitionId: office.id, permissionId: readPermission.id },
    });

    let roleAssignmentId: string | null = null;
    const userId = membership.person.user?.status === 'ACTIVE' ? membership.person.user.id : null;
    const grantor = actor.userId ?? (actor.actorKind === 'ROOT_SUPERADMIN' ? userId : null);
    if (userId !== null && grantor !== null) {
      const assignment = await tx.roleAssignment.create({
        data: {
          userId, roleId: territorialRole.id, legalEntityId: data.legalEntityId, grantedById: grantor,
          grantReason: data.reason, startsAt: appointedOn, endsAt: endsOn,
          territorialScopes: { create: [{ territorialUnitId: unit.id, includesDescendants: true }] },
        },
        select: { id: true },
      });
      roleAssignmentId = assignment.id;
    }

    const term = await tx.officeTerm.create({
      data: {
        officeDefinitionId: office.id, personId: membership.personId, membershipId: membership.id,
        territorialUnitId: unit.id, designationMethod: 'DIRECT_APPOINTMENT', startsOn: appointedOn,
        endsOn, roleAssignmentId, createdByActorId: actor.actorId, updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const year = appointedOn.getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nombramiento-territorial:${year}`}))`;
    const used = await tx.territorialCreationAppointment.count({
      where: { number: { startsWith: `NOM-TERR-${year}-` } },
    });
    const number = `NOM-TERR-${year}-${String(used + 1).padStart(4, '0')}`;
    const appointment = await tx.territorialCreationAppointment.create({
      data: {
        publicId: newPublicId(),
        number,
        territorialUnitId: unit.id,
        delegateOfficeTermId: term.id,
        appointedByOfficeTermId: issuer.data.officeTermId,
        appointedOn,
        reason: data.reason,
        agreementText: textoDelAcuerdo({
          number,
          appointedOn: data.appointedOn,
          level: data.level,
          unitName: data.name,
          unitCode: code,
          parentName: parent.name,
          legalEntityName: legalEntity.legalName,
          responsibleName: personName,
          issuer: issuer.data,
          endsOn: endsOn.toISOString().slice(0, 10),
          reason: data.reason,
        }),
        issuedByActorId: actor.actorId,
      },
      select: { id: true, publicId: true, number: true },
    });

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.TERRITORIAL_UNIT_APPOINTED,
      objectKind: 'TerritorialCreationAppointment',
      objectId: appointment.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      territorialUnitId: unit.id,
      onBehalfOfPersonId: membership.personId,
      metadata: {
        appointmentNumber: appointment.number, level: data.level, unit: data.name, responsible: personName,
        appointedByOfficeTermId: issuer.data.officeTermId,
      },
    });

    return {
      territorialUnitId: unit.id,
      unionBodyId: body.id,
      officeDefinitionId: office.id,
      officeTermId: term.id,
      appointmentPublicId: appointment.publicId,
      appointmentNumber: appointment.number,
    };
  });

  return ok(result);
}

export const attachSignedTerritorialAppointmentSchema = z.object({
  appointmentId: z.uuid(),
  originalFileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg'], {
    error: () => 'Adjunta el acuerdo firmado como PDF, PNG o JPG.',
  }),
  content: z.instanceof(Uint8Array),
});

export type AttachSignedTerritorialAppointmentInput = z.infer<
  typeof attachSignedTerritorialAppointmentSchema
>;

/** Incorpora la copia firmada al acto ya existente sin recrear la estructura. */
export async function attachSignedTerritorialAppointment(
  actor: ActorContext,
  input: AttachSignedTerritorialAppointmentInput,
): Promise<UseCaseResult<{ fileObjectId: string; appointmentPublicId: string }>> {
  const parsed = attachSignedTerritorialAppointmentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const appointment = await db().territorialCreationAppointment.findUnique({
    where: { id: data.appointmentId },
    select: {
      id: true,
      publicId: true,
      number: true,
      appointedOn: true,
      signedFileId: true,
      territorialUnit: { select: { id: true, path: true } },
      delegateOfficeTerm: {
        select: { officeDefinition: { select: { unionBody: { select: { legalEntityId: true } } } } },
      },
    },
  });
  if (appointment === null) return fail(errors.notFound('El nombramiento territorial no existe.'));
  if (appointment.signedFileId !== null) {
    return fail(errors.conflict('Este nombramiento ya tiene incorporada su copia firmada.'));
  }

  const legalEntityId = appointment.delegateOfficeTerm.officeDefinition.unionBody.legalEntityId;
  const context = { ...actor, reason: `incorporar copia firmada de ${appointment.number}` };
  const decision = can(context, 'governance.office.appoint', {
    kind: 'TerritorialCreationAppointment',
    legalEntityId,
    territorialPath: appointment.territorialUnit.path,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const issuer = await issuingSecretaryTerm(context, legalEntityId, new Date());
  if (!issuer.ok) return issuer;

  const uploaded = await uploadFile(context, {
    legalEntityId,
    classification: 'INTERNAL',
    contextKind: 'GOVERNANCE',
    contextId: appointment.id,
    originalFileName: data.originalFileName,
    mimeType: data.mimeType,
    content: data.content,
  });
  if (!uploaded.ok) return fail(uploaded.error);

  await transaction(async (tx) => {
    await tx.territorialCreationAppointment.update({
      where: { id: appointment.id },
      data: { signedFileId: uploaded.data.fileObjectId },
    });
    await recordAudit(tx, context, {
      action: AUDIT_ACTIONS.TERRITORIAL_APPOINTMENT_SIGNED_FILE_ATTACHED,
      objectKind: 'TerritorialCreationAppointment',
      objectId: appointment.id,
      outcome: 'SUCCESS',
      legalEntityId,
      territorialUnitId: appointment.territorialUnit.id,
      metadata: {
        appointmentNumber: appointment.number,
        signedFileId: uploaded.data.fileObjectId,
        attachedByOfficeTermId: issuer.data.officeTermId,
      },
    });
  });

  return ok({
    fileObjectId: uploaded.data.fileObjectId,
    appointmentPublicId: appointment.publicId,
  });
}

export interface TerritorialAppointmentDetail {
  readonly id: string;
  readonly publicId: string;
  readonly number: string;
  readonly appointedOn: Date;
  readonly agreementText: string;
  readonly signedFileId: string | null;
  readonly unitPublicId: string;
  readonly unitName: string;
  readonly responsibleName: string;
  readonly issuerName: string;
  readonly issuerCapacity: string;
  readonly canAttachSignedFile: boolean;
  readonly canDownloadSignedFile: boolean;
}

/** Consulta el acuerdo inmutable y el estado de su copia firmada. */
export async function territorialAppointmentDetail(
  actor: ActorContext,
  publicId: string,
): Promise<UseCaseResult<TerritorialAppointmentDetail>> {
  const appointment = await db().territorialCreationAppointment.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      number: true,
      appointedOn: true,
      agreementText: true,
      signedFileId: true,
      territorialUnit: { select: { id: true, publicId: true, name: true, path: true } },
      delegateOfficeTerm: {
        select: {
          person: {
            select: {
              givenName: true,
              middleName: true,
              familyName: true,
              secondFamilyName: true,
              preferredName: true,
            },
          },
          officeDefinition: { select: { unionBody: { select: { legalEntityId: true } } } },
        },
      },
      appointedByOfficeTerm: {
        select: {
          person: {
            select: {
              givenName: true,
              middleName: true,
              familyName: true,
              secondFamilyName: true,
              preferredName: true,
            },
          },
          officeDefinition: { select: { name: true } },
        },
      },
    },
  });
  if (appointment === null) return fail(errors.notFound('El nombramiento territorial no existe.'));

  const legalEntityId = appointment.delegateOfficeTerm.officeDefinition.unionBody.legalEntityId;
  const decision = can(actor, 'territory.unit.read', {
    kind: 'TerritorialCreationAppointment',
    legalEntityId,
    territorialPath: appointment.territorialUnit.path,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const mayAppoint = can({ ...actor, reason: 'consultar expediente de nombramiento territorial' }, 'governance.office.appoint', {
    kind: 'TerritorialCreationAppointment',
    legalEntityId,
    territorialPath: appointment.territorialUnit.path,
  }).allowed;
  const mayDownload = appointment.signedFileId !== null && can(actor, 'files.file.download', {
    kind: 'FileObject',
    id: appointment.signedFileId,
    legalEntityId,
  }).allowed;
  const issuerName = appointment.appointedByOfficeTerm === null
    ? 'Superadmin'
    : nombreCompleto(appointment.appointedByOfficeTerm.person);
  const issuerCapacity = appointment.appointedByOfficeTerm?.officeDefinition.name ?? 'Autoridad de instalación inicial';

  return ok({
    id: appointment.id,
    publicId: appointment.publicId,
    number: appointment.number,
    appointedOn: appointment.appointedOn,
    agreementText: appointment.agreementText,
    signedFileId: appointment.signedFileId,
    unitPublicId: appointment.territorialUnit.publicId,
    unitName: appointment.territorialUnit.name,
    responsibleName: nombreCompleto(appointment.delegateOfficeTerm.person),
    issuerName,
    issuerCapacity,
    canAttachSignedFile: mayAppoint && (actor.actorKind === 'ROOT_SUPERADMIN' || actor.personId !== null),
    canDownloadSignedFile: mayDownload,
  });
}
