'use server';

import { revalidatePath } from 'next/cache';

import { setCredentialPhoto } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface FotoCredencialState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/** La fotografía la entrega exclusivamente la persona titular. */
export async function setOwnCredentialPhotoAction(
  _previous: FotoCredencialState,
  formData: FormData,
): Promise<FotoCredencialState> {
  const actor = await currentActor();
  const credentialId = textField(formData, 'credentialId');
  const photo = formData.get('photo');

  if (!(photo instanceof File) || photo.size === 0) {
    return {
      status: 'error',
      message: 'Selecciona una fotografía.',
      fieldErrors: { photo: ['Selecciona una fotografía JPG, PNG o WebP.'] },
    };
  }

  const resultado = await setCredentialPhoto(actor, {
    credentialId,
    originalFileName: photo.name,
    mimeType: photo.type as 'image/jpeg' | 'image/png' | 'image/webp',
    content: new Uint8Array(await photo.arrayBuffer()),
  });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/mi/credencial');
  revalidatePath('/gestion/credenciales');
  return { status: 'ok', message: 'Fotografía guardada correctamente.' };
}
