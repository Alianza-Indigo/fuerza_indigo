import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { BeneficiaryOrigin, BeneficiaryStatus, BeneficiaryUrgency } from '@prisma-client/enums';

/**
 * Beneficiario protegido (PRD §3.4, §8.3; F4-AFI-004).
 *
 * La calidad que existe para que nadie se quede fuera: **atención sin
 * afiliación y sin pago**. No concede derechos electorales, no genera cuota, no
 * entra en el padrón que se remite a la autoridad laboral, puede existir sin
 * cuenta digital y convive con cualquier otra calidad de la misma persona.
 *
 * El PRD §8.3 abre siete orígenes y aquí están los siete. No es una lista larga
 * por gusto: cada uno describe una puerta distinta por la que alguien llega a
 * pedir ayuda, y saber por cuál llegó cambia a quién hay que avisar.
 *
 * **Privacidad reforzada por omisión.** Se puede bajar a estándar con motivo, y
 * nunca para una persona menor de edad. Al revés —empezar en estándar y subir
 * cuando alguien se acuerde— la protección llegaría siempre tarde.
 */

const ORIGENES = [
  'SELF',
  'FAMILY_OR_CAREGIVER',
  'UNION_MEMBER',
  'DELEGATE',
  'SOCIAL_STAFF',
  'CIAN',
  'EXTERNAL_REFERRAL',
] as const;

export const registerBeneficiarySchema = z.object({
  personId: z.uuid({ error: () => 'Elige a la persona que va a recibir atención.' }),
  legalEntityId: z.uuid({ error: () => 'Elige qué entidad se hace cargo.' }),
  originKind: z.enum(ORIGENES, { error: () => 'Di por dónde llegó esta solicitud de apoyo.' }),
  initialNeed: z
    .string()
    .trim()
    .min(15, { error: () => 'Cuenta con qué necesita ayuda. Con quince caracteres basta para empezar.' })
    .max(4000),
  urgencyLevel: z.enum(['ROUTINE', 'PRIORITY', 'URGENT']).default('ROUTINE'),
  territorialUnitId: z.uuid().nullable().default(null),
  /** Persona responsable, para quien es menor de edad o requiere representación. */
  responsiblePersonId: z.uuid().nullable().default(null),
  privacyLevel: z.enum(['STANDARD', 'REINFORCED']).default('REINFORCED'),
});

export type RegisterBeneficiaryInput = z.input<typeof registerBeneficiarySchema>;

export const updateBeneficiarySchema = z.object({
  beneficiaryId: z.uuid(),
  urgencyLevel: z.enum(['ROUTINE', 'PRIORITY', 'URGENT']),
  status: z.enum(['REGISTERED', 'IN_ATTENTION', 'REFERRED']),
  territorialUnitId: z.uuid().nullable().default(null),
  responsiblePersonId: z.uuid().nullable().default(null),
  privacyLevel: z.enum(['STANDARD', 'REINFORCED']),
  /** Obligatorio para bajar la privacidad a estándar. */
  privacyChangeReason: z.string().trim().max(600).nullable().default(null),
});

export type UpdateBeneficiaryInput = z.input<typeof updateBeneficiarySchema>;

export const closeBeneficiarySchema = z.object({
  beneficiaryId: z.uuid(),
  outcome: z.enum(['CLOSED', 'ARCHIVED']),
  closeReason: z
    .string()
    .trim()
    .min(15, { error: () => 'Escribe cómo terminó la atención. Mínimo quince caracteres.' })
    .max(1000),
});

export type CloseBeneficiaryInput = z.infer<typeof closeBeneficiarySchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Edad cumplida a partir de la fecha de nacimiento.
 *
 * Se calcula sobre el calendario y no dividiendo milisegundos: los años no duran
 * todos lo mismo y quien nació un 29 de febrero cumple igual.
 */
function esMenorDeEdad(birthDate: Date | null): boolean {
  if (birthDate === null) return false;
  const hoy = new Date();
  const cumple = new Date(
    Date.UTC(birthDate.getUTCFullYear() + 18, birthDate.getUTCMonth(), birthDate.getUTCDate()),
  );
  return cumple > hoy;
}

export async function registerBeneficiary(
  actor: ActorContext,
  input: RegisterBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string; publicId: string }>> {
  const parsed = registerBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;
  const propio = datos.personId === actor.personId;

  // Registrarse una misma y registrar a otra persona no son la misma facultad:
  // la primera la tiene cualquiera que pida ayuda, y la segunda deja un rastro
  // distinto porque alguien está hablando por otro.
  const decision = can(
    actor,
    propio ? 'membership.beneficiary.create_own' : 'membership.beneficiary.create',
    { kind: 'ProtectedBeneficiary', legalEntityId: datos.legalEntityId },
    { hasLiveAssignment: () => propio },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (propio && datos.originKind !== 'SELF') {
    return fail(
      errors.validation({
        originKind: ['Si te registras tú, el origen es «la propia persona».'],
      }),
    );
  }

  const persona = await db().person.findUnique({
    where: { id: datos.personId },
    select: { id: true, birthDate: true, mergedIntoPersonId: true, user: { select: { id: true } } },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));
  if (persona.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Ese registro quedó fusionado con otro. Da de alta la atención sobre el registro que se conservó.',
        'la persona está fusionada',
      ),
    );
  }

  if (datos.responsiblePersonId === datos.personId) {
    return fail(
      errors.validation({ responsiblePersonId: ['Nadie es responsable de sí mismo.'] }),
    );
  }

  const menor = esMenorDeEdad(persona.birthDate);
  if (menor && datos.privacyLevel === 'STANDARD') {
    return fail(
      errors.ruleViolation(
        'La atención a una persona menor de edad lleva privacidad reforzada. No es opcional.',
        'intento de privacidad estándar para persona menor de edad',
      ),
    );
  }
  if (menor && datos.responsiblePersonId === null) {
    return fail(
      errors.validation({
        responsiblePersonId: [
          'Para una persona menor de edad hace falta decir quién la representa.',
        ],
      }),
    );
  }

  const viva = await db().protectedBeneficiary.findFirst({
    where: {
      personId: datos.personId,
      legalEntityId: datos.legalEntityId,
      status: { notIn: ['CLOSED', 'ARCHIVED'] },
    },
    select: { publicId: true },
  });
  if (viva !== null) {
    return fail(
      errors.conflict(
        `Esa persona ya tiene una atención abierta con esta entidad, la ${viva.publicId}. Añade lo nuevo ahí en vez de abrir otra.`,
        'atención viva duplicada',
      ),
    );
  }

  const creada = await transaction(async (tx) => {
    const registro = await tx.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: datos.personId,
        legalEntityId: datos.legalEntityId,
        originKind: datos.originKind,
        registeredById: actor.userId,
        initialNeed: datos.initialNeed,
        urgencyLevel: datos.urgencyLevel,
        territorialUnitId: datos.territorialUnitId,
        responsiblePersonId: datos.responsiblePersonId,
        hasDigitalAccount: persona.user !== null,
        privacyLevel: menor ? 'REINFORCED' : datos.privacyLevel,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, publicId: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_REGISTERED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: datos.legalEntityId,
      onBehalfOfPersonId: datos.personId,
      ...(datos.territorialUnitId === null ? {} : { territorialUnitId: datos.territorialUnitId }),
      metadata: {
        origen: datos.originKind,
        urgencia: datos.urgencyLevel,
        menorDeEdad: menor,
        propio,
      },
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
      person: { select: { birthDate: true } },
    },
  });
  if (registro === null) return fail(errors.notFound('registro de atención inexistente'));

  const decision = can(actor, 'membership.beneficiary.update', {
    kind: 'ProtectedBeneficiary',
    id: registro.id,
    legalEntityId: registro.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (registro.status === 'CLOSED' || registro.status === 'ARCHIVED') {
    return fail(
      errors.conflict('Esa atención está cerrada. Abre una nueva si la persona vuelve.', `estado ${registro.status}`),
    );
  }

  if (datos.responsiblePersonId === registro.personId) {
    return fail(errors.validation({ responsiblePersonId: ['Nadie es responsable de sí mismo.'] }));
  }

  const menor = esMenorDeEdad(registro.person.birthDate);
  const bajaLaPrivacidad = registro.privacyLevel === 'REINFORCED' && datos.privacyLevel === 'STANDARD';

  if (bajaLaPrivacidad && menor) {
    return fail(
      errors.ruleViolation(
        'La atención a una persona menor de edad lleva privacidad reforzada. No es opcional.',
        'intento de bajar la privacidad de una persona menor de edad',
      ),
    );
  }
  if (bajaLaPrivacidad && (datos.privacyChangeReason ?? '').trim().length < 15) {
    return fail(
      errors.validation({
        privacyChangeReason: [
          'Bajar la privacidad de un expediente exige explicarlo. Mínimo quince caracteres.',
        ],
      }),
    );
  }

  await transaction(async (tx) => {
    await tx.protectedBeneficiary.update({
      where: { id: registro.id },
      data: {
        urgencyLevel: datos.urgencyLevel,
        status: datos.status,
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
      metadata: {
        estado: datos.status,
        urgencia: datos.urgencyLevel,
        privacidad: menor ? 'REINFORCED' : datos.privacyLevel,
        bajaLaPrivacidad,
      },
    });
  });

  return ok({ beneficiaryId: registro.id });
}

export async function closeBeneficiary(
  actor: ActorContext,
  input: CloseBeneficiaryInput,
): Promise<UseCaseResult<{ beneficiaryId: string }>> {
  const parsed = closeBeneficiarySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const registro = await db().protectedBeneficiary.findUnique({
    where: { id: parsed.data.beneficiaryId },
    select: { id: true, status: true, personId: true, legalEntityId: true },
  });
  if (registro === null) return fail(errors.notFound('registro de atención inexistente'));

  const decision = can(actor, 'membership.beneficiary.update', {
    kind: 'ProtectedBeneficiary',
    id: registro.id,
    legalEntityId: registro.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (registro.status === 'CLOSED' || registro.status === 'ARCHIVED') {
    return fail(errors.conflict('Esa atención ya está cerrada.', `estado ${registro.status}`));
  }

  await transaction(async (tx) => {
    await tx.protectedBeneficiary.update({
      where: { id: registro.id },
      data: {
        status: parsed.data.outcome,
        closedAt: new Date(),
        closeReason: parsed.data.closeReason,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BENEFICIARY_CLOSED,
      objectKind: 'ProtectedBeneficiary',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      reason: parsed.data.closeReason,
      metadata: { desenlace: parsed.data.outcome },
    });
  });

  return ok({ beneficiaryId: registro.id });
}

export interface BeneficiaryRow {
  readonly id: string;
  readonly publicId: string;
  readonly personId: string;
  readonly personName: string;
  readonly legalEntity: string;
  readonly originKind: BeneficiaryOrigin;
  readonly urgencyLevel: BeneficiaryUrgency;
  readonly status: BeneficiaryStatus;
  readonly privacyLevel: 'STANDARD' | 'REINFORCED';
  readonly territory: string | null;
  readonly hasDigitalAccount: boolean;
  readonly responsiblePersonName: string | null;
  readonly registeredAt: Date;
  /**
   * La necesidad inicial, tal como se contó. Solo sale con privacidad estándar:
   * en un listado con privacidad reforzada, lo que alguien contó de su vida no
   * es una columna de una tabla.
   */
  readonly initialNeed: string | null;
}

function nombre(persona: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

/**
 * El expediente de **una** atención, con la necesidad inicial incluida.
 *
 * Existe aparte del padrón por dos razones (defecto `D-F4-011`). La primera es
 * de contenido: el padrón oculta la necesidad de una atención con privacidad
 * reforzada, así que la pantalla de expediente —que la leía del padrón— no podía
 * enseñarla nunca, y proponía bajar la privacidad para leer lo que ya tenía
 * derecho a ver quien abre el expediente. Ocultar en la lista y mostrar en el
 * expediente no son la misma regla: lo que alguien contó de su vida no es una
 * columna de una tabla, y sí es el motivo por el que se abre su expediente.
 *
 * La segunda es de corrección: el padrón devuelve como mucho doscientas filas,
 * así que buscar una entre ellas dejaba de encontrar los expedientes en cuanto
 * hubiera más.
 *
 * **La lectura deja asiento.** Abrir un expediente reforzado se anota en la
 * bitácora. Eso es lo que «controles reforzados de privacidad» (PRD §3.4)
 * significa cuando se traduce a algo que se puede comprobar: quien contó algo
 * puede saber quién lo ha leído.
 */
export async function beneficiaryDetail(
  actor: ActorContext,
  beneficiaryId: string,
): Promise<UseCaseResult<BeneficiaryRow>> {
  const fila = await db().protectedBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: {
      id: true,
      publicId: true,
      personId: true,
      legalEntityId: true,
      originKind: true,
      urgencyLevel: true,
      status: true,
      privacyLevel: true,
      hasDigitalAccount: true,
      initialNeed: true,
      createdAt: true,
      territorialUnitId: true,
      legalEntity: { select: { shortName: true } },
      territorialUnit: { select: { name: true } },
      person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
      responsiblePerson: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true },
      },
    },
  });
  if (fila === null) return fail(errors.notFound('atención inexistente'));

  const decision = can(actor, 'membership.beneficiary.read', {
    kind: 'ProtectedBeneficiary',
    id: fila.id,
    legalEntityId: fila.legalEntityId,
    containsPersonalData: true,
    ...(fila.territorialUnitId === null ? {} : { territorialUnitId: fila.territorialUnitId }),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (fila.privacyLevel === 'REINFORCED') {
    await transaction(async (tx) => {
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.BENEFICIARY_FILE_READ,
        objectKind: 'ProtectedBeneficiary',
        objectId: fila.id,
        outcome: 'SUCCESS',
        legalEntityId: fila.legalEntityId,
        onBehalfOfPersonId: fila.personId,
        ...(fila.territorialUnitId === null ? {} : { territorialUnitId: fila.territorialUnitId }),
        metadata: { privacidad: fila.privacyLevel },
      });
    });
  }

  return ok({
    id: fila.id,
    publicId: fila.publicId,
    personId: fila.personId,
    personName: nombre(fila.person),
    legalEntity: fila.legalEntity.shortName,
    originKind: fila.originKind,
    urgencyLevel: fila.urgencyLevel,
    status: fila.status,
    privacyLevel: fila.privacyLevel,
    territory: fila.territorialUnit?.name ?? null,
    hasDigitalAccount: fila.hasDigitalAccount,
    responsiblePersonName: fila.responsiblePerson === null ? null : nombre(fila.responsiblePerson),
    registeredAt: fila.createdAt,
    initialNeed: fila.initialNeed,
  });
}

export async function beneficiaryRegistry(
  actor: ActorContext,
  filtros: { status?: BeneficiaryStatus; urgency?: BeneficiaryUrgency; query?: string } = {},
): Promise<UseCaseResult<BeneficiaryRow[]>> {
  const decision = can(actor, 'membership.beneficiary.read', {
    kind: 'ProtectedBeneficiary',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const texto = (filtros.query ?? '').trim();
  const filas = await db().protectedBeneficiary.findMany({
    where: {
      ...(filtros.status === undefined ? {} : { status: filtros.status }),
      ...(filtros.urgency === undefined ? {} : { urgencyLevel: filtros.urgency }),
      ...(texto === ''
        ? {}
        : {
            OR: [
              { publicId: texto },
              { person: { familyName: { contains: texto, mode: 'insensitive' as const } } },
              { person: { givenName: { contains: texto, mode: 'insensitive' as const } } },
            ],
          }),
    },
    orderBy: [{ urgencyLevel: 'desc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      publicId: true,
      personId: true,
      originKind: true,
      urgencyLevel: true,
      status: true,
      privacyLevel: true,
      hasDigitalAccount: true,
      initialNeed: true,
      createdAt: true,
      legalEntity: { select: { shortName: true } },
      territorialUnit: { select: { name: true } },
      person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
      responsiblePerson: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      personId: fila.personId,
      personName: nombre(fila.person),
      legalEntity: fila.legalEntity.shortName,
      originKind: fila.originKind,
      urgencyLevel: fila.urgencyLevel,
      status: fila.status,
      privacyLevel: fila.privacyLevel,
      territory: fila.territorialUnit?.name ?? null,
      hasDigitalAccount: fila.hasDigitalAccount,
      responsiblePersonName: fila.responsiblePerson === null ? null : nombre(fila.responsiblePerson),
      registeredAt: fila.createdAt,
      initialNeed: fila.privacyLevel === 'REINFORCED' ? null : fila.initialNeed,
    })),
  );
}
