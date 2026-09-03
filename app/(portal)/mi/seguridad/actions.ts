'use server';

import { revalidatePath } from 'next/cache';
import { closeOtherSessions, closeOwnSession } from '@/modules/identity';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface SessionActionState {
  readonly status: 'idle' | 'error' | 'done';
  readonly message?: string;
}

export async function closeSessionAction(_previous: SessionActionState, formData: FormData): Promise<SessionActionState> {
  const actor = await currentActor();
  const result = await closeOwnSession(actor, textField(formData, 'sessionId'));

  if (!result.ok) return { status: 'error', message: result.error.message };
  revalidatePath('/mi/seguridad');
  return { status: 'done', message: result.data.closed ? 'Sesión cerrada.' : 'Esa sesión ya estaba cerrada.' };
}

export async function closeOthersAction(_previous: SessionActionState): Promise<SessionActionState> {
  const actor = await currentActor();
  const result = await closeOtherSessions(actor);

  if (!result.ok) return { status: 'error', message: result.error.message };
  revalidatePath('/mi/seguridad');
  return {
    status: 'done',
    message:
      result.data.closed === 0
        ? 'No había otras sesiones abiertas.'
        : `Cerramos ${result.data.closed} sesión(es). La actual sigue abierta.`,
  };
}
