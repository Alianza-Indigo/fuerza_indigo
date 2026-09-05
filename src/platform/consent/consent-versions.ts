import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { startOfDayInZone } from '@/platform/i18n/format';
import { entitiesFor, type EntityOption } from '@/platform/institution/entities';
import type { ConsentPurpose } from '@prisma-client/enums';

/**
 * Textos versionados de avisos y consentimientos (PRD §7.3, defecto `D-F4-001`).
 *
 * **El defecto que esto cierra.** La semilla deja los avisos en borrador a
 * propósito —publicarlos es un acto de la organización, no de una migración
 * (ADR-0045)— y no existía ninguna pantalla ni caso de uso capaz de publicarlos.
 * El formulario público de contacto exige un aviso publicado antes de recabar un
 * solo dato, de modo que en cualquier instalación real **fallaba siempre**, y
 * fallaba en silencio porque el acuse sale por la cola de trabajos. Solo las
 * pruebas de integración lo publicaban, con una escritura directa a la base.
 *
 * Dos reglas que no se negocian:
 *
 *  1. **Un texto publicado no se edita.** Lo que alguien aceptó tiene que poder
 *     recuperarse tal como lo leyó, aunque la organización cambie de opinión
 *     mañana. Corregir una coma obliga a una versión nueva, y eso es correcto:
 *     quien firmó la anterior firmó la anterior.
 *  2. **Retirar no borra.** Un aviso retirado deja de servir para consentir y
 *     sigue existiendo, porque los consentimientos que lo citan tienen que poder
 *     mostrarlo.
 */

const CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;

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

export const draftConsentVersionSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: PRIVACY_NOTICE_DIRECTORY.',
  }),
  legalEntityId: z.uuid({ error: () => 'Elige de qué entidad es este texto.' }),
  title: z.string().trim().min(5).max(200),
  bodyMarkdown: z
    .string()
    .trim()
    .min(200, { error: () => 'Un aviso de doscientos caracteres o menos no informa de nada.' })
    .max(60_000),
  /**
   * Versión en lenguaje claro, exigida por la accesibilidad cognitiva (PRD §5.3).
   *
   * No es un resumen para tener prisa: es el texto que muchas personas van a
   * leer de verdad. Por eso es obligatorio y no puede quedarse vacío.
   */
  plainLanguageSummary: z
    .string()
    .trim()
    .min(80, { error: () => 'Escribe el resumen en lenguaje claro. Es lo que la mayoría va a leer.' })
    .max(4000),
  requiredFor: z.array(z.enum(PROPOSITOS)).default([]),
});

export type DraftConsentVersionInput = z.input<typeof draftConsentVersionSchema>;

export const publishConsentVersionSchema = z.object({
  consentVersionId: z.uuid(),
  /** Desde cuándo rige. Es un hecho con fecha, no un valor por omisión. */
  effectiveFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-01-01.' }),
});

export type PublishConsentVersionInput = z.infer<typeof publishConsentVersionSchema>;

export const retireConsentVersionSchema = z.object({
  consentVersionId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(15, { error: () => 'Escribe por qué se retira este texto. Mínimo quince caracteres.' })
    .max(600),
});

export type RetireConsentVersionInput = z.infer<typeof retireConsentVersionSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function draftConsentVersion(
  actor: ActorContext,
  input: DraftConsentVersionInput,
): Promise<UseCaseResult<{ consentVersionId: string; code: string; version: number }>> {
  const parsed = draftConsentVersionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const datos = parsed.data;
  const decision = can(actor, 'consent.version.manage', {
    kind: 'ConsentVersion',
    legalEntityId: datos.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const creada = await transaction(async (tx) => {
    // `(code, version)` es único en toda la instalación, así que el siguiente
    // número se calcula bajo cerrojo: dos borradores del mismo aviso creados a
    // la vez pedirían el mismo número y uno de los dos moriría contra el índice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consent:${datos.code}`}))`;
    const ultima = await tx.consentVersion.findFirst({
      where: { code: datos.code },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = (ultima?.version ?? 0) + 1;
    const fila = await tx.consentVersion.create({
      data: {
        code: datos.code,
        version,
        legalEntityId: datos.legalEntityId,
        title: datos.title,
        bodyMarkdown: datos.bodyMarkdown,
        plainLanguageSummary: datos.plainLanguageSummary,
        requiredFor: datos.requiredFor,
        // Época cero mientras siga en borrador: la vigencia la pone quien
        // publica, y una fecha inventada aquí sería una vigencia inventada.
        effectiveFrom: new Date(0),
        status: 'DRAFT',
      },
      select: { id: true, code: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONSENT_VERSION_DRAFTED,
      objectKind: 'ConsentVersion',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: datos.legalEntityId,
      metadata: { code: fila.code, version: fila.version },
    });

    return fila;
  });

  return ok({ consentVersionId: creada.id, code: creada.code, version: creada.version });
}

/**
 * Publica una versión y retira la anterior del mismo código y entidad.
 *
 * Retirar la anterior en el mismo acto no es una comodidad: dos versiones
 * publicadas del mismo aviso dejarían sin respuesta la pregunta de cuál rige, y
 * esa pregunta se hace justo cuando alguien discute lo que aceptó.
 */
export async function publishConsentVersion(
  actor: ActorContext,
  input: PublishConsentVersionInput,
): Promise<UseCaseResult<{ consentVersionId: string; supersededId: string | null }>> {
  const parsed = publishConsentVersionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const version = await db().consentVersion.findUnique({
    where: { id: parsed.data.consentVersionId },
    select: { id: true, code: true, version: true, status: true, legalEntityId: true },
  });
  if (version === null) return fail(errors.notFound('versión de consentimiento inexistente'));

  const decision = can(actor, 'consent.version.manage', {
    kind: 'ConsentVersion',
    id: version.id,
    legalEntityId: version.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (version.status !== 'DRAFT') {
    return fail(
      errors.conflict(
        version.status === 'PUBLISHED' ? 'Ese texto ya está publicado.' : 'Ese texto está retirado y no se republica.',
        `estado ${version.status}`,
      ),
    );
  }

  const desde = startOfDayInZone(parsed.data.effectiveFrom, actor.timeZone);
  if (desde === null) {
    return fail(errors.validation({ effectiveFrom: ['Revisa la fecha: va como 2026-01-01.'] }));
  }

  const resultado = await transaction(async (tx) => {
    const anterior = await tx.consentVersion.findFirst({
      where: { code: version.code, legalEntityId: version.legalEntityId, status: 'PUBLISHED' },
      select: { id: true },
    });

    if (anterior !== null) {
      await tx.consentVersion.update({
        where: { id: anterior.id },
        data: { status: 'RETIRED', effectiveTo: desde },
      });
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.CONSENT_VERSION_RETIRED,
        objectKind: 'ConsentVersion',
        objectId: anterior.id,
        outcome: 'SUCCESS',
        legalEntityId: version.legalEntityId,
        reason: `Sustituida por la versión ${version.version} de ${version.code}`,
      });
    }

    await tx.consentVersion.update({
      where: { id: version.id },
      data: { status: 'PUBLISHED', effectiveFrom: desde },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONSENT_VERSION_PUBLISHED,
      objectKind: 'ConsentVersion',
      objectId: version.id,
      outcome: 'SUCCESS',
      legalEntityId: version.legalEntityId,
      metadata: { code: version.code, version: version.version, sustituyeA: anterior?.id ?? null },
    });

    return anterior?.id ?? null;
  });

  return ok({ consentVersionId: version.id, supersededId: resultado });
}

/**
 * Retira un texto publicado sin sustituirlo.
 *
 * Deja de servir para consentir y no desaparece: los consentimientos que lo
 * citan tienen que poder mostrar lo que se aceptó.
 */
export async function retireConsentVersion(
  actor: ActorContext,
  input: RetireConsentVersionInput,
): Promise<UseCaseResult<{ consentVersionId: string }>> {
  const parsed = retireConsentVersionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const version = await db().consentVersion.findUnique({
    where: { id: parsed.data.consentVersionId },
    select: { id: true, status: true, legalEntityId: true, code: true },
  });
  if (version === null) return fail(errors.notFound('versión de consentimiento inexistente'));

  const decision = can(actor, 'consent.version.manage', {
    kind: 'ConsentVersion',
    id: version.id,
    legalEntityId: version.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (version.status !== 'PUBLISHED') {
    return fail(errors.conflict('Solo se retira lo que está publicado.', `estado ${version.status}`));
  }

  await transaction(async (tx) => {
    await tx.consentVersion.update({
      where: { id: version.id },
      data: { status: 'RETIRED', effectiveTo: new Date() },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONSENT_VERSION_RETIRED,
      objectKind: 'ConsentVersion',
      objectId: version.id,
      outcome: 'SUCCESS',
      legalEntityId: version.legalEntityId,
      reason: parsed.data.reason,
    });
  });

  return ok({ consentVersionId: version.id });
}

export interface ConsentVersionRow {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly title: string;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  readonly legalEntity: string;
  readonly legalEntityId: string;
  readonly requiredFor: readonly ConsentPurpose[];
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly plainLanguageSummary: string;
  readonly bodyMarkdown: string;
  readonly grantedConsents: number;
}

export async function consentVersionList(actor: ActorContext): Promise<UseCaseResult<ConsentVersionRow[]>> {
  const decision = can(actor, 'consent.version.manage', { kind: 'ConsentVersion' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().consentVersion.findMany({
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      code: true,
      version: true,
      title: true,
      status: true,
      legalEntityId: true,
      requiredFor: true,
      effectiveFrom: true,
      effectiveTo: true,
      plainLanguageSummary: true,
      bodyMarkdown: true,
      legalEntity: { select: { shortName: true } },
      _count: { select: { consents: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      version: fila.version,
      title: fila.title,
      status: fila.status,
      legalEntity: fila.legalEntity.shortName,
      legalEntityId: fila.legalEntityId,
      requiredFor: fila.requiredFor,
      effectiveFrom: fila.effectiveFrom,
      effectiveTo: fila.effectiveTo,
      plainLanguageSummary: fila.plainLanguageSummary,
      bodyMarkdown: fila.bodyMarkdown,
      grantedConsents: fila._count.consents,
    })),
  );
}

/** Entidades donde este actor puede administrar textos de consentimiento. */
export async function consentEntityOptions(actor: ActorContext): Promise<UseCaseResult<EntityOption[]>> {
  const decision = can(actor, 'consent.version.manage', { kind: 'ConsentVersion' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  return ok(await entitiesFor(actor, 'consent.version.manage', 'ConsentVersion'));
}
