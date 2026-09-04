'use server';

import { revalidatePath } from 'next/cache';
import { createRedirect, deleteRedirect } from '@/modules/content';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface RedirectState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): RedirectState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

export async function createRedirectAction(_previo: RedirectState, formData: FormData): Promise<RedirectState> {
  const actor = await currentActor();
  const destino = textField(formData, 'destino');
  const esPagina = textField(formData, 'tipoDeDestino') === 'PAGINA';

  const resultado = await createRedirect(actor, {
    fromSlug: textField(formData, 'fromSlug'),
    permanent: textField(formData, 'permanent') !== 'TEMPORAL',
    ...(esPagina ? { toPageId: destino } : { toPath: destino }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/redirecciones');
  return { status: 'ok', message: 'Redirección creada. La dirección vieja ya lleva a su destino.' };
}

export async function deleteRedirectAction(_previo: RedirectState, formData: FormData): Promise<RedirectState> {
  const actor = await currentActor();
  const resultado = await deleteRedirect(actor, { redirectId: textField(formData, 'redirectId') });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/redirecciones');
  return { status: 'ok', message: 'Redirección borrada. La dirección vieja vuelve a no llevar a ninguna parte.' };
}
