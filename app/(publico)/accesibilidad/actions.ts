'use server';

import { revalidatePath } from 'next/cache';
import { savePreferences } from '@/platform/preferences';
import { textField } from '@/platform/http/form-fields';

export interface PreferencesState {
  readonly status: 'idle' | 'ok';
  readonly message?: string;
}

/**
 * Guarda las preferencias.
 *
 * No puede fallar de cara a la persona: un valor que no reconoce cae a su valor
 * por omisión en vez de rechazar el formulario entero. Devolver un error de
 * validación aquí sería impedir que alguien ajuste el tamaño del texto porque
 * otro campo del formulario llegó raro.
 */
export async function savePreferencesAction(
  _previo: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  await savePreferences({
    text: textField(formData, 'text'),
    density: textField(formData, 'density'),
    motion: textField(formData, 'motion'),
    focus: textField(formData, 'focus'),
    theme: textField(formData, 'theme'),
  });

  // Se revalida la raíz: las preferencias se aplican en el marco del documento.
  revalidatePath('/', 'layout');
  return { status: 'ok', message: 'Guardado. Ya se aplica en todo el sitio.' };
}
