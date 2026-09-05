import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { hasLiveConsent } from '@/platform/consent';
import type { CareRelationshipKind } from '@prisma-client/enums';

/**
 * Relaciones familiares y de cuidado (PRD §3.5; F4-AFI-005).
 *
 * **La invariante que gobierna todo el archivo:** una relación familiar **no
 * otorga por sí sola acceso a expedientes**. El alcance dice a dónde llegaría;
 * el consentimiento vigente dice si llega. Sin consentimiento, el alcance es
 * papel mojado, y este módulo lo dice con esas palabras en vez de dejarlo
 * implícito en una comprobación de otro sitio.
 *
 * Por eso `relationshipReach` existe y devuelve las dos cosas por separado: lo
 * declarado y lo efectivo. Una pantalla que solo enseñara lo declarado
 * convencería a cualquiera de que el acceso ya está concedido.
 */

const TIPOS = [
  'PARENT_OR_GUARDIAN',
  'CHILD',
  'SPOUSE_OR_PARTNER',
  'RELATIVE',
  'PRIMARY_CAREGIVER',
  'SECONDARY_CAREGIVER',
  'AUTHORIZED_REPRESENTATIVE',
  'EMERGENCY_CONTACT',
  'RESPONSIBLE_PROFESSIONAL',
] as const;

/** Módulos que una relación puede llegar a alcanzar, si además hay consentimiento. */
const ALCANCES = ['MEMBERSHIP', 'CASES', 'CIAN', 'DOCUMENTS', 'NOTIFICATIONS'] as const;

export const registerCareRelationshipSchema = z.object({
  /** Quien cuida, representa o acompaña. */
  fromPersonId: z.uuid({ error: () => 'Elige a la persona que cuida o representa.' }),
  /** Quien es cuidada, representada o acompañada. */
  toPersonId: z.uuid({ error: () => 'Elige a la persona cuidada o representada.' }),
  kind: z.enum(TIPOS, { error: () => 'Di qué relación es.' }),
  scope: z.array(z.enum(ALCANCES)).default([]),
  evidenceFileId: z.uuid().nullable().default(null),
  startsAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-01-01.' })
    .nullable()
    .default(null),
  endsAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2027-01-01.' })
    .nullable()
    .default(null),
});

export type RegisterCareRelationshipInput = z.input<typeof registerCareRelationshipSchema>;

export const revokeCareRelationshipSchema = z.object({
  relationshipId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, { error: () => 'Escribe por qué se revoca. Con diez caracteres basta.' })
    .max(600),
});

export type RevokeCareRelationshipInput = z.infer<typeof revokeCareRelationshipSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Relaciones que se contradicen entre sí.
 *
 * No se puede ser a la vez madre e hija de la misma persona. Lo comprueba el
 * caso de uso y no el motor porque exige mirar la relación inversa, y una
 * comprobación de fila no ve más que su propia fila.
 */
const OPUESTA: Partial<Record<CareRelationshipKind, CareRelationshipKind>> = {
  PARENT_OR_GUARDIAN: 'CHILD',
  CHILD: 'PARENT_OR_GUARDIAN',
};

export async function registerCareRelationship(
  actor: ActorContext,
  input: RegisterCareRelationshipInput,
): Promise<UseCaseResult<{ relationshipId: string }>> {
  const parsed = registerCareRelationshipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;

  if (datos.fromPersonId === datos.toPersonId) {
    return fail(errors.validation({ toPersonId: ['Nadie es familiar de sí mismo.'] }));
  }

  // Registrar una relación propia —la de quien cuida o la de quien es cuidada—
  // y registrar la de dos terceros no son la misma facultad.
  const propia = datos.fromPersonId === actor.personId || datos.toPersonId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.relationship.manage_own' : 'membership.relationship.manage',
    { kind: 'CareRelationship' },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const [desde, hacia] = await Promise.all([
    db().person.findUnique({
      where: { id: datos.fromPersonId },
      select: { id: true, mergedIntoPersonId: true },
    }),
    db().person.findUnique({
      where: { id: datos.toPersonId },
      select: { id: true, mergedIntoPersonId: true },
    }),
  ]);
  if (desde === null || hacia === null) return fail(errors.notFound('persona inexistente'));
  if (desde.mergedIntoPersonId !== null || hacia.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Alguno de los dos registros quedó fusionado con otro. Usa los registros que se conservaron.',
        'persona fusionada en la relación',
      ),
    );
  }

  const opuesta = OPUESTA[datos.kind];
  if (opuesta !== undefined) {
    const contraria = await db().careRelationship.findFirst({
      where: {
        fromPersonId: datos.toPersonId,
        toPersonId: datos.fromPersonId,
        kind: opuesta,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (contraria !== null) {
      return fail(
        errors.conflict(
          'Ya existe la relación inversa entre esas dos personas: registrar esta dejaría a cada una siendo madre e hija de la otra.',
          'relación inversa viva',
        ),
      );
    }
  }

  const inicio = datos.startsAt === null ? new Date() : new Date(`${datos.startsAt}T00:00:00.000Z`);
  const fin = datos.endsAt === null ? null : new Date(`${datos.endsAt}T23:59:59.999Z`);
  if (fin !== null && fin <= inicio) {
    return fail(errors.validation({ endsAt: ['La vigencia no puede terminar antes de empezar.'] }));
  }

  const creada = await transaction(async (tx) => {
    const relacion = await tx.careRelationship.create({
      data: {
        fromPersonId: datos.fromPersonId,
        toPersonId: datos.toPersonId,
        kind: datos.kind,
        // El alcance se guarda como lista de módulos y no como texto libre:
        // «todo lo suyo» no se puede comprobar y «expedientes» no dice cuáles.
        scope: { modules: datos.scope },
        evidenceFileId: datos.evidenceFileId,
        startsAt: inicio,
        endsAt: fin,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CARE_RELATIONSHIP_REGISTERED,
      objectKind: 'CareRelationship',
      objectId: relacion.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: datos.toPersonId,
      metadata: {
        tipo: datos.kind,
        alcanceDeclarado: datos.scope,
        conEvidencia: datos.evidenceFileId !== null,
        propia,
      },
    });

    return relacion;
  });

  return ok({ relationshipId: creada.id });
}

export async function revokeCareRelationship(
  actor: ActorContext,
  input: RevokeCareRelationshipInput,
): Promise<UseCaseResult<{ relationshipId: string }>> {
  const parsed = revokeCareRelationshipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const relacion = await db().careRelationship.findUnique({
    where: { id: parsed.data.relationshipId },
    select: { id: true, fromPersonId: true, toPersonId: true, revokedAt: true, kind: true },
  });
  if (relacion === null) return fail(errors.notFound('relación inexistente'));

  const propia = relacion.fromPersonId === actor.personId || relacion.toPersonId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.relationship.manage_own' : 'membership.relationship.manage',
    { kind: 'CareRelationship', id: relacion.id },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (relacion.revokedAt !== null) {
    return fail(errors.conflict('Esa relación ya estaba revocada.', 'revocación repetida'));
  }

  await transaction(async (tx) => {
    const ahora = new Date();
    await tx.careRelationship.update({
      where: { id: relacion.id },
      data: {
        revokedAt: ahora,
        revokeReason: parsed.data.reason,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    // Los consentimientos que se apoyaban en esta relación caen con ella. Dejar
    // vivo un consentimiento otorgado en nombre de otra persona por una
    // representación que ya no existe es dejar abierta la puerta por la que se
    // entró, después de quitar la llave.
    const huerfanos = await tx.consent.updateMany({
      where: { representationRef: relacion.id, revokedAt: null },
      data: {
        revokedAt: ahora,
        revokeReason: `Revocada la relación que acreditaba la representación: ${parsed.data.reason}`,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CARE_RELATIONSHIP_REVOKED,
      objectKind: 'CareRelationship',
      objectId: relacion.id,
      outcome: 'SUCCESS',
      onBehalfOfPersonId: relacion.toPersonId,
      reason: parsed.data.reason,
      metadata: { tipo: relacion.kind, consentimientosRevocados: huerfanos.count },
    });
  });

  return ok({ relationshipId: relacion.id });
}

export interface CareRelationshipRow {
  readonly id: string;
  readonly kind: CareRelationshipKind;
  readonly fromPersonId: string;
  readonly fromPersonName: string;
  readonly toPersonId: string;
  readonly toPersonName: string;
  readonly declaredScope: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokeReason: string | null;
  readonly hasEvidence: boolean;
  readonly live: boolean;
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

const PERSONA = {
  select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true },
} as const;

function alcanceDeclarado(scope: unknown): string[] {
  if (scope === null || typeof scope !== 'object') return [];
  const modules = (scope as { modules?: unknown }).modules;
  return Array.isArray(modules) ? modules.filter((uno): uno is string => typeof uno === 'string') : [];
}

/** Relaciones de una persona, en los dos sentidos. */
export async function careRelationships(
  actor: ActorContext,
  input: { personId: string },
): Promise<UseCaseResult<CareRelationshipRow[]>> {
  const propia = input.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.relationship.read_own' : 'membership.relationship.read',
    { kind: 'CareRelationship', id: input.personId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().careRelationship.findMany({
    where: { OR: [{ fromPersonId: input.personId }, { toPersonId: input.personId }] },
    orderBy: [{ revokedAt: 'asc' }, { startsAt: 'desc' }],
    select: {
      id: true,
      kind: true,
      scope: true,
      startsAt: true,
      endsAt: true,
      revokedAt: true,
      revokeReason: true,
      evidenceFileId: true,
      fromPersonId: true,
      toPersonId: true,
      fromPerson: PERSONA,
      toPerson: PERSONA,
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      kind: fila.kind,
      fromPersonId: fila.fromPersonId,
      fromPersonName: nombre(fila.fromPerson),
      toPersonId: fila.toPersonId,
      toPersonName: nombre(fila.toPerson),
      declaredScope: alcanceDeclarado(fila.scope),
      startsAt: fila.startsAt,
      endsAt: fila.endsAt,
      revokedAt: fila.revokedAt,
      revokeReason: fila.revokeReason,
      hasEvidence: fila.evidenceFileId !== null,
      live: fila.revokedAt === null && fila.startsAt <= ahora && (fila.endsAt === null || fila.endsAt > ahora),
    })),
  );
}

export interface RelationshipReach {
  readonly relationshipId: string;
  readonly live: boolean;
  /** A dónde llegaría, según se declaró. */
  readonly declaredScope: readonly string[];
  /** A dónde llega de verdad hoy. Vacío mientras no haya consentimiento. */
  readonly effectiveScope: readonly string[];
  /** Por qué no llega, cuando no llega. */
  readonly blockedBecause: string | null;
}

/**
 * Qué alcanza una relación **de verdad**, hoy.
 *
 * Existe porque el PRD §3.5 dice que una relación familiar no otorga por sí sola
 * acceso a expedientes, y una promesa así no se sostiene con un comentario: se
 * sostiene con una consulta que cualquiera pueda hacer y que devuelva «nada»
 * cuando la respuesta es nada.
 */
export async function relationshipReach(
  actor: ActorContext,
  input: { relationshipId: string },
): Promise<UseCaseResult<RelationshipReach>> {
  const relacion = await db().careRelationship.findUnique({
    where: { id: input.relationshipId },
    select: {
      id: true,
      scope: true,
      startsAt: true,
      endsAt: true,
      revokedAt: true,
      fromPersonId: true,
      toPersonId: true,
    },
  });
  if (relacion === null) return fail(errors.notFound('relación inexistente'));

  const propia = relacion.fromPersonId === actor.personId || relacion.toPersonId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.relationship.read_own' : 'membership.relationship.read',
    { kind: 'CareRelationship', id: relacion.id },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const viva =
    relacion.revokedAt === null && relacion.startsAt <= ahora && (relacion.endsAt === null || relacion.endsAt > ahora);
  const declarado = alcanceDeclarado(relacion.scope);

  if (!viva) {
    return ok({
      relationshipId: relacion.id,
      live: false,
      declaredScope: declarado,
      effectiveScope: [],
      blockedBecause:
        relacion.revokedAt !== null
          ? 'La relación está revocada.'
          : relacion.startsAt > ahora
            ? 'La relación todavía no empieza.'
            : 'La relación ya venció.',
    });
  }

  // La representación autorizada es la única figura que puede consentir en
  // nombre de otra persona, y aun así necesita el consentimiento otorgado: el
  // propósito `MINOR_REPRESENTATION` es lo que convierte el alcance declarado en
  // alcance real.
  const consentida = await hasLiveConsent(relacion.toPersonId, 'MINOR_REPRESENTATION');

  return ok({
    relationshipId: relacion.id,
    live: true,
    declaredScope: declarado,
    effectiveScope: consentida ? declarado : [],
    blockedBecause: consentida
      ? null
      : 'La relación está vigente y no hay consentimiento otorgado: no alcanza ningún expediente.',
  });
}
