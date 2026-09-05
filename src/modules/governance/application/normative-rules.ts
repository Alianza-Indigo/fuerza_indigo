import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { NormativeRuleStatus } from '@prisma-client/enums';
import {
  CLAVES_DE_REGLA,
  NOMBRE_DE_REGLA,
  normativeRulesSchema,
  type NormativeRules,
} from '../domain/normative-rules';

export {
  CLAVES_DE_REGLA,
  FORMA_DE_REGLA,
  MAYORIAS,
  NOMBRE_DE_MAYORIA,
  NOMBRE_DE_QUORUM,
  NOMBRE_DE_REGLA,
  QUORUMS,
  normativeRulesSchema,
  type FormaDeRegla,
  type MajorityRule,
  type NormativeRules,
  type QuorumRule,
} from '../domain/normative-rules';

/**
 * Reglas estatutarias versionadas (PRD §9.3, §9.4; F5-GOB-003).
 *
 * **Una versión en vigor no se edita.** Se redacta una versión nueva y se pone
 * en vigor; la anterior queda superada, con su fecha de cierre. Editar en sitio
 * cambiaría, con efecto retroactivo, el quórum con el que se instaló una
 * asamblea celebrada el año pasado y la mayoría con la que se aprobó un acuerdo
 * que ya se ejecutó. Por eso cada acto institucional guarda **el identificador
 * de la versión con la que se ejecutó**, no una copia de sus números: la versión
 * es inmutable, así que apuntar a ella basta y no se puede desmentir.
 *
 * **Redactar y poner en vigor son dos actos.** El borrador se propone, se
 * corrige y se descarta sin consecuencias (`governance.rules.manage`). Ponerlo
 * en vigor obliga a todo el gremio, exige la resolución de asamblea que lo
 * aprobó y un permiso distinto (`institution.normative_rules.manage`).
 *
 * **Ningún valor se inventa.** El esquema de abajo exige todos los umbrales que
 * la plataforma usa para decidir algo. Mientras el estatuto no los aporte, la
 * versión se queda en borrador y la ausencia consta: es preferible una
 * plataforma que dice «falta el plazo de convocatoria» a una que convoca con un
 * plazo que nadie acordó.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

const VERSION = /^\d{4}\.\d{1,3}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reglas de una versión concreta, ya validadas.
 *
 * Devuelve `null` cuando la versión existe pero sus reglas están incompletas,
 * que solo puede pasar en un borrador: una versión en vigor no llega a serlo
 * sin pasar por el esquema. Quien la consulta sabe entonces que no puede
 * decidir con ella, en vez de leer un valor ausente como cero.
 */
export function leerReglas(rules: unknown): NormativeRules | null {
  const parsed = normativeRulesSchema.safeParse(rules);
  return parsed.success ? parsed.data : null;
}

export interface RuleSetRow {
  readonly id: string;
  readonly version: string;
  readonly status: NormativeRuleStatus;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
  readonly complete: boolean;
  readonly missing: readonly string[];
  readonly rules: Partial<Record<keyof NormativeRules, unknown>>;
  readonly approvedByResolution: string | null;
}

/** Umbrales que faltan para que una versión pueda entrar en vigor. */
export function reglasFaltantes(rules: unknown): readonly string[] {
  const parsed = normativeRulesSchema.safeParse(rules);
  if (parsed.success) return [];
  const claves = new Set<string>();
  for (const issue of parsed.error.issues) {
    const clave = issue.path[0];
    if (typeof clave === 'string') claves.add(NOMBRE_DE_REGLA[clave as keyof NormativeRules] ?? clave);
  }
  return [...claves];
}

function comoObjeto(rules: unknown): Partial<Record<keyof NormativeRules, unknown>> {
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) return {};
  const entrada = rules as Record<string, unknown>;
  const salida: Partial<Record<keyof NormativeRules, unknown>> = {};
  for (const clave of CLAVES_DE_REGLA) {
    if (clave in entrada) salida[clave] = entrada[clave];
  }
  return salida;
}

export async function ruleSetList(actor: ActorContext): Promise<UseCaseResult<readonly RuleSetRow[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'NormativeRuleSet' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().normativeRuleSet.findMany({
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    select: {
      id: true,
      version: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
      rules: true,
      approvedByResolution: { select: { number: true, publicId: true } },
    },
  });

  return ok(
    filas.map((fila) => {
      const faltantes = reglasFaltantes(fila.rules);
      return {
        id: fila.id,
        version: fila.version,
        status: fila.status,
        effectiveFrom: fila.effectiveFrom,
        effectiveTo: fila.effectiveTo,
        complete: faltantes.length === 0,
        missing: faltantes,
        rules: comoObjeto(fila.rules),
        approvedByResolution:
          fila.approvedByResolution === null
            ? null
            : (fila.approvedByResolution.number ?? fila.approvedByResolution.publicId),
      };
    }),
  );
}

export const draftRuleSetSchema = z.object({
  version: z.string().trim().regex(VERSION, { error: () => 'La versión va como 2026.2: año, punto y número.' }),
  reason: z.string().trim().min(10).max(2000),
  /** Se admite una versión incompleta: para eso es un borrador. */
  rules: normativeRulesSchema.partial(),
});

export type DraftRuleSetInput = z.infer<typeof draftRuleSetSchema>;

export async function draftRuleSet(
  actor: ActorContext,
  input: DraftRuleSetInput,
): Promise<UseCaseResult<{ ruleSetId: string; missing: readonly string[] }>> {
  const parsed = draftRuleSetSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'governance.rules.manage', { kind: 'NormativeRuleSet' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const duplicada = await db().normativeRuleSet.findUnique({ where: { version: data.version }, select: { id: true } });
  if (duplicada !== null) return fail(errors.conflict(`La versión ${data.version} ya existe.`));

  const creada = await transaction(async (tx) => {
    const fila = await tx.normativeRuleSet.create({
      data: {
        version: data.version,
        status: 'DRAFT',
        effectiveFrom: null,
        rules: data.rules,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NORMATIVE_RULES_DRAFTED,
      objectKind: 'NormativeRuleSet',
      objectId: fila.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: { version: data.version },
    });

    return fila;
  });

  return ok({ ruleSetId: creada.id, missing: reglasFaltantes(data.rules) });
}

export const editRuleDraftSchema = z.object({
  ruleSetId: z.uuid(),
  reason: z.string().trim().min(10).max(2000),
  rules: normativeRulesSchema.partial(),
});

export type EditRuleDraftInput = z.infer<typeof editRuleDraftSchema>;

export async function editRuleDraft(
  actor: ActorContext,
  input: EditRuleDraftInput,
): Promise<UseCaseResult<{ missing: readonly string[] }>> {
  const parsed = editRuleDraftSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'governance.rules.manage', { kind: 'NormativeRuleSet' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const version = await db().normativeRuleSet.findUnique({
    where: { id: data.ruleSetId },
    select: { id: true, version: true, status: true },
  });
  if (version === null) return fail(errors.notFound('Esa versión de reglas no existe.'));
  if (version.status !== 'DRAFT') {
    return fail(
      errors.conflict(
        'Una versión en vigor o superada no se edita: se redacta una versión nueva. Cambiarla aquí modificaría con efecto retroactivo el quórum de asambleas ya celebradas.',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.normativeRuleSet.update({
      where: { id: version.id },
      data: { rules: data.rules, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NORMATIVE_RULES_DRAFTED,
      objectKind: 'NormativeRuleSet',
      objectId: version.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: { version: version.version, edicion: true },
    });
  });

  return ok({ missing: reglasFaltantes(data.rules) });
}

export const putRulesInForceSchema = z.object({
  ruleSetId: z.uuid(),
  effectiveFrom: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  approvedByResolutionId: z.uuid({ error: () => 'Elige la resolución de asamblea que aprobó la reforma.' }),
  reason: z.string().trim().min(10).max(2000),
});

export type PutRulesInForceInput = z.infer<typeof putRulesInForceSchema>;

/**
 * Poner una versión en vigor.
 *
 * Cierra la anterior el día previo a la entrada en vigor de esta, para que no
 * haya un día con dos versiones vigentes ni un día sin ninguna. Todo ocurre en
 * una transacción: o el relevo es completo, o no se movió nada.
 */
export async function putRulesInForce(
  actor: ActorContext,
  input: PutRulesInForceInput,
): Promise<UseCaseResult<{ version: string; supersededVersion: string | null }>> {
  const parsed = putRulesInForceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'institution.normative_rules.manage', { kind: 'NormativeRuleSet' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const version = await db().normativeRuleSet.findUnique({
    where: { id: data.ruleSetId },
    select: { id: true, version: true, status: true, rules: true },
  });
  if (version === null) return fail(errors.notFound('Esa versión de reglas no existe.'));
  if (version.status !== 'DRAFT') {
    return fail(errors.conflict(`La versión ${version.version} ya no es un borrador.`));
  }

  const faltantes = reglasFaltantes(version.rules);
  if (faltantes.length > 0) {
    return fail(
      errors.conflict(
        `Faltan umbrales que la plataforma necesita para decidir: ${faltantes.join('; ')}. Complétalos antes de poner la versión en vigor.`,
      ),
    );
  }

  const acuerdo = await db().resolution.findUnique({
    where: { id: data.approvedByResolutionId },
    select: { id: true, outcome: true, number: true },
  });
  if (acuerdo === null) return fail(errors.notFound('La resolución que aprobó la reforma no existe.'));
  if (acuerdo.outcome !== 'APPROVED') {
    return fail(errors.conflict('Esa resolución no fue aprobada. Una reforma entra en vigor por acuerdo aprobado.'));
  }

  const desde = new Date(`${data.effectiveFrom}T00:00:00.000Z`);
  const vigente = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true, effectiveFrom: true },
  });

  if (vigente !== null && vigente.effectiveFrom !== null && desde <= vigente.effectiveFrom) {
    return fail(
      errors.conflict(
        `La versión ${vigente.version} rige desde el ${vigente.effectiveFrom.toISOString().slice(0, 10)}. La nueva no puede empezar antes ni el mismo día.`,
      ),
    );
  }

  const vispera = new Date(desde.getTime() - 24 * 60 * 60 * 1000);

  await transaction(async (tx) => {
    if (vigente !== null) {
      await tx.normativeRuleSet.update({
        where: { id: vigente.id },
        data: { status: 'SUPERSEDED', effectiveTo: vispera, updatedByActorId: actor.actorId },
      });
    }

    await tx.normativeRuleSet.update({
      where: { id: version.id },
      data: {
        status: 'IN_FORCE',
        effectiveFrom: desde,
        effectiveTo: null,
        approvedByResolutionId: acuerdo.id,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NORMATIVE_RULES_PUBLISHED,
      objectKind: 'NormativeRuleSet',
      objectId: version.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: {
        version: version.version,
        desde: data.effectiveFrom,
        supera: vigente?.version ?? null,
        acuerdo: acuerdo.number ?? acuerdo.id,
      },
    });
  });

  return ok({ version: version.version, supersededVersion: vigente?.version ?? null });
}
