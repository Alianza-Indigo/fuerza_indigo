import type { AiPurpose } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { redact, runGeneration, type DegradationReason, type RunGenerationResult } from '@/platform/ai';
import { retrieveForVersion } from './knowledge';

/**
 * Núcleo de los casos de uso asistidos (PRD §15.2, §24 Fase 8; ADR-0148).
 *
 * Un caso de uso asistido —clasificar, resumir, redactar, explicar, orientar— no
 * llama al modelo directamente: pasa por aquí, y aquí es donde se cumplen las tres
 * cosas que el bloque F contrata para todos por igual.
 *
 *  1. **El prompt vigente, no uno del código.** Se resuelve por el *código* del
 *     prompt administrado —un identificador, no el texto—, y se ejecuta su versión
 *     **publicada**. Si no hay ninguna publicada, no se inventa: se degrada al
 *     camino humano, igual que con la IA apagada. Es lo que hace cierto el criterio
 *     1 de la fase también para los flujos asistidos: el texto que se le pide al
 *     modelo se administra y se revisa, no se despliega.
 *  2. **La recuperación con los permisos de quien pregunta** (bloque D). El
 *     contexto sale de `retrieveForVersion`, que filtra los fragmentos por el
 *     permiso de su origen: un flujo asistido no puede colar a un fragmento que la
 *     persona no podría leer por su cuenta.
 *  3. **El efecto declarado, para el guardián del §15.4** (bloque E). Cada caso de
 *     uso dice qué efecto produce su salida. Los asistidos declaran un efecto que
 *     **no** está en la lista de los prohibidos —sugerir, resumir, redactar,
 *     explicar—, porque la IA no decide: propone, y una persona confirma. Declarar
 *     el efecto es lo que haría saltar el guardián si alguien cableara un caso de
 *     uso asistido a una decisión que no le toca.
 *
 * Lo que **no** vive aquí: la revisión humana de la salida (`review.ts`) y qué
 * hace cada caso de uso con lo generado (los módulos que lo llaman). Este núcleo
 * produce una generación gobernada; que surta efecto o no es de quien la revisa.
 */

/**
 * Un caso de uso asistido, atado a un prompt administrado por su código.
 *
 * El código es un identificador, no el prompt: el texto, el modelo, los
 * parámetros y el esquema viven en la base y se administran (bloque C). Atar el
 * caso de uso al código es lo que permite cambiar el prompt sin desplegar y, a la
 * vez, saber desde el código qué prompt gobierna cada flujo.
 */
export interface AssistedUseCase {
  readonly code: string;
  readonly purpose: AiPurpose;
  /**
   * Efecto que produce la salida de este caso de uso. Deliberadamente **fuera**
   * de la lista del §15.4: un flujo asistido sugiere, no decide. Se declara para
   * que el guardián lo compruebe y para dejar por escrito qué es —y qué no es—.
   */
  readonly intendedEffect: string;
}

/**
 * Los cinco flujos asistidos que el PRD §15.2 y el §24 Fase 8 contratan. Cada uno
 * nombra el código del prompt que lo gobierna y el efecto que declara.
 *
 * Ninguno de estos efectos está en `PROHIBITED_EFFECTS`: por eso el guardián los
 * deja pasar. La clasificación **sugiere** una canalización, no admite ni rechaza
 * a nadie; el resumen resume, no diagnostica; la redacción redacta un borrador
 * que una persona firma. La frontera entre proponer y decidir es justo lo que la
 * fase protege.
 */
export const ASSISTED_USE_CASES = {
  INITIAL_GUIDANCE: {
    code: 'orientacion-inicial',
    purpose: 'INITIAL_GUIDANCE',
    intendedEffect: 'PLAIN_LANGUAGE_GUIDANCE',
  },
  PROCEDURE_EXPLANATION: {
    code: 'explicacion-tramite',
    purpose: 'PROCEDURE_EXPLANATION',
    intendedEffect: 'PLAIN_LANGUAGE_EXPLANATION',
  },
  REQUEST_CLASSIFICATION: {
    code: 'clasificacion-solicitud',
    purpose: 'REQUEST_CLASSIFICATION',
    intendedEffect: 'ROUTING_SUGGESTION',
  },
  SUMMARY: {
    code: 'resumen-solicitud',
    purpose: 'SUMMARY',
    intendedEffect: 'SUMMARY_SUGGESTION',
  },
  DRAFTING_ASSISTANCE: {
    code: 'redaccion-comunicacion',
    purpose: 'DRAFTING_ASSISTANCE',
    intendedEffect: 'DRAFT_TEXT',
  },
} as const satisfies Record<string, AssistedUseCase>;

export type AssistedUseCaseKey = keyof typeof ASSISTED_USE_CASES;

/** Por qué se degradó al camino humano: las del servicio, más «no hay prompt publicado». */
export type AssistDegradation = DegradationReason | 'NO_PUBLISHED_PROMPT';

/**
 * Lo que devuelve el núcleo. Es el resultado del servicio, con una razón de
 * degradación de más: cuando el caso de uso no tiene un prompt publicado, se cae
 * al camino humano sin haber llamado a nadie.
 */
export type AssistResult =
  | Exclude<RunGenerationResult, { readonly status: 'DEGRADED' }>
  | { readonly status: 'DEGRADED'; readonly reason: AssistDegradation };

export interface AssistInput {
  readonly useCase: AssistedUseCase;
  /** El texto de la persona, que se envía al modelo (el servicio lo redacta). */
  readonly userText: string;
  /**
   * El texto con el que se busca en la base documental. Suele ser el mismo que
   * `userText`. Se **redacta aquí** antes de recuperar, porque la búsqueda
   * semántica también llega al proveedor (embeddings) y la minimización del §15.5
   * alcanza a todo lo que sale del servidor, no solo a la generación.
   */
  readonly queryText: string;
  readonly requestedById: string | null;
  readonly conversationId?: string | null;
}

export interface AssistOutcome {
  readonly result: AssistResult;
  /** Cuántos fragmentos de la base documental acompañaron a la petición. */
  readonly chunksUsed: number;
}

/**
 * Ejecuta un caso de uso asistido. No comprueba permisos: lo hace quien llama,
 * con el permiso del acto que asiste —clasificar una solicitud, resumir un
 * expediente—, porque el permiso de usar la IA para algo es el permiso de hacer
 * ese algo. No lanza por un estado de operación: devuelve el resultado para que
 * la interfaz lo enseñe, siempre marcado como generado por IA.
 */
export async function assist(actor: ActorContext, input: AssistInput): Promise<UseCaseResult<AssistOutcome>> {
  const prompt = await db().aiPrompt.findUnique({
    where: { code: input.useCase.code },
    select: { id: true, isActive: true, currentVersionId: true },
  });

  // Sin prompt, inactivo o sin versión publicada: no se ejecuta nada. No es un
  // error del programa —un prompt puede no estar publicado todavía—, es un estado
  // de operación que cae al camino humano, igual que la IA apagada.
  if (prompt === null || !prompt.isActive || prompt.currentVersionId === null) {
    return ok({ result: { status: 'DEGRADED', reason: 'NO_PUBLISHED_PROMPT' }, chunksUsed: 0 });
  }
  const promptVersionId = prompt.currentVersionId;

  // La consulta a la base documental se redacta antes de salir: los embeddings
  // también van al proveedor (ADR-0148, aplicación de ADR-0145).
  const queryRedactado = redact(input.queryText).text;
  const recuperado = await retrieveForVersion(actor, { promptVersionId, queryText: queryRedactado });
  if (!recuperado.ok) return fail(recuperado.error);

  const chunks = recuperado.data.chunks;
  const contextText = chunks.length === 0 ? undefined : chunks.map((c: { text: string }) => c.text).join('\n\n---\n\n');

  const result = await runGeneration({
    promptVersionId,
    purpose: input.useCase.purpose,
    userText: input.userText,
    // Solo se pasa contexto si de verdad se recuperó algo: enviar una cadena
    // vacía sería material consultado que no existe.
    ...(contextText === undefined ? {} : { contextText }),
    intendedEffect: input.useCase.intendedEffect,
    // La redacción de verdad la hace el servicio (bloque E). Aquí no se promete
    // nada: `redactionApplied` de la fila queda en verdadero si el servicio tocó
    // algo.
    redactionApplied: false,
    requestedById: input.requestedById,
    actorId: actor.actorId,
    conversationId: input.conversationId ?? null,
    timeZone: actor.timeZone,
  });

  return ok({ result, chunksUsed: chunks.length });
}
