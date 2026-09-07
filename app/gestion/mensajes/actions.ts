'use server';

import { revalidatePath } from 'next/cache';
import { assistOnRequest, confirmRouting, resolveRequest, suggestClassification } from '@/modules/support';
import { reviewGeneration } from '@/modules/ai';
import type { AssistResult } from '@/modules/ai';
import { openCase } from '@/modules/cases';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import { NOMBRE_DE_ENTIDAD } from '@/modules/support/domain';

export interface RequestState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Marca un mensaje como atendido o descartado.
 *
 * No decide nada: quién puede, si el mensaje sigue sin atender y si alguien se
 * adelantó lo resuelve el módulo, que es donde está probado.
 */
export async function resolveRequestAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const actor = await currentActor();
  const requestId = textField(formData, 'requestId');

  const resultado = await resolveRequest(actor, {
    requestId,
    decision: textField(formData, 'decision') as never,
    note: textField(formData, 'note'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/mensajes');
  revalidatePath(`/gestion/mensajes/${requestId}`);
  return { status: 'ok', message: 'Queda registrado. Gracias por anotar qué hiciste.' };
}

/**
 * Confirma la canalización que el sistema propuso.
 *
 * Es la confirmación humana que el PRD §10.1 exige antes de canalizar nada. La
 * propuesta lleva guardada desde que el mensaje llegó y **no ha hecho nada**;
 * lo que la vuelve efectiva es este acto, con su nombre y su motivo.
 *
 * Quien confirma puede elegir la otra entidad: la pantalla enseña el motivo de
 * la propuesta precisamente para poder estar en desacuerdo con ella.
 */
export async function confirmRoutingAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const actor = await currentActor();

  const territorio = textField(formData, 'territorialUnitId');

  const resultado = await confirmRouting(actor, {
    requestId: textField(formData, 'requestId'),
    legalEntity: textField(formData, 'legalEntity') as never,
    urgency: textField(formData, 'urgency') as never,
    territorialUnitId: territorio === '' ? null : territorio,
    note: textField(formData, 'note'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/mensajes');
  return {
    status: 'ok',
    message: resultado.data.coincideConLaPropuesta
      ? `Canalizado al ${NOMBRE_DE_ENTIDAD[resultado.data.entidad]}, como se proponía. Folio ${resultado.data.folio}.`
      : `Canalizado al ${NOMBRE_DE_ENTIDAD[resultado.data.entidad]}, apartándose de la propuesta. Queda escrito. Folio ${resultado.data.folio}.`,
  };
}

/**
 * Abre el expediente de un mensaje ya canalizado.
 *
 * Se niega si la canalización no está confirmada, y eso lo comprueba el módulo:
 * es el punto donde «la propuesta no sustituye confirmación humana» deja de ser
 * una frase del PRD y pasa a ser una condición que el código impone.
 */
export async function openCaseAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const actor = await currentActor();

  const resultado = await openCase(actor, {
    supportRequestId: textField(formData, 'supportRequestId'),
    legalEntityId: textField(formData, 'legalEntityId'),
    domain: textField(formData, 'domain') as never,
    caseType: textField(formData, 'caseType') as never,
    territorialUnitId: null,
    summary: null,
    priority: textField(formData, 'priority') as never,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/mensajes');
  revalidatePath('/casos');
  return {
    status: 'ok',
    message: `Expediente ${resultado.data.folio} abierto. Queda a tu cargo y lo encuentras en «Mis expedientes».`,
  };
}

/* -------------------------------------------------------------------------- */
/* Asistencia con IA (Fase 8, bloque F)                                       */
/* -------------------------------------------------------------------------- */

/** Traduce un resultado que no fue éxito a una frase para la pantalla. */
function describirSinExito(result: Exclude<AssistResult, { status: 'SUCCEEDED' }>): string {
  switch (result.status) {
    case 'DEGRADED':
      return result.reason === 'NO_PUBLISHED_PROMPT'
        ? 'La IA no tiene todavía un prompt publicado para esto. Se atiende por el camino humano.'
        : 'La IA no está disponible ahora. Se atiende por el camino humano.';
    case 'LIMIT_EXCEEDED':
      return 'Se alcanzó un límite de uso de la IA. Inténtalo más tarde o atiéndelo a mano.';
    case 'BLOCKED_BY_POLICY':
      return `La política detuvo esta generación: ${result.reason}. La IA no decide esto.`;
    case 'SCHEMA_REJECTED':
    case 'PROVIDER_ERROR':
    case 'TIMEOUT':
      return 'La IA no devolvió un resultado utilizable. Atiéndelo por el camino humano.';
  }
}

/** Estado del asistente informativo: además del borrador, su identificador para revisarlo. */
export interface AssistState {
  readonly status: 'idle' | 'error' | 'ok' | 'unavailable';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly output?: string;
  readonly generationId?: string;
}

/**
 * Genera un borrador asistido sobre un mensaje: resumen, redacción de respuesta,
 * explicación de trámite u orientación. La salida es un borrador **sin revisar**:
 * la pantalla la marca como generada por IA y ofrece revisarla. No cambia el
 * mensaje.
 */
export async function assistOnRequestAction(_previo: AssistState, formData: FormData): Promise<AssistState> {
  const actor = await currentActor();

  const resultado = await assistOnRequest(actor, {
    requestId: textField(formData, 'requestId'),
    useCase: textField(formData, 'useCase') as never,
    userText: textField(formData, 'userText'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  const result = resultado.data.result;
  if (result.status !== 'SUCCEEDED') {
    return { status: 'unavailable', message: describirSinExito(result) };
  }
  return { status: 'ok', output: result.output, generationId: result.generationId };
}

/**
 * Sugiere una canalización con IA. La propuesta queda guardada como propuesta
 * —no confirma nada— y apuntada a la generación que la produjo, para poder
 * revisarla antes de que surta efecto.
 */
export async function suggestClassificationAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const actor = await currentActor();
  const requestId = textField(formData, 'requestId');

  const resultado = await suggestClassification(actor, { requestId });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/mensajes/${requestId}`);
  const outcome = resultado.data;
  if (outcome.status === 'SUGGESTED') {
    return {
      status: 'ok',
      message: `La IA propone canalizar al ${NOMBRE_DE_ENTIDAD[outcome.proposal.entidad]}. Revísala antes de confirmarla.`,
    };
  }
  if (outcome.status === 'UNUSABLE') {
    return { status: 'error', message: 'La IA respondió, pero su salida no era una clasificación utilizable.' };
  }
  return { status: 'error', message: describirSinExito(outcome) };
}

/**
 * Registra la revisión humana de una salida asistida: aceptar, corregir o
 * rechazar. Es lo que decide si una salida puede surtir efecto (criterio 4).
 */
export async function reviewGenerationAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const actor = await currentActor();
  const requestId = textField(formData, 'requestId');
  const editado = textField(formData, 'editedOutput');
  const comentario = textField(formData, 'comment');

  const resultado = await reviewGeneration(actor, {
    generationId: textField(formData, 'generationId'),
    decision: textField(formData, 'decision') as never,
    ...(editado === '' ? {} : { editedOutput: editado }),
    ...(comentario === '' ? {} : { comment: comentario }),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  if (requestId !== '') revalidatePath(`/gestion/mensajes/${requestId}`);
  const rotulo =
    resultado.data.decision === 'ACCEPTED'
      ? 'Aceptada'
      : resultado.data.decision === 'EDITED'
        ? 'Corregida'
        : 'Rechazada';
  return { status: 'ok', message: `${rotulo}. Queda registrada tu revisión.` };
}
