import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { ConsentPurpose } from '@prisma-client/enums';

/**
 * Consentimientos otorgados por una persona (PRD §7.3, §10.4).
 *
 * Cuatro reglas que gobiernan este archivo, y las cuatro salen del PRD:
 *
 *  1. **Ningún consentimiento genérico sustituye a uno específico.** Se otorga
 *     por propósito, y el propósito no se deduce.
 *  2. **Se otorga sobre un texto publicado**, nunca sobre un borrador ni sobre
 *     uno retirado: lo que se acepta tiene que poder recuperarse tal como se
 *     leyó.
 *  3. **Quien otorga puede no ser la titular.** Una madre consiente por su hija
 *     menor, y entonces hay que decir en qué relación se apoya: sin esa prueba,
 *     cualquiera podría consentir por cualquiera.
 *  4. **Revocar surte efecto hacia el futuro y no borra la evidencia** de lo ya
 *     consentido. Lo contrario dejaría a la organización sin poder demostrar
 *     que en su momento tuvo base para tratar un dato.
 */

const PROPOSITOS = [
  'MEMBERSHIP',
  'DIRECTORY_PUBLICATION',
  'CASE_PROCESSING',
  'INTER_ENTITY_REFERRAL',
  'CIAN_CARE',
  'CLINICAL_DATA_SHARING',
  'AI_ASSISTANCE',
  'TOOL_IDENTITY_EXCHANGE',
  'MARKETING_COMMUNICATIONS',
  'EVENT_PARTICIPATION',
  'MINOR_REPRESENTATION',
] as const;

export const grantConsentSchema = z.object({
  /** Persona sobre cuyos datos recae el consentimiento. */
  personId: z.uuid(),
  purpose: z.enum(PROPOSITOS, { error: () => 'Di para qué es este consentimiento.' }),
  consentVersionId: z.uuid({ error: () => 'Elige el texto que se acepta.' }),
  /**
   * Módulos, entidades, campos y archivos alcanzados.
   *
   * Se valida como JSON y no como `unknown`: lo que entra aquí va a una columna
   * `json` y tiene que poder serializarse. Aceptar `unknown` obligaría a un
   * casteo en el borde, que es la forma educada de decir «confío en que esto
   * sea lo que digo».
   */
  scope: z.record(z.string(), z.json()).default({}),
  /**
   * Relación de cuidado que acredita la representación, cuando quien otorga no
   * es la titular.
   */
  representationRef: z.uuid().nullable().default(null),
  expiresAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2027-01-01.' })
    .nullable()
    .default(null),
  /** Cómo se recabó: en pantalla, en papel firmado, por teléfono con testigo. */
  medium: z.enum(['SCREEN', 'SIGNED_PAPER', 'VERBAL_WITH_WITNESS'], {
    error: () => 'Di cómo se recabó el consentimiento.',
  }),
  mediumNote: z.string().trim().max(600).nullable().default(null),
});

export type GrantConsentInput = z.input<typeof grantConsentSchema>;

export const revokeConsentSchema = z.object({
  consentId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, { error: () => 'Escribe por qué se revoca. Con diez caracteres basta.' })
    .max(600),
});

export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export interface GrantedConsent {
  readonly consentId: string;
  readonly purpose: ConsentPurpose;
  readonly replacedConsentId: string | null;
}

export async function grantConsent(
  actor: ActorContext,
  input: GrantConsentInput,
): Promise<UseCaseResult<GrantedConsent>> {
  const parsed = grantConsentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;

  const version = await db().consentVersion.findUnique({
    where: { id: datos.consentVersionId },
    select: { id: true, code: true, version: true, status: true, legalEntityId: true, requiredFor: true },
  });
  if (version === null) return fail(errors.notFound('versión de consentimiento inexistente'));

  // Dos facultades, no una (defecto `D-F4-009`): decidir sobre lo propio y
  // registrar el sí de otra persona. Se resuelven las dos aquí porque más
  // abajo hace falta saber cuál de ellas sostiene el acto: quien solo tiene la
  // propia y no dice en qué relación se apoya no está ante una denegación, sino
  // ante un dato que le falta, y merece que se lo digan así.
  const recurso = { kind: 'Consent' as const, legalEntityId: version.legalEntityId };
  const institucional = can(actor, 'consent.grant', recurso);
  const propia = can(actor, 'consent.grant_own', recurso);
  if (!institucional.allowed && !propia.allowed) {
    return fail(errors.forbidden(explain(institucional.reason!)));
  }

  if (version.status !== 'PUBLISHED') {
    return fail(
      errors.ruleViolation(
        'Ese texto no está publicado, así que nadie puede aceptarlo todavía.',
        `versión en estado ${version.status}`,
      ),
    );
  }

  if (version.requiredFor.length > 0 && !version.requiredFor.includes(datos.purpose)) {
    return fail(
      errors.validation({
        consentVersionId: [
          'Ese texto no cubre este propósito. Un consentimiento genérico no sustituye a uno específico.',
        ],
      }),
    );
  }

  const [titular, quienOtorga] = await Promise.all([
    db().person.findUnique({ where: { id: datos.personId }, select: { id: true, mergedIntoPersonId: true } }),
    actor.personId === null
      ? Promise.resolve(null)
      : db().person.findUnique({ where: { id: actor.personId }, select: { id: true } }),
  ]);
  if (titular === null) return fail(errors.notFound('persona inexistente'));
  if (titular.mergedIntoPersonId !== null) {
    return fail(
      errors.ruleViolation(
        'Ese registro quedó fusionado con otro. Otorga el consentimiento sobre el registro que se conservó.',
        'la persona está fusionada',
      ),
    );
  }

  // Quien otorga es la propia persona, o alguien que puede acreditar por qué lo
  // hace en su nombre. No hay tercera vía: un consentimiento otorgado por quien
  // no puede explicar su legitimación no es un consentimiento.
  const propio = titular.id === actor.personId;
  // Quien consiente no es siempre quien teclea. La bitácora ya dice quién
  // registró el acto; esta columna dice de quién es el sí, que es la pregunta
  // que se hace cuando alguien reclama.
  let grantedById: string = titular.id;

  if (!propio) {
    if (datos.representationRef === null) {
      // Sin relación invocada, esto es la organización registrando el sí que
      // dio la propia persona —en papel, por teléfono con testigo, en el
      // mostrador—. Eso es una facultad institucional, no una decisión sobre lo
      // propio.
      if (!institucional.allowed) {
        return fail(
          errors.validation({
            representationRef: [
              'Para consentir en nombre de otra persona hace falta decir en qué relación te apoyas.',
            ],
          }),
        );
      }
    } else {
      const relacion = await db().careRelationship.findUnique({
        where: { id: datos.representationRef },
        select: { id: true, fromPersonId: true, toPersonId: true, revokedAt: true, endsAt: true },
      });
      if (relacion === null) return fail(errors.notFound('relación de cuidado inexistente'));

      const viva = relacion.revokedAt === null && (relacion.endsAt === null || relacion.endsAt > new Date());
      if (!viva) {
        return fail(
          errors.ruleViolation(
            'Esa relación ya no está vigente, así que no acredita la representación.',
            'relación revocada o vencida',
          ),
        );
      }
      if (relacion.toPersonId !== titular.id) {
        return fail(
          errors.ruleViolation(
            'Esa relación no es con la persona sobre la que quieres consentir.',
            'la relación no apunta a la persona titular',
          ),
        );
      }
      // La relación acredita a quien la encabeza, no a quien la invoca. Quien
      // registra el acto sin ser esa persona necesita la facultad institucional:
      // está anotando el sí de otra, y el sí sigue siendo de quien representa.
      const soyLaRepresentante = quienOtorga !== null && relacion.fromPersonId === quienOtorga.id;
      if (!soyLaRepresentante && !institucional.allowed) {
        return fail(
          errors.forbidden(
            'quien otorga no es la parte representante de la relación invocada',
            'Esa relación no te acredita a ti para consentir en su nombre.',
          ),
        );
      }
      grantedById = relacion.fromPersonId;
    }
  }

  if (propio && actor.personId === null) {
    return fail(errors.unauthenticated('Para otorgar un consentimiento necesitas haber iniciado sesión.'));
  }

  const expira =
    datos.expiresAt === null ? null : new Date(`${datos.expiresAt}T23:59:59.999Z`);
  if (expira !== null && expira <= new Date()) {
    return fail(errors.validation({ expiresAt: ['La vigencia no puede terminar en el pasado.'] }));
  }

  const otorgado = await transaction(async (tx) => {
    // Otorgar el mismo propósito otra vez revoca el anterior: dos
    // consentimientos vivos para lo mismo dejan sin respuesta la pregunta de
    // cuál alcance rige, y esa pregunta se hace cuando alguien reclama.
    const anterior = await tx.consent.findFirst({
      where: { personId: titular.id, purpose: datos.purpose, revokedAt: null },
      select: { id: true },
    });
    if (anterior !== null) {
      await tx.consent.update({
        where: { id: anterior.id },
        data: { revokedAt: new Date(), revokeReason: 'Sustituido por un consentimiento nuevo del mismo propósito.' },
      });
    }

    const creado = await tx.consent.create({
      data: {
        personId: titular.id,
        consentVersionId: version.id,
        purpose: datos.purpose,
        scope: datos.scope,
        grantedById,
        representationRef: datos.representationRef,
        expiresAt: expira,
        // Evidencia: qué texto exacto, en qué versión, cuándo y por qué medio.
        // Sin esto, «dijo que sí» es la palabra de la organización contra la de
        // la persona.
        evidence: {
          code: version.code,
          version: version.version,
          aceptadoEl: new Date().toISOString(),
          medio: datos.medium,
          nota: datos.mediumNote,
          otorgadoPor: grantedById === titular.id ? 'la propia persona' : 'representación acreditada',
          registradoPor: actor.personId ?? 'la organización',
        },
      },
      select: { id: true, purpose: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONSENT_GRANTED,
      objectKind: 'Consent',
      objectId: creado.id,
      outcome: 'SUCCESS',
      legalEntityId: version.legalEntityId,
      onBehalfOfPersonId: titular.id,
      metadata: {
        purpose: datos.purpose,
        texto: `${version.code} v${version.version}`,
        propio,
        sustituyeA: anterior?.id ?? null,
      },
    });

    return { creado, anteriorId: anterior?.id ?? null };
  });

  return ok({
    consentId: otorgado.creado.id,
    purpose: otorgado.creado.purpose,
    replacedConsentId: otorgado.anteriorId,
  });
}

export async function revokeConsent(
  actor: ActorContext,
  input: RevokeConsentInput,
): Promise<UseCaseResult<{ consentId: string }>> {
  const parsed = revokeConsentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const consentimiento = await db().consent.findUnique({
    where: { id: parsed.data.consentId },
    select: {
      id: true,
      personId: true,
      purpose: true,
      revokedAt: true,
      consentVersion: { select: { legalEntityId: true } },
      representation: { select: { fromPersonId: true, revokedAt: true, endsAt: true } },
    },
  });
  if (consentimiento === null) return fail(errors.notFound('consentimiento inexistente'));

  // Retirar lo propio es un derecho de la persona, no una concesión de la
  // organización (defecto `D-F4-009`). Quien dio el sí en representación
  // acreditada puede retirarlo mientras esa relación siga viva; cualquier otra
  // persona necesita la facultad institucional.
  const propio = consentimiento.personId === actor.personId;
  const representacion = consentimiento.representation;
  const representandoTodavia =
    representacion !== null &&
    actor.personId !== null &&
    representacion.fromPersonId === actor.personId &&
    representacion.revokedAt === null &&
    (representacion.endsAt === null || representacion.endsAt > new Date());

  const recurso = {
    kind: 'Consent' as const,
    id: consentimiento.id,
    legalEntityId: consentimiento.consentVersion.legalEntityId,
  };
  const institucional = can(actor, 'consent.revoke', recurso);
  const decision =
    propio || representandoTodavia ? can(actor, 'consent.revoke_own', recurso) : institucional;
  if (!decision.allowed && !institucional.allowed) {
    return fail(errors.forbidden(explain(decision.reason!)));
  }

  if (consentimiento.revokedAt !== null) {
    return fail(errors.conflict('Ese consentimiento ya estaba revocado.', 'revocación repetida'));
  }

  await transaction(async (tx) => {
    await tx.consent.update({
      where: { id: consentimiento.id },
      data: { revokedAt: new Date(), revokeReason: parsed.data.reason },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONSENT_REVOKED,
      objectKind: 'Consent',
      objectId: consentimiento.id,
      outcome: 'SUCCESS',
      legalEntityId: consentimiento.consentVersion.legalEntityId,
      onBehalfOfPersonId: consentimiento.personId,
      reason: parsed.data.reason,
      metadata: { purpose: consentimiento.purpose, propio },
    });
  });

  return ok({ consentId: consentimiento.id });
}

export interface ConsentRow {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly text: string;
  readonly grantedAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokeReason: string | null;
  readonly grantedByOwn: boolean;
  readonly live: boolean;
}

export interface ConsentOffer {
  readonly consentVersionId: string;
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly legalEntity: string;
  /** Propósitos que este texto cubre. Vacío = sirve para cualquiera. */
  readonly purposes: readonly ConsentPurpose[];
  readonly effectiveFrom: Date;
}

/**
 * Los textos que la persona **puede aceptar hoy**.
 *
 * Solo los publicados y en vigor: un borrador no se puede aceptar y uno
 * retirado tampoco (regla 2 del archivo). Y se devuelve el texto entero, no un
 * título con un enlace: lo que se acepta tiene que poder leerse antes de
 * aceptarlo y recuperarse después tal como se leyó.
 *
 * Exige `consent.read_own` porque es la antesala de otorgar: quien no puede
 * consentir sobre lo suyo tampoco necesita el catálogo.
 */
export async function publishedConsentTexts(actor: ActorContext): Promise<UseCaseResult<ConsentOffer[]>> {
  const recurso = { kind: 'ConsentVersion' as const };
  const propia = can(actor, 'consent.read_own', recurso);
  const institucional = can(actor, 'consent.read', recurso);
  if (!propia.allowed && !institucional.allowed) {
    return fail(errors.forbidden(explain(propia.reason!)));
  }

  const ahora = new Date();
  const filas = await db().consentVersion.findMany({
    where: {
      status: 'PUBLISHED',
      effectiveFrom: { lte: ahora },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: ahora } }],
    },
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      code: true,
      version: true,
      title: true,
      bodyMarkdown: true,
      requiredFor: true,
      effectiveFrom: true,
      legalEntity: { select: { shortName: true } },
    },
  });

  // De cada texto, solo la versión en vigor más reciente: ofrecer dos versiones
  // del mismo aviso obligaría a la persona a elegir entre dos cosas que no
  // puede distinguir.
  const porCodigo = new Map<string, (typeof filas)[number]>();
  for (const fila of filas) if (!porCodigo.has(fila.code)) porCodigo.set(fila.code, fila);

  return ok(
    [...porCodigo.values()].map((fila) => ({
      consentVersionId: fila.id,
      code: fila.code,
      version: fila.version,
      title: fila.title,
      bodyMarkdown: fila.bodyMarkdown,
      legalEntity: fila.legalEntity.shortName,
      purposes: fila.requiredFor,
      effectiveFrom: fila.effectiveFrom,
    })),
  );
}

/** Consentimientos de una persona, vivos y revocados. */
export async function personConsents(
  actor: ActorContext,
  input: { personId: string },
): Promise<UseCaseResult<ConsentRow[]>> {
  // Leer lo propio y leer lo ajeno son dos facultades distintas (defecto
  // `D-F4-019`). Con una sola, y como la persona llega por parámetro, cualquiera
  // que la tuviera podía pedir el historial de cualquier otra: para qué
  // autorizó el tratamiento de sus datos, cuándo lo retiró, con qué texto.
  //
  // Quien representa con una relación de cuidado viva también lee: si puede
  // otorgar y retirar en nombre de otra persona (ADR-0077), tiene que poder ver
  // qué hay otorgado, o estaría decidiendo a ciegas.
  const propio = input.personId === actor.personId;
  const representando =
    propio || actor.personId === null
      ? false
      : (await db().careRelationship.count({
          where: {
            fromPersonId: actor.personId,
            toPersonId: input.personId,
            revokedAt: null,
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
        })) > 0;

  const recurso = { kind: 'Consent' as const, id: input.personId };
  const institucional = can(actor, 'consent.read', recurso);
  const decision =
    propio || representando ? can(actor, 'consent.read_own', recurso) : institucional;
  if (!decision.allowed && !institucional.allowed) {
    return fail(errors.forbidden(explain(decision.reason!)));
  }

  const ahora = new Date();
  const filas = await db().consent.findMany({
    where: { personId: input.personId },
    orderBy: { grantedAt: 'desc' },
    select: {
      id: true,
      purpose: true,
      grantedAt: true,
      expiresAt: true,
      revokedAt: true,
      revokeReason: true,
      grantedById: true,
      personId: true,
      consentVersion: { select: { code: true, version: true, title: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      purpose: fila.purpose,
      text: `${fila.consentVersion.title} (${fila.consentVersion.code} v${fila.consentVersion.version})`,
      grantedAt: fila.grantedAt,
      expiresAt: fila.expiresAt,
      revokedAt: fila.revokedAt,
      revokeReason: fila.revokeReason,
      grantedByOwn: fila.grantedById === fila.personId,
      live: fila.revokedAt === null && (fila.expiresAt === null || fila.expiresAt > ahora),
    })),
  );
}

/**
 * ¿Hay consentimiento vigente de esta persona para este propósito?
 *
 * Es la comprobación que inyectan los casos de uso en la política. Vive aquí y
 * no en cada módulo porque «vigente» significa lo mismo en todos: otorgado, no
 * revocado y no vencido.
 */
export async function hasLiveConsent(
  personId: string,
  purpose: ConsentPurpose,
  tx?: Tx,
): Promise<boolean> {
  const cliente = tx ?? db();
  const encontrado = await cliente.consent.findFirst({
    where: {
      personId,
      purpose,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return encontrado !== null;
}
