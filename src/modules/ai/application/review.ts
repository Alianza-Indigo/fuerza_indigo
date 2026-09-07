import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { AiReviewDecision } from '@prisma-client/enums';

/**
 * Revisión humana de cada salida (PRD §15.4, §24 Fase 8; ADR-0149).
 *
 * Es el criterio 4 de la fase —«las acciones sensibles requieren confirmación
 * humana»— hecho un dato. La IA produce un borrador gobernado; que ese borrador
 * **surta efecto** depende de que una persona con `ai.generation.review` lo
 * acepte, lo corrija o lo rechace, y de que esa decisión quede escrita.
 *
 * La decisión es **terminal**: una generación se revisa una vez. La base lo
 * sostiene por dos vías —la tabla es de solo inserción (bloque A) y `generationId`
 * es único (bloque F)—, de modo que nadie puede decir después «yo lo rechacé»
 * sobre algo que se aceptó, ni dejar coexistir dos decisiones que se contradigan.
 *
 * Aceptar y corregir son las dos formas de que una salida siga adelante: aceptar
 * la deja tal cual, corregir la sustituye por el texto de la persona —que es lo
 * que «permite corregirla» del criterio 3 significa de verdad—. Rechazar la
 * detiene, y por eso el rechazo se explica: sin motivo, no se puede mejorar el
 * prompt y la semana que viene sale lo mismo.
 */

const RECURSO = (id: string) => ({ kind: 'AiGeneration' as const, id, legalEntityId: null });

const DECISIONS = ['ACCEPTED', 'EDITED', 'REJECTED'] as const satisfies readonly AiReviewDecision[];

export const reviewGenerationSchema = z
  .object({
    generationId: z.uuid(),
    decision: z.enum(DECISIONS, { error: () => 'Elige si aceptas, corriges o rechazas la salida.' }),
    /** El texto corregido. Solo con `EDITED`, y entonces obligatorio. */
    editedOutput: z.string().trim().min(1).max(20_000).optional(),
    /** Motivo. Obligatorio al rechazar; opcional en los demás casos. */
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'EDITED' && (data.editedOutput === undefined || data.editedOutput === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['editedOutput'],
        message: 'Corregir es sustituir el texto: escribe la versión corregida.',
      });
    }
    if (data.decision !== 'EDITED' && data.editedOutput !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['editedOutput'],
        message: 'Solo una corrección lleva texto corregido. Para aceptar o rechazar, no lo escribas.',
      });
    }
    if (data.decision === 'REJECTED' && (data.comment === undefined || data.comment.length < 10)) {
      ctx.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'Un rechazo se explica: escribe al menos una frase de por qué (diez caracteres).',
      });
    }
  });

export type ReviewGenerationInput = z.input<typeof reviewGenerationSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Registra la revisión humana de una salida. No cambia la generación —es
 * inmutable—: añade la decisión que decide si esa salida puede surtir efecto.
 */
export async function reviewGeneration(
  actor: ActorContext,
  input: ReviewGenerationInput,
): Promise<UseCaseResult<{ generationId: string; decision: AiReviewDecision }>> {
  const parsed = reviewGenerationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'ai.generation.review', RECURSO(data.generationId));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Revisar es un acto de una persona: la revisión se atribuye a una cuenta, no a
  // un actor de sistema.
  const reviewerId = actor.userId;
  if (reviewerId === null) {
    return fail(errors.forbidden('Revisar una salida es un acto de una persona: exige una cuenta.'));
  }

  const generacion = await db().aiGeneration.findUnique({
    where: { id: data.generationId },
    select: { id: true, status: true, purpose: true, reviews: { select: { id: true } } },
  });
  if (generacion === null) return fail(errors.notFound('esa generación no existe'));

  // Solo se revisa una salida que el modelo produjo. Un rechazo de esquema, un
  // corte por política o un error del proveedor no tienen texto que revisar: no
  // se enseñaron, y no hay nada que aceptar ni corregir.
  if (generacion.status !== 'SUCCEEDED') {
    return fail(
      errors.ruleViolation(
        'Esta ejecución no dejó una salida que revisar: no se completó, se rechazó por esquema o la detuvo la política.',
        `estado ${generacion.status}`,
      ),
    );
  }

  // Terminal: una generación se revisa una vez. La restricción de unicidad lo
  // garantiza; esta comprobación da un mensaje claro en vez de un error de base.
  if (generacion.reviews.length > 0) {
    return fail(errors.conflict('Esta salida ya fue revisada. La revisión de una salida es una sola decisión.'));
  }

  await transaction(async (tx) => {
    await tx.aiReview.create({
      data: {
        generationId: generacion.id,
        reviewerId,
        decision: data.decision,
        editedOutput: data.decision === 'EDITED' ? (data.editedOutput ?? null) : null,
        comment: data.comment ?? null,
        createdByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_GENERATION_REVIEWED,
      objectKind: 'AiGeneration',
      objectId: generacion.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      // El contenido no va al asiento: solo la decisión y el propósito. Consultar
      // que algo se revisó no debe exponer lo que se escribió (criterio 6).
      metadata: { decision: data.decision, purpose: generacion.purpose },
    });
  });

  return ok({ generationId: generacion.id, decision: data.decision });
}

/* -------------------------------------------------------------------------- */
/* Consultas de trazabilidad                                                  */
/* -------------------------------------------------------------------------- */

export interface GenerationReviewState {
  readonly generationId: string;
  readonly decision: AiReviewDecision;
  readonly reviewedAt: Date;
  readonly reviewerLabel: string;
  /** El texto que rige tras la revisión: el corregido si se corrigió. */
  readonly editedOutput: string | null;
  readonly comment: string | null;
}

/**
 * ¿Una generación tiene ya una revisión aceptada (aceptada o corregida)?
 *
 * Es la pregunta que hace la puerta de cada consumidor: una salida asistida no
 * surte efecto sin una revisión que la deje seguir. Vive aquí, en el módulo de
 * IA, y no repetida en cada consumidor, para que la regla tenga una sola forma.
 */
export async function isGenerationAccepted(generationId: string): Promise<boolean> {
  const review = await db().aiReview.findUnique({
    where: { generationId },
    select: { decision: true },
  });
  return review !== null && (review.decision === 'ACCEPTED' || review.decision === 'EDITED');
}
