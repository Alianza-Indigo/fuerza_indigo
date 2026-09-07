'use server';

import { revalidatePath } from 'next/cache';
import { cancelOwnRegistration, registerForEvent } from '@/modules/events';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface InscripcionState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
}

export async function registerAction(_previous: InscripcionState, formData: FormData): Promise<InscripcionState> {
  const actor = await currentActor();
  const resultado = await registerForEvent(actor, { eventId: textField(formData, 'eventId') });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath('/mi/eventos');
  return {
    status: 'ok',
    message: resultado.data.status === 'WAITLISTED'
      ? 'El cupo está lleno: quedaste en lista de espera. Si se libera un lugar, subes.'
      : 'Listo, quedaste inscrito.',
  };
}

export async function cancelRegistrationAction(_previous: InscripcionState, formData: FormData): Promise<InscripcionState> {
  const actor = await currentActor();
  const resultado = await cancelOwnRegistration(actor, { eventId: textField(formData, 'eventId') });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath('/mi/eventos');
  return { status: 'ok', message: resultado.data.cancelled ? 'Cancelamos tu inscripción.' : 'No tenías una inscripción activa.' };
}
