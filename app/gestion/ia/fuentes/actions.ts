'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { disableSource, indexSourceNow, registerSource } from '@/modules/ai';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de la base documental.
 *
 * Registrar, indexar y deshabilitar una fuente. Quién puede hacerlo y qué permiso
 * exige cada fuente lo decide el módulo; aquí solo se traduce el formulario.
 */

export interface FuenteState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): FuenteState {
  return { status: 'error', message: error.message, ...(error.details === undefined ? {} : { fieldErrors: error.details }) };
}

export async function registerSourceAction(_previo: FuenteState, formData: FormData): Promise<FuenteState> {
  const actor = await currentActor();
  const permiso = textField(formData, 'requiredPermissionCode');
  const resultado = await registerSource(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    sourceKind: (textField(formData, 'sourceKind') || 'PUBLIC_CONTENT') as never,
    contentPageId: textField(formData, 'contentPageId'),
    ...(permiso === '' ? {} : { requiredPermissionCode: permiso }),
  });
  if (!resultado.ok) return fallo(resultado.error);
  redirect('/gestion/ia/fuentes');
}

export async function indexSourceAction(_previo: FuenteState, formData: FormData): Promise<FuenteState> {
  const actor = await currentActor();
  const resultado = await indexSourceNow(actor, textField(formData, 'sourceId'));
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath('/gestion/ia/fuentes');
  if (resultado.data.status === 'INDEXED') {
    return { status: 'ok', message: `Indexada en ${resultado.data.chunkCount} fragmento(s).` };
  }
  return {
    status: 'ok',
    message:
      resultado.data.reason === 'NO_API_KEY'
        ? 'La IA está encendida pero sin clave: no se pudo vectorizar. La fuente queda como estaba.'
        : 'La IA está apagada: no se pudo vectorizar. La fuente queda como estaba, y la búsqueda cae al camino humano.',
  };
}

export async function disableSourceAction(_previo: FuenteState, formData: FormData): Promise<FuenteState> {
  const actor = await currentActor();
  const resultado = await disableSource(actor, textField(formData, 'sourceId'));
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath('/gestion/ia/fuentes');
  return { status: 'ok', message: 'Fuente deshabilitada. Se borraron sus fragmentos y deja de consultarse.' };
}
