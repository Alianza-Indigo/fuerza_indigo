'use server';

import { revalidatePath } from 'next/cache';
import { confirmRouting, resolveRequest } from '@/modules/support';
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

  const resultado = await confirmRouting(actor, {
    requestId: textField(formData, 'requestId'),
    legalEntity: textField(formData, 'legalEntity') as never,
    urgency: textField(formData, 'urgency') as never,
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
