'use server';

import { revalidatePath } from 'next/cache';
import {
  publishDirectoryEntry,
  setDirectoryPreference,
  withdrawDirectoryConsent,
} from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { checkboxField, textField } from '@/platform/http/form-fields';

/**
 * Lo que cada persona decide sobre su propia aparición pública (PRD §7.3).
 *
 * Las dos acciones invalidan la caché de las direcciones afectadas. En el
 * retiro no es un detalle de rendimiento: sin invalidar, la ficha seguiría en
 * pie hasta que a alguien se le ocurriera recargarla, y eso es lo mismo que no
 * haberla retirado.
 */

export interface DirectorioPropioState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

export async function saveDirectoryPreferenceAction(
  _previous: DirectorioPropioState,
  formData: FormData,
): Promise<DirectorioPropioState> {
  const actor = await currentActor();
  if (actor.personId === null) {
    return { status: 'error', message: 'Para decidir sobre tu ficha necesitas entrar con tu cuenta.' };
  }

  const visibility = textField(formData, 'visibility');
  const resultado = await setDirectoryPreference(actor, {
    personId: actor.personId,
    visibility: visibility as 'HIDDEN',
    showPhoto: checkboxField(formData, 'showPhoto'),
    showProfessionalContact: checkboxField(formData, 'showProfessionalContact'),
    allowSearchEngineIndexing: checkboxField(formData, 'allowSearchEngineIndexing'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: { visibility },
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  if (resultado.data.visibility === 'HIDDEN') {
    revalidatePath('/directorio');
    return {
      status: 'ok',
      message: 'Listo: no vas a aparecer en el directorio público.',
    };
  }

  const publicada = await publishDirectoryEntry(actor, { personId: actor.personId });
  if (!publicada.ok) {
    return { status: 'error', message: publicada.error.message, values: { visibility } };
  }

  revalidatePath('/directorio');
  revalidatePath(`/directorio/${publicada.data.slug}`);
  return {
    status: 'ok',
    message: publicada.data.indexable
      ? 'Tu ficha está publicada y los buscadores pueden indexarla.'
      : 'Tu ficha está publicada. Los buscadores no la van a indexar.',
  };
}

export async function withdrawDirectoryAction(
  _previous: DirectorioPropioState,
  formData: FormData,
): Promise<DirectorioPropioState> {
  const actor = await currentActor();
  if (actor.personId === null) {
    return { status: 'error', message: 'Para retirar tu ficha necesitas entrar con tu cuenta.' };
  }

  const values = { reason: textField(formData, 'reason') };
  const resultado = await withdrawDirectoryConsent(actor, {
    personId: actor.personId,
    reason: values.reason,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  // Se invalida cada dirección afectada, no solo el listado: la ficha vivía en
  // su propia página y esa es la que hay que tirar.
  for (const ruta of resultado.data.paths) revalidatePath(ruta);
  revalidatePath('/mi/directorio');

  return {
    status: 'ok',
    message:
      resultado.data.withdrawn === 0
        ? 'Retiramos tu autorización. No tenías ninguna ficha publicada.'
        : 'Retiramos tu autorización y tu ficha dejó de estar publicada. Los buscadores ya no la pueden indexar.',
  };
}
