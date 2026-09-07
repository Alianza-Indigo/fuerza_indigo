import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { Prisma } from '@prisma-client/client';
import { assist, ASSISTED_USE_CASES, type AssistOutcome, type AssistResult } from '@/modules/ai';
import type { PropuestaDeCanalizacion } from '../domain/routing';
import { leerPropuesta } from './routing';

/**
 * Casos de uso asistidos sobre la solicitud de apoyo (PRD §15.2, §24 Fase 8; ADR-0150).
 *
 * La IA entra donde ya hay una persona trabajando, no antes. Quien clasifica,
 * resume, redacta o explica aquí es alguien que **ya puede leer** la solicitud
 * —tiene `support.request.read` y el asiento de su lectura ya quedó escrito— y
 * pide un borrador que le ahorre trabajo. Eso es distinto de la canalización
 * automática de la Fase 6, que la calcula una tabla explícita porque decide
 * **quién lee por primera vez** un relato sensible antes de que nadie lo haya
 * leído (ADR-0106, y la nota de `domain/routing.ts`). Esa frontera es la que hace
 * que la IA asista sin decidir: no reparte el primer acceso, ayuda a quien ya lo
 * tiene, y su salida no surte efecto hasta que una persona la revisa.
 *
 * Cada caso de uso arma su petición con el núcleo asistido de `@/modules/ai`
 * —prompt vigente, recuperación con permisos, efecto declarado— y devuelve el
 * resultado tal cual para que la pantalla lo enseñe marcado como generado por IA.
 * Sin prompt publicado, el núcleo degrada al camino humano: la solicitud se
 * atiende como siempre.
 */

/** Entidades que el actor alcanza, o `undefined` si las alcanza todas. */
function alcance(actor: ActorContext): readonly string[] | undefined {
  return actor.legalEntityScope.length === 0 ? undefined : actor.legalEntityScope;
}

/** Los cuatro flujos informativos que operan sobre una solicitud sin cambiarla. */
const INFORMATIVE = {
  SUMMARY: ASSISTED_USE_CASES.SUMMARY,
  DRAFTING_ASSISTANCE: ASSISTED_USE_CASES.DRAFTING_ASSISTANCE,
  PROCEDURE_EXPLANATION: ASSISTED_USE_CASES.PROCEDURE_EXPLANATION,
  INITIAL_GUIDANCE: ASSISTED_USE_CASES.INITIAL_GUIDANCE,
} as const;

export type InformativeUseCaseKey = keyof typeof INFORMATIVE;

export const assistOnRequestSchema = z.object({
  requestId: z.uuid(),
  useCase: z.enum(['SUMMARY', 'DRAFTING_ASSISTANCE', 'PROCEDURE_EXPLANATION', 'INITIAL_GUIDANCE']),
  /**
   * Lo que quien atiende le pide a la IA: una instrucción para redactar, una
   * pregunta de trámite. Para el resumen puede ir vacío —lo que se resume es el
   * relato—.
   */
  userText: z.string().trim().max(4000).default(''),
});

export type AssistOnRequestInput = z.input<typeof assistOnRequestSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Lee la solicitud dentro del alcance del actor. Fuera de alcance e inexistente
 * responden igual: decir «existe pero no es tuya» confirmaría una solicitud de
 * otra entidad.
 */
async function solicitudEnAlcance(
  actor: ActorContext,
  requestId: string,
): Promise<{ id: string; folio: string; status: string; legalEntityId: string; requestType: string; subject: string; narrative: string } | null> {
  const entidades = alcance(actor);
  const fila = await db().supportRequest.findFirst({
    where: { id: requestId, ...(entidades === undefined ? {} : { legalEntityId: { in: [...entidades] } }) },
    select: { id: true, folio: true, status: true, legalEntityId: true, requestType: true, subject: true, narrative: true },
  });
  return fila;
}

/**
 * Ejecuta un flujo asistido informativo sobre una solicitud: resumen, redacción
 * de respuesta, explicación de trámite u orientación. No cambia la solicitud: su
 * salida es un borrador que una persona revisa. Requiere poder leer la solicitud,
 * que es lo que autoriza a asistir sobre ella.
 */
export async function assistOnRequest(
  actor: ActorContext,
  input: AssistOnRequestInput,
): Promise<UseCaseResult<AssistOutcome>> {
  const parsed = assistOnRequestSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'support.request.read', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const solicitud = await solicitudEnAlcance(actor, data.requestId);
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente o fuera del alcance del actor'));

  const useCase = INFORMATIVE[data.useCase];

  // Qué se le manda al modelo depende del flujo. El resumen resume el relato; los
  // demás combinan lo que pide quien atiende con el asunto y el relato como
  // contexto. La minimización de todo esto la hace el servicio (bloque E).
  const relato = `Asunto: ${solicitud.subject}\n\n${solicitud.narrative}`;
  const userText =
    data.useCase === 'SUMMARY'
      ? relato
      : data.userText === ''
        ? relato
        : `${data.userText}\n\n---\n\n${relato}`;
  const queryText = data.userText === '' ? solicitud.narrative : data.userText;

  return assist(actor, {
    useCase,
    userText,
    queryText,
    requestedById: actor.userId,
  });
}

/* -------------------------------------------------------------------------- */
/* Clasificación sugerida                                                     */
/* -------------------------------------------------------------------------- */

export type ClassificationOutcome =
  /** El modelo devolvió una clasificación utilizable, ya guardada como propuesta. */
  | { readonly status: 'SUGGESTED'; readonly generationId: string; readonly proposal: PropuestaDeCanalizacion }
  /** El modelo respondió, pero su salida no era una clasificación utilizable. */
  | { readonly status: 'UNUSABLE'; readonly generationId: string }
  /** Cualquier otro resultado del núcleo: degradación, corte por límite, rechazo. */
  | Exclude<AssistResult, { readonly status: 'SUCCEEDED' }>;

export const suggestClassificationSchema = z.object({ requestId: z.uuid() });
export type SuggestClassificationInput = z.infer<typeof suggestClassificationSchema>;

/**
 * Sugiere una canalización con IA sobre una solicitud que aún no se confirmó.
 *
 * Guarda la propuesta en `suggestedRouting` y apunta la solicitud a la generación
 * que la produjo (`suggestedByAiGenerationId`), que es lo que distingue una
 * propuesta de un modelo de la que calculó la regla. **No confirma nada**: como
 * toda propuesta de canalización, no ejecuta (ADR-0106). Confirmarla exige, además
 * de la facultad de siempre, que la generación se haya revisado y aceptado —esa
 * puerta vive en `confirmRouting`—.
 */
export async function suggestClassification(
  actor: ActorContext,
  input: SuggestClassificationInput,
): Promise<UseCaseResult<ClassificationOutcome>> {
  const parsed = suggestClassificationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'support.request.triage', { kind: 'SupportRequest' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const solicitud = await solicitudEnAlcance(actor, parsed.data.requestId);
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente o fuera del alcance del actor'));

  // Una solicitud ya confirmada no se reclasifica: la canalización ya la decidió
  // una persona, y una propuesta nueva sobre algo resuelto solo confunde.
  if (solicitud.status !== 'RECEIVED') {
    return fail(
      errors.conflict(
        'Esta solicitud ya no está a la espera de canalización. Clasificar algo ya resuelto confundiría a quien lo reciba.',
        `estado ${solicitud.status}`,
      ),
    );
  }

  const outcome = await assist(actor, {
    useCase: ASSISTED_USE_CASES.REQUEST_CLASSIFICATION,
    userText: `Asunto: ${solicitud.subject}\n\n${solicitud.narrative}`,
    queryText: solicitud.narrative,
    requestedById: actor.userId,
  });
  if (!outcome.ok) return fail(outcome.error);

  const result = outcome.data.result;
  if (result.status !== 'SUCCEEDED') {
    // Degradación, corte por límite o rechazo: se devuelve tal cual, y la
    // solicitud no se toca. El camino humano sigue disponible.
    return ok(result);
  }

  // El servicio ya validó la salida contra el esquema de la versión; este es el
  // último filtro: que además sea una canalización que este módulo sepa leer. Si
  // no lo es, no se escribe una propuesta a medias.
  let json: unknown = null;
  try {
    json = JSON.parse(result.output);
  } catch {
    json = null;
  }
  const proposal = leerPropuesta(json);
  if (proposal === null) {
    return ok({ status: 'UNUSABLE', generationId: result.generationId });
  }

  await transaction(async (tx) => {
    await tx.supportRequest.update({
      where: { id: solicitud.id },
      data: {
        suggestedRouting: proposal as unknown as Prisma.InputJsonValue,
        suggestedByAiGenerationId: result.generationId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_CLASSIFICATION_SUGGESTED,
      objectKind: 'SupportRequest',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      // La propuesta, no el relato: consultar que se clasificó no expone lo que
      // la persona contó (criterio 6).
      metadata: { folio: solicitud.folio, entidad: proposal.entidad, generationId: result.generationId },
    });
  });

  return ok({ status: 'SUGGESTED', generationId: result.generationId, proposal });
}
