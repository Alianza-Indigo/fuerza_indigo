'use server';

import { revalidatePath } from 'next/cache';
import { resolveRequest } from '@/modules/support';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

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
