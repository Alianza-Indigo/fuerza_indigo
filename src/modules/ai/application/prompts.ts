import { z } from 'zod';
import type { Prisma } from '@prisma-client/client';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Administración de prompts (PRD §15.3, §24 Fase 8).
 *
 * Ningún prompt vive en el código. Aquí se crean, se versionan, se prueban en el
 * laboratorio y se publican. Tres reglas gobiernan este archivo, y las tres las
 * sostiene la base además de este código:
 *
 *  1. **Una versión no se reescribe: corregir es una versión nueva.** Los
 *     privilegios de columna retiran el `UPDATE` sobre el texto, el modelo y el
 *     esquema de una versión. El historial de lo que se le pidió a un modelo
 *     sobre gente real es parte del expediente, y una edición silenciosa lo
 *     borraría. Por eso `saveDraftVersion` **crea** una versión, nunca la pisa.
 *  2. **Quien redacta no publica.** `ai.prompt.edit` redacta y prueba;
 *     `ai.prompt.publish` publica. La base exige además que el revisor no sea el
 *     autor (ADR-0133): con una sola persona en ambos papeles, la revisión sería
 *     un trámite.
 *  3. **Nada se pierde.** Revertir copia una versión antigua en una nueva, con el
 *     rastro de cuál fue el origen; no restaura sobrescribiendo.
 */

/* -------------------------------------------------------------------------- */
/* Validación del contenido de una versión                                    */
/* -------------------------------------------------------------------------- */

const nombreDeVariable = z
  .string()
  .trim()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, { error: () => 'Una variable lleva letras, números y guion bajo, y empieza por letra.' });

const contenidoDeVersion = z.object({
  systemText: z.string().trim().min(1, { error: () => 'Escribe el texto de sistema del prompt.' }),
  allowedVariables: z.array(nombreDeVariable).max(40).default([]),
  model: z.string().trim().min(1, { error: () => 'Indica el modelo.' }),
  parameters: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  limits: z.record(z.string(), z.unknown()).default({}),
});

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Solo los modelos que el proveedor permite. Sin proveedor configurado, ninguno. */
async function modeloPermitido(model: string): Promise<boolean> {
  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { allowedModels: true },
  });
  return config !== null && config.allowedModels.includes(model);
}

const RECURSO = { kind: 'AiPrompt' as const, legalEntityId: null };

/* -------------------------------------------------------------------------- */
/* Crear un prompt con su primera versión                                     */
/* -------------------------------------------------------------------------- */

export const createPromptSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, {
        error: () => 'El código lleva minúsculas, números y separadores . _ -. Por ejemplo: support.triage.',
      }),
    purpose: z.string().trim().min(10).max(300, {
      error: () => 'Describe para qué sirve el prompt: hasta 300 caracteres.',
    }),
    module: z.string().trim().min(2).max(40),
    criticality: z.enum(['STANDARD', 'CRITICAL']).default('STANDARD'),
  })
  .and(contenidoDeVersion);

// El tipo de **entrada**: los campos con valor por omisión (criticalidad,
// variables, parámetros) son opcionales para quien llama; el `safeParse` los
// rellena antes de usarlos.
export type CreatePromptInput = z.input<typeof createPromptSchema>;

export async function createPrompt(
  actor: ActorContext,
  input: CreatePromptInput,
): Promise<UseCaseResult<{ promptId: string; versionId: string }>> {
  const parsed = createPromptSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'ai.prompt.edit', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const authorId = actor.userId;
  if (authorId === null) {
    return fail(errors.ruleViolation('Un prompt debe tener autoría identificada.', 'el actor no tiene cuenta (ADR-0042)'));
  }

  if (!(await modeloPermitido(data.model))) {
    return fail(
      errors.ruleViolation(
        'Ese modelo no está entre los permitidos por el proveedor. Elige uno de la configuración.',
        'modelo fuera de allowedModels',
      ),
    );
  }

  const existente = await db().aiPrompt.findUnique({ where: { code: data.code }, select: { id: true } });
  if (existente !== null) {
    return fail(errors.conflict('Ya existe un prompt con ese código. Elige otro o edita el que ya está.', 'código ocupado'));
  }

  const resultado = await transaction(async (tx) => {
    const prompt = await tx.aiPrompt.create({
      data: {
        code: data.code,
        purpose: data.purpose,
        module: data.module,
        criticality: data.criticality,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const version = await tx.aiPromptVersion.create({
      data: {
        promptId: prompt.id,
        version: 1,
        systemText: data.systemText,
        allowedVariables: data.allowedVariables,
        model: data.model,
        parameters: data.parameters as Prisma.InputJsonValue,
        outputSchema: data.outputSchema as Prisma.InputJsonValue,
        limits: data.limits as Prisma.InputJsonValue,
        status: 'DRAFT',
        authorId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_PROMPT_CREATED,
      objectKind: 'AiPrompt',
      objectId: prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: data.code, module: data.module, criticality: data.criticality },
    });

    return { promptId: prompt.id, versionId: version.id };
  });

  return ok(resultado);
}

/* -------------------------------------------------------------------------- */
/* Guardar una versión nueva (corregir es una versión nueva)                  */
/* -------------------------------------------------------------------------- */

export const saveDraftSchema = z.object({ promptId: z.uuid() }).and(contenidoDeVersion);

export async function saveDraftVersion(
  actor: ActorContext,
  input: z.infer<typeof saveDraftSchema>,
): Promise<UseCaseResult<{ versionId: string; version: number }>> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const prompt = await db().aiPrompt.findUnique({ where: { id: data.promptId }, select: { id: true, code: true, isActive: true } });
  if (prompt === null) return fail(errors.notFound('el prompt no existe'));

  const decision = can(actor, 'ai.prompt.edit', { ...RECURSO, id: prompt.id });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const authorId = actor.userId;
  if (authorId === null) return fail(errors.ruleViolation('Un prompt debe tener autoría identificada.'));

  if (!(await modeloPermitido(data.model))) {
    return fail(errors.ruleViolation('Ese modelo no está entre los permitidos por el proveedor.', 'modelo fuera de allowedModels'));
  }

  const resultado = await transaction(async (tx) => {
    const ultima = await tx.aiPromptVersion.findFirst({
      where: { promptId: prompt.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const creada = await tx.aiPromptVersion.create({
      data: {
        promptId: prompt.id,
        version: (ultima?.version ?? 0) + 1,
        systemText: data.systemText,
        allowedVariables: data.allowedVariables,
        model: data.model,
        parameters: data.parameters as Prisma.InputJsonValue,
        outputSchema: data.outputSchema as Prisma.InputJsonValue,
        limits: data.limits as Prisma.InputJsonValue,
        status: 'DRAFT',
        authorId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_PROMPT_DRAFTED,
      objectKind: 'AiPrompt',
      objectId: prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: prompt.code, version: creada.version },
    });

    return { versionId: creada.id, version: creada.version };
  });

  return ok(resultado);
}

/* -------------------------------------------------------------------------- */
/* Publicar una versión (revisada por otra persona)                           */
/* -------------------------------------------------------------------------- */

export const publishVersionSchema = z.object({
  versionId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué se publica: al menos diez caracteres.' }),
});

/**
 * Publica una versión. Quien publica queda como revisor, y la base rechaza que
 * sea el autor: es lo que hace real la revisión (ADR-0133). La versión que estaba
 * vigente se retira, y el prompt pasa a apuntar a la nueva.
 */
export async function publishVersion(
  actor: ActorContext,
  input: z.infer<typeof publishVersionSchema>,
): Promise<UseCaseResult<{ version: number }>> {
  const parsed = publishVersionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto: ActorContext = { ...actor, reason: parsed.data.reason };
  const version = await db().aiPromptVersion.findUnique({
    where: { id: parsed.data.versionId },
    select: {
      id: true,
      version: true,
      status: true,
      authorId: true,
      prompt: { select: { id: true, code: true, isActive: true, currentVersionId: true } },
    },
  });
  if (version === null) return fail(errors.notFound('la versión no existe'));

  const decision = can(contexto, 'ai.prompt.publish', { ...RECURSO, id: version.prompt.id });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const reviewerId = actor.userId;
  if (reviewerId === null) return fail(errors.ruleViolation('Publicar exige una persona identificada como revisora.'));

  // Quien redactó la versión no la publica. La base lo rechazaría igualmente;
  // se comprueba aquí para dar un mensaje claro en vez de un error de restricción.
  if (version.authorId === reviewerId) {
    return fail(
      errors.ruleViolation(
        'No puedes publicar una versión que tú misma o tú mismo redactaste. Pídelo a quien tiene la facultad de publicar.',
        'autorrevisión',
      ),
    );
  }

  if (version.status === 'PUBLISHED') return ok({ version: version.version });
  if (version.status === 'RETIRED') {
    return fail(errors.ruleViolation('Esa versión está retirada. Reviértela para volver a trabajarla.', 'publicar una versión retirada'));
  }

  await transaction(async (tx) => {
    const ahora = new Date();

    // Se retira la vigente, si la hay y es otra.
    if (version.prompt.currentVersionId !== null && version.prompt.currentVersionId !== version.id) {
      await tx.aiPromptVersion.update({
        where: { id: version.prompt.currentVersionId },
        data: { status: 'RETIRED', retiredAt: ahora, updatedByActorId: actor.actorId },
      });
    }

    await tx.aiPromptVersion.update({
      where: { id: version.id },
      data: {
        status: 'PUBLISHED',
        reviewerId,
        reviewedAt: ahora,
        publishedAt: ahora,
        updatedByActorId: actor.actorId,
      },
    });

    await tx.aiPrompt.update({
      where: { id: version.prompt.id },
      data: { currentVersionId: version.id, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.AI_PROMPT_PUBLISHED,
      objectKind: 'AiPrompt',
      objectId: version.prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      reason: parsed.data.reason,
      metadata: { code: version.prompt.code, version: version.version },
    });
  });

  return ok({ version: version.version });
}

/* -------------------------------------------------------------------------- */
/* Retirar el prompt (deja de ejecutarse; cae al camino humano)               */
/* -------------------------------------------------------------------------- */

export const retirePromptSchema = z.object({
  promptId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué se retira: al menos diez caracteres.' }),
});

export async function retirePrompt(
  actor: ActorContext,
  input: z.infer<typeof retirePromptSchema>,
): Promise<UseCaseResult<{ retired: boolean }>> {
  const parsed = retirePromptSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto: ActorContext = { ...actor, reason: parsed.data.reason };
  const prompt = await db().aiPrompt.findUnique({
    where: { id: parsed.data.promptId },
    select: { id: true, code: true, currentVersionId: true },
  });
  if (prompt === null) return fail(errors.notFound('el prompt no existe'));

  const decision = can(contexto, 'ai.prompt.publish', { ...RECURSO, id: prompt.id });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (prompt.currentVersionId === null) {
    return fail(errors.ruleViolation('Este prompt no tiene ninguna versión publicada que retirar.', 'sin versión vigente'));
  }

  await transaction(async (tx) => {
    await tx.aiPromptVersion.update({
      where: { id: prompt.currentVersionId! },
      data: { status: 'RETIRED', retiredAt: new Date(), updatedByActorId: actor.actorId },
    });
    // Sin versión vigente, el prompt no se ejecuta: los flujos asistidos que lo
    // usaban caen al camino humano, que es lo correcto.
    await tx.aiPrompt.update({
      where: { id: prompt.id },
      data: { currentVersionId: null, updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.AI_PROMPT_RETIRED,
      objectKind: 'AiPrompt',
      objectId: prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      reason: parsed.data.reason,
      metadata: { code: prompt.code },
    });
  });

  return ok({ retired: true });
}

/* -------------------------------------------------------------------------- */
/* Revertir a una versión anterior (creando una nueva)                        */
/* -------------------------------------------------------------------------- */

export const revertSchema = z.object({
  promptId: z.uuid(),
  versionId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué se revierte: al menos diez caracteres.' }),
});

/**
 * Revierte a una versión anterior **creando una nueva** en borrador, con el
 * rastro de cuál fue su origen. No se publica sola: revertir crea el borrador, y
 * publicarlo es otro acto, de otra persona.
 */
export async function revertToVersion(
  actor: ActorContext,
  input: z.infer<typeof revertSchema>,
): Promise<UseCaseResult<{ versionId: string; version: number }>> {
  const parsed = revertSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto: ActorContext = { ...actor, reason: parsed.data.reason };
  const prompt = await db().aiPrompt.findUnique({ where: { id: parsed.data.promptId }, select: { id: true, code: true } });
  if (prompt === null) return fail(errors.notFound('el prompt no existe'));

  const decision = can(contexto, 'ai.prompt.edit', { ...RECURSO, id: prompt.id });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const authorId = actor.userId;
  if (authorId === null) return fail(errors.ruleViolation('Una reversión debe tener autoría identificada.'));

  const origen = await db().aiPromptVersion.findUnique({
    where: { id: parsed.data.versionId },
    select: {
      id: true,
      promptId: true,
      version: true,
      systemText: true,
      allowedVariables: true,
      model: true,
      parameters: true,
      outputSchema: true,
      limits: true,
    },
  });
  if (origen === null || origen.promptId !== prompt.id) {
    return fail(errors.notFound('esa versión no pertenece a este prompt'));
  }

  const resultado = await transaction(async (tx) => {
    const ultima = await tx.aiPromptVersion.findFirst({
      where: { promptId: prompt.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const creada = await tx.aiPromptVersion.create({
      data: {
        promptId: prompt.id,
        version: (ultima?.version ?? 0) + 1,
        systemText: origen.systemText,
        allowedVariables: origen.allowedVariables,
        model: origen.model,
        parameters: (origen.parameters ?? {}),
        outputSchema: (origen.outputSchema ?? {}),
        limits: (origen.limits ?? {}),
        status: 'DRAFT',
        revertedFromVersionId: origen.id,
        authorId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.AI_PROMPT_REVERTED,
      objectKind: 'AiPrompt',
      objectId: prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      reason: parsed.data.reason,
      metadata: { code: prompt.code, desde: origen.version, hacia: creada.version },
    });

    return { versionId: creada.id, version: creada.version };
  });

  return ok(resultado);
}
