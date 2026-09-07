import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { runLabGeneration, type RunGenerationResult } from '@/platform/ai';

/**
 * El laboratorio de prompts (PRD §15.3, ADR-0140).
 *
 * Probar un borrador contra el modelo antes de publicarlo es lo que hace que
 * publicar sea responsable, y por eso probar cae del lado de redactar: lo hace
 * quien tiene `ai.prompt.edit`, no una facultad aparte (ADR-0133). Una prueba de
 * laboratorio pasa por las mismas defensas que una ejecución de producción
 * —límites, degradación y bitácora—: cuesta, se registra y respeta el techo. Lo
 * único distinto es que ejecuta una versión sin publicar, y esa puerta la abre
 * solo este caso de uso.
 */

const PURPOSES = [
  'INITIAL_GUIDANCE',
  'PROCEDURE_EXPLANATION',
  'REQUEST_CLASSIFICATION',
  'SUMMARY',
  'DRAFTING_ASSISTANCE',
  'STRUCTURED_EXTRACTION',
  'DELEGATE_REPORT',
  'SEMANTIC_SEARCH',
  'TRANSLATION',
] as const;

export const labRunSchema = z.object({
  promptVersionId: z.uuid(),
  purpose: z.enum(PURPOSES),
  userText: z.string().trim().min(1, { error: () => 'Escribe el texto de entrada con el que quieres probar el prompt.' }),
});

export interface LabRunOutcome {
  readonly result: RunGenerationResult;
  /** El estado de la versión tras la prueba: pasa a «en prueba» si estaba en borrador. */
  readonly versionStatus: 'DRAFT' | 'TESTING';
}

/**
 * Ejecuta una versión en el laboratorio y, si el proveedor respondió, la marca
 * como «en prueba». No lanza por un resultado de operación: devuelve el resultado
 * de la ejecución —éxito, rechazo de esquema, degradación o corte por límite—
 * para que la interfaz lo enseñe tal cual, siempre marcado como generado por IA.
 */
export async function labRun(
  actor: ActorContext,
  input: z.infer<typeof labRunSchema>,
): Promise<UseCaseResult<LabRunOutcome>> {
  const parsed = labRunSchema.safeParse(input);
  if (!parsed.success) {
    const detalles: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (detalles[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(detalles));
  }

  const version = await db().aiPromptVersion.findUnique({
    where: { id: parsed.data.promptVersionId },
    select: { id: true, status: true, prompt: { select: { id: true, code: true } } },
  });
  if (version === null) return fail(errors.notFound('la versión no existe'));

  const decision = can(actor, 'ai.prompt.edit', { kind: 'AiPrompt', id: version.prompt.id, legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (version.status !== 'DRAFT' && version.status !== 'TESTING') {
    return fail(
      errors.ruleViolation(
        'El laboratorio solo prueba versiones en borrador o en prueba. Una versión publicada o retirada no se prueba aquí.',
        `estado ${version.status}`,
      ),
    );
  }

  const result = await runLabGeneration({
    promptVersionId: version.id,
    purpose: parsed.data.purpose,
    userText: parsed.data.userText,
    // El laboratorio prueba con lo que escribe quien prueba: no hay una persona
    // real detrás cuyos datos haya que minimizar. La minimización de flujos
    // reales es del bloque E.
    redactionApplied: false,
    requestedById: actor.userId,
    actorId: actor.actorId,
    timeZone: actor.timeZone,
  });

  // Si el proveedor se llamó de verdad —cualquier estado que no sea degradación
  // ni corte por límite—, la versión pasa a «en prueba». La degradación y el
  // corte no la mueven: no se probó nada.
  const seLlamo = result.status !== 'DEGRADED' && result.status !== 'LIMIT_EXCEEDED';
  let versionStatus: 'DRAFT' | 'TESTING' = version.status;

  if (seLlamo) {
    versionStatus = 'TESTING';
    await transaction(async (tx) => {
      if (version.status === 'DRAFT') {
        await tx.aiPromptVersion.update({
          where: { id: version.id },
          data: { status: 'TESTING', updatedByActorId: actor.actorId },
        });
      }
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.AI_PROMPT_TESTED,
        objectKind: 'AiPrompt',
        objectId: version.prompt.id,
        outcome: 'SUCCESS',
        legalEntityId: null,
        metadata: { code: version.prompt.code, resultado: result.status },
      });
    });
  }

  return ok({ result, versionStatus });
}
