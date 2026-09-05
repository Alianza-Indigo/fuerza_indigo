'use server';

import { exportInternalDirectory } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Exportación del directorio interno, con motivo y marca temporal (PRD §7.2). */

export interface DirectorioState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
  readonly file?: { readonly name: string; readonly content: string; readonly rows: number };
}

export async function exportDirectoryAction(
  _previous: DirectorioState,
  formData: FormData,
): Promise<DirectorioState> {
  const actor = await currentActor();
  const values = { reason: textField(formData, 'reason') };

  const resultado = await exportInternalDirectory(actor, { reason: values.reason });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  return {
    status: 'ok',
    message: `Directorio exportado: ${resultado.data.rows} fila(s), con tu alcance y no con otro.`,
    file: { name: resultado.data.fileName, content: resultado.data.content, rows: resultado.data.rows },
  };
}
