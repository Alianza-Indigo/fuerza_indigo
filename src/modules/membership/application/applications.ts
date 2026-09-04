import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { Prisma } from '@prisma-client/client';
import type { MembershipCategory } from '@prisma-client/enums';

/**
 * Solicitud de afiliación (PRD §8.1 y §8.2, F4-AFI-002).
 *
 * Recorre los ocho primeros pasos del flujo del PRD §8.1 —los que son de la
 * persona que solicita—. Del noveno en adelante son actos de la organización y
 * viven en el módulo de revisión.
 *
 * **Dónde vive un borrador, y por qué importa.** El formulario por pasos guarda
 * el borrador en el navegador y no lo manda al servidor mientras el trámite no
 * se envía: un trámite a medias contiene datos que la persona todavía no decidió
 * compartir, y guardarlos «por comodidad» los convierte en datos tratados sin
 * base para tratarlos. Por eso quien se afilia a sí misma **no** deja fila hasta
 * que envía.
 *
 * La captura asistida es distinta y por eso sí tiene borrador en el servidor:
 * cuando una delegación captura la solicitud de alguien que no puede hacerlo
 * solo, esos datos ya se los dieron a la organización, y perderlos a media
 * captura sería obligar a la persona a contarlo todo otra vez.
 *
 * **Lo que se envía no se toca.** `originalSummary` guarda la instantánea de lo
 * enviado y un disparador impide cambiarla (ADR-0065). La revisión anota,
 * requiere y resuelve; no reescribe.
 */

const texto = (min: number, max: number, mensaje: string) =>
  z.string().trim().min(min, { error: () => mensaje }).max(max);

/** Campos comunes a las dos vías. */
const comunes = {
  membershipTypeId: z.uuid({ error: () => 'Elige la calidad a la que te quieres afiliar.' }),
  territorialUnitId: z.uuid().nullable().default(null),
} as const;

/** Campos de la vía sindical (PRD §8.1, pasos 3 a 5). */
const sindicales = {
  occupationSpecialtyId: z.uuid({
    error: () => 'Elige tu oficio, profesión o disciplina del catálogo.',
  }),
  workRelationKind: z.enum(['SUBORDINATE', 'INDEPENDENT', 'AUTONOMOUS', 'SELF_EMPLOYED'], {
    error: () => 'Di cómo trabajas: por cuenta ajena, de forma independiente, autónoma o por cuenta propia.',
  }),
  neurodivergentContactStatement: texto(
    30,
    4000,
    'Cuenta con tus palabras cómo tu actividad te pone en contacto con personas neurodivergentes. Con treinta caracteres basta para empezar.',
  ),
  otherUnionMembership: z.enum(['NONE', 'SAME_TRADE', 'DIFFERENT_TRADE'], {
    error: () => 'Di si perteneces a otro sindicato y, si es así, de qué gremio.',
  }),
  otherUnionClarification: z.string().trim().max(4000).nullable().default(null),
} as const;

/** Campo de la vía honoraria (PRD §8.2, paso 1). */
const honorarios = {
  honoraryProfile: z.enum(['NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'], {
    error: () => 'Elige desde qué perfil te afilias: persona neurodivergente, familiar o persona cuidadora.',
  }),
  neurodivergentContactStatement: z.string().trim().max(4000).nullable().default(null),
} as const;

/**
 * Aceptación de estatutos, avisos y declaraciones (PRD §8.1, paso 7).
 *
 * Es una casilla y no un valor por omisión. Un consentimiento premarcado no es
 * un consentimiento, y aquí lo que se acepta son obligaciones estatutarias.
 */
const aceptacion = z.boolean().refine((marcada) => marcada, {
  error: () => 'Para enviar la solicitud tienes que aceptar los estatutos, los avisos y las declaraciones.',
});

export const submitApplicationSchema = z.discriminatedUnion('category', [
  z.object({
    category: z.literal('UNION_MEMBER'),
    ...comunes,
    ...sindicales,
    acceptsStatutes: aceptacion,
    /** Solo en captura asistida: a nombre de quién se solicita. */
    personId: z.uuid().optional(),
    applicationId: z.uuid().optional(),
  }),
  z.object({
    category: z.literal('HONORARY_AFFILIATE'),
    ...comunes,
    ...honorarios,
    acceptsStatutes: aceptacion,
    personId: z.uuid().optional(),
    applicationId: z.uuid().optional(),
  }),
]);

export type SubmitApplicationInput = z.input<typeof submitApplicationSchema>;

export const startAssistedApplicationSchema = z.object({
  personId: z.uuid({ error: () => 'Elige a la persona que solicita.' }),
  membershipTypeId: z.uuid({ error: () => 'Elige la calidad a la que se afilia.' }),
  territorialUnitId: z.uuid().nullable().default(null),
});

export type StartAssistedApplicationInput = z.input<typeof startAssistedApplicationSchema>;

export const saveAssistedDraftSchema = z.object({
  applicationId: z.uuid(),
  /** Lo capturado hasta ahora, sin exigencia de estar completo. */
  draft: z.record(z.string(), z.string()),
});

export type SaveAssistedDraftInput = z.infer<typeof saveAssistedDraftSchema>;

export const withdrawApplicationSchema = z.object({
  applicationId: z.uuid(),
  reason: texto(10, 600, 'Cuéntanos por qué retiras la solicitud. Con diez caracteres basta.'),
});

export type WithdrawApplicationInput = z.infer<typeof withdrawApplicationSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Folio de la solicitud: prefijo de la entidad, año y consecutivo.
 *
 * El consecutivo se calcula bajo un cerrojo de transacción sobre la serie, igual
 * que la cadena de la bitácora: sin él, dos solicitudes enviadas en el mismo
 * segundo pedirían el mismo número y una de las dos moriría contra el índice
 * único, que es la peor forma de perder un trámite que alguien acaba de llenar.
 */
async function siguienteFolio(tx: Tx, prefijo: string, año: number): Promise<string> {
  const serie = `${prefijo}-${año}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`folio:${serie}`}))`;
  const usados = await tx.membershipApplication.count({ where: { folio: { startsWith: `${serie}-` } } });
  return `${serie}-${String(usados + 1).padStart(5, '0')}`;
}

interface CalidadElegida {
  readonly id: string;
  readonly category: MembershipCategory;
  readonly legalEntityId: string;
  readonly requiresHumanReview: boolean;
  readonly isActive: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

async function calidadVigente(membershipTypeId: string, ahora: Date): Promise<CalidadElegida | null> {
  const tipo = await db().membershipType.findUnique({
    where: { id: membershipTypeId },
    select: {
      id: true,
      category: true,
      legalEntityId: true,
      requiresHumanReview: true,
      isActive: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });
  if (tipo === null) return null;
  if (!tipo.isActive) return null;
  if (tipo.effectiveFrom > ahora) return null;
  if (tipo.effectiveTo !== null && tipo.effectiveTo <= ahora) return null;
  return tipo;
}

/** Versión del estatuto que rige hoy y que la solicitud acepta (PRD §8.1.7). */
async function estatutoVigente(): Promise<{ id: string; version: string } | null> {
  return db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true },
  });
}

export interface SubmittedApplication {
  readonly applicationId: string;
  readonly folio: string;
  readonly status: string;
  readonly requiresReview: boolean;
}

/**
 * Envío de la solicitud (PRD §8.1, paso 8).
 *
 * Sirve a las dos vías: crea la fila ya enviada cuando no venía de un borrador
 * asistido, o cierra el borrador existente. En los dos casos escribe el resumen
 * inmutable, que es lo que después nadie puede alterar.
 */
export async function submitApplication(
  actor: ActorContext,
  input: SubmitApplicationInput,
): Promise<UseCaseResult<SubmittedApplication>> {
  const parsed = submitApplicationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;
  const paraOtraPersona = datos.personId !== undefined && datos.personId !== actor.personId;
  const personId = datos.personId ?? actor.personId;

  if (personId === null || personId === undefined) {
    return fail(
      errors.unauthenticated('Para enviar una solicitud a tu nombre necesitas haber iniciado sesión.'),
    );
  }

  const ahora = new Date();
  const calidad = await calidadVigente(datos.membershipTypeId, ahora);
  if (calidad === null) {
    return fail(
      errors.ruleViolation(
        'Esa calidad de membresía no está disponible ahora mismo.',
        'tipo de membresía inexistente, archivado o fuera de vigencia',
      ),
    );
  }
  if (calidad.category !== datos.category) {
    return fail(
      errors.validation({
        membershipTypeId: ['La calidad elegida no corresponde con el tipo de solicitud que estás llenando.'],
      }),
    );
  }

  const decision = can(
    actor,
    paraOtraPersona ? 'membership.application.create' : 'membership.application.create_own',
    { kind: 'MembershipApplication', legalEntityId: calidad.legalEntityId },
    { hasLiveAssignment: () => !paraOtraPersona },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (datos.category === 'UNION_MEMBER' && datos.otherUnionMembership !== 'NONE') {
    const aclaracion = datos.otherUnionClarification ?? '';
    if (aclaracion.trim().length < 20) {
      return fail(
        errors.validation({
          otherUnionClarification: [
            'Explica tu situación respecto de ese otro sindicato. Con veinte caracteres basta, y hace falta para poder resolver.',
          ],
        }),
      );
    }
  }

  const estatuto = await estatutoVigente();
  if (estatuto === null) {
    return fail(
      errors.ruleViolation(
        'Ahora mismo no podemos recibir solicitudes. Escríbenos y te atendemos igual.',
        'no hay ninguna versión de reglas estatutarias en vigor: nadie puede aceptar un estatuto inexistente',
      ),
    );
  }

  // Ninguna persona sostiene dos trámites vivos de la misma calidad a la vez, ni
  // una calidad que ya tiene: lo primero duplica el trabajo de quien revisa, y
  // lo segundo es pedir lo que ya se es.
  const [enCurso, yaEsMiembro] = await Promise.all([
    db().membershipApplication.findFirst({
      where: {
        personId,
        category: datos.category,
        status: { in: ['DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'PENDING_PAYMENT'] },
        ...(datos.applicationId === undefined ? {} : { id: { not: datos.applicationId } }),
      },
      select: { folio: true },
    }),
    db().membership.findFirst({
      where: { personId, category: datos.category, status: 'ACTIVE' },
      select: { memberNumber: true },
    }),
  ]);

  if (yaEsMiembro !== null) {
    return fail(
      errors.conflict(
        datos.category === 'UNION_MEMBER'
          ? `Esa persona ya es agremiada, con el número ${yaEsMiembro.memberNumber}.`
          : `Esa persona ya tiene la afiliación honoraria activa, con el número ${yaEsMiembro.memberNumber}.`,
        'membresía activa de la misma categoría',
      ),
    );
  }
  if (enCurso !== null) {
    return fail(
      errors.conflict(
        `Ya hay una solicitud en curso para esa calidad, con folio ${enCurso.folio}. Consúltala en vez de enviar otra.`,
        'solicitud viva de la misma categoría',
      ),
    );
  }

  const entidad = await db().legalEntity.findUniqueOrThrow({
    where: { id: calidad.legalEntityId },
    select: { documentSeriesPrefix: true },
  });

  const camposDeLaVia =
    datos.category === 'UNION_MEMBER'
      ? {
          occupationSpecialtyId: datos.occupationSpecialtyId,
          workRelationKind: datos.workRelationKind,
          neurodivergentContactStatement: datos.neurodivergentContactStatement,
          otherUnionMembership: datos.otherUnionMembership,
          otherUnionClarification: datos.otherUnionClarification,
          honoraryProfile: null,
        }
      : {
          honoraryProfile: datos.honoraryProfile,
          neurodivergentContactStatement: datos.neurodivergentContactStatement,
          occupationSpecialtyId: null,
          workRelationKind: null,
          otherUnionMembership: null,
          otherUnionClarification: null,
        };

  const estado = calidad.requiresHumanReview ? 'SUBMITTED' : 'APPROVED';

  const enviada = await transaction(async (tx) => {
    const persona = await tx.person.findUniqueOrThrow({
      where: { id: personId },
      select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, publicId: true },
    });

    const resumen = {
      enviadoEl: ahora.toISOString(),
      solicitante: {
        publicId: persona.publicId,
        nombre: [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
          .filter((parte) => parte !== null && parte !== '')
          .join(' '),
      },
      calidad: { id: calidad.id, categoria: datos.category },
      territorio: datos.territorialUnitId,
      estatutoAceptado: estatuto.version,
      capturaAsistida: paraOtraPersona,
      ...camposDeLaVia,
    };

    if (datos.applicationId !== undefined) {
      const borrador = await tx.membershipApplication.findUnique({
        where: { id: datos.applicationId },
        select: { id: true, status: true, personId: true, folio: true },
      });
      if (borrador === null) return { tipo: 'inexistente' as const };
      if (borrador.status !== 'DRAFT') return { tipo: 'ya_enviada' as const, folio: borrador.folio };
      if (borrador.personId !== personId) return { tipo: 'otra_persona' as const };

      const actualizada = await tx.membershipApplication.update({
        where: { id: datos.applicationId },
        data: {
          ...camposDeLaVia,
          territorialUnitId: datos.territorialUnitId,
          acceptedRuleSetId: estatuto.id,
          status: estado,
          submittedAt: ahora,
          originalSummary: resumen,
          // El borrador deja de tener sentido en cuanto hay resumen enviado, y
          // conservarlo sería guardar una segunda versión de lo mismo que nadie
          // sabría cuál manda.
          autosavedDraft: Prisma.DbNull,
          updatedByActorId: actor.actorId,
          rowVersion: { increment: 1 },
        },
        select: { id: true, folio: true, status: true },
      });

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
        objectKind: 'MembershipApplication',
        objectId: actualizada.id,
        outcome: 'SUCCESS',
        legalEntityId: calidad.legalEntityId,
        onBehalfOfPersonId: personId,
        metadata: { folio: actualizada.folio, categoria: datos.category, desdeBorrador: true },
      });

      return { tipo: 'ok' as const, ...actualizada };
    }

    const folio = await siguienteFolio(tx, entidad.documentSeriesPrefix, ahora.getUTCFullYear());
    const creada = await tx.membershipApplication.create({
      data: {
        folio,
        personId,
        membershipTypeId: calidad.id,
        category: datos.category,
        legalEntityId: calidad.legalEntityId,
        territorialUnitId: datos.territorialUnitId,
        acceptedRuleSetId: estatuto.id,
        status: estado,
        submittedAt: ahora,
        originalSummary: resumen,
        ...camposDeLaVia,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, folio: true, status: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
      objectKind: 'MembershipApplication',
      objectId: creada.id,
      outcome: 'SUCCESS',
      legalEntityId: calidad.legalEntityId,
      onBehalfOfPersonId: personId,
      metadata: { folio: creada.folio, categoria: datos.category, desdeBorrador: false },
    });

    return { tipo: 'ok' as const, ...creada };
  });

  if (enviada.tipo === 'inexistente') return fail(errors.notFound('borrador inexistente'));
  if (enviada.tipo === 'otra_persona') {
    return fail(errors.forbidden('el borrador es de otra persona'));
  }
  if (enviada.tipo === 'ya_enviada') {
    return fail(
      errors.conflict(
        `Esa solicitud ya se envió, con folio ${enviada.folio}.`,
        'la solicitud ya no está en borrador',
      ),
    );
  }

  return ok({
    applicationId: enviada.id,
    folio: enviada.folio,
    status: enviada.status,
    requiresReview: calidad.requiresHumanReview,
  });
}

/** Apertura de un borrador de captura asistida (PRD §8.1, paso 2). */
export async function startAssistedApplication(
  actor: ActorContext,
  input: StartAssistedApplicationInput,
): Promise<UseCaseResult<{ applicationId: string; folio: string }>> {
  const parsed = startAssistedApplicationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;
  const ahora = new Date();

  const calidad = await calidadVigente(datos.membershipTypeId, ahora);
  if (calidad === null) {
    return fail(
      errors.ruleViolation(
        'Esa calidad de membresía no está disponible ahora mismo.',
        'tipo de membresía inexistente, archivado o fuera de vigencia',
      ),
    );
  }

  const decision = can(actor, 'membership.application.create', {
    kind: 'MembershipApplication',
    legalEntityId: calidad.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const estatuto = await estatutoVigente();
  if (estatuto === null) {
    return fail(
      errors.ruleViolation(
        'No hay estatuto en vigor, así que no se puede abrir una solicitud.',
        'ninguna versión de reglas normativas está en vigor',
      ),
    );
  }

  const persona = await db().person.findUnique({
    where: { id: datos.personId },
    select: { id: true, mergedIntoPersonId: true },
  });
  if (persona === null) return fail(errors.notFound('persona inexistente'));
  if (persona.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Ese registro quedó fusionado con otro. Abre la solicitud sobre el registro que se conservó.',
        'la persona está fusionada',
      ),
    );
  }

  const entidad = await db().legalEntity.findUniqueOrThrow({
    where: { id: calidad.legalEntityId },
    select: { documentSeriesPrefix: true },
  });

  const creada = await transaction(async (tx) => {
    const folio = await siguienteFolio(tx, entidad.documentSeriesPrefix, ahora.getUTCFullYear());
    const borrador = await tx.membershipApplication.create({
      data: {
        folio,
        personId: datos.personId,
        membershipTypeId: calidad.id,
        category: calidad.category,
        legalEntityId: calidad.legalEntityId,
        territorialUnitId: datos.territorialUnitId,
        acceptedRuleSetId: estatuto.id,
        status: 'DRAFT',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, folio: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_STARTED,
      objectKind: 'MembershipApplication',
      objectId: borrador.id,
      outcome: 'SUCCESS',
      legalEntityId: calidad.legalEntityId,
      onBehalfOfPersonId: datos.personId,
      metadata: { folio: borrador.folio, asistida: true },
    });

    return borrador;
  });

  return ok({ applicationId: creada.id, folio: creada.folio });
}

/** Guardado del borrador asistido. Solo mientras siga en borrador. */
export async function saveAssistedDraft(
  actor: ActorContext,
  input: SaveAssistedDraftInput,
): Promise<UseCaseResult<{ applicationId: string }>> {
  const parsed = saveAssistedDraftSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const solicitud = await db().membershipApplication.findUnique({
    where: { id: parsed.data.applicationId },
    select: { id: true, status: true, legalEntityId: true },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const decision = can(actor, 'membership.application.create', {
    kind: 'MembershipApplication',
    id: solicitud.id,
    legalEntityId: solicitud.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (solicitud.status !== 'DRAFT') {
    return fail(
      errors.conflict('Esa solicitud ya se envió y no admite más cambios.', 'la solicitud no está en borrador'),
    );
  }

  await db().membershipApplication.update({
    where: { id: solicitud.id },
    data: { autosavedDraft: parsed.data.draft, updatedByActorId: actor.actorId },
  });

  return ok({ applicationId: solicitud.id });
}

/** Retiro de la solicitud por quien la presentó. */
export async function withdrawApplication(
  actor: ActorContext,
  input: WithdrawApplicationInput,
): Promise<UseCaseResult<{ applicationId: string }>> {
  const parsed = withdrawApplicationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const solicitud = await db().membershipApplication.findUnique({
    where: { id: parsed.data.applicationId },
    select: { id: true, status: true, personId: true, legalEntityId: true },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const propia = solicitud.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.application.read_own' : 'membership.application.review',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const RETIRABLES = ['DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED'];
  if (!RETIRABLES.includes(solicitud.status)) {
    return fail(
      errors.conflict(
        'Esa solicitud ya está resuelta y no se puede retirar.',
        `estado no retirable: ${solicitud.status}`,
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.membershipApplication.update({
      where: { id: solicitud.id },
      data: {
        status: 'WITHDRAWN',
        resolutionAt: new Date(),
        resolutionReason: parsed.data.reason,
        ...(actor.userId === null ? {} : { resolvedById: actor.userId }),
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_WITHDRAWN,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      reason: parsed.data.reason,
    });
  });

  return ok({ applicationId: solicitud.id });
}
