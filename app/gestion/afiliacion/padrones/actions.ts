'use server';

import { exportRoster } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Exportación de un padrón, con motivo escrito.
 *
 * El archivo se devuelve en el estado del formulario y no por redirección: una
 * descarga que sale del sistema tiene que quedar antes en la bitácora, y el
 * caso de uso la escribe justo antes de entregar el contenido.
 */

export interface ExportacionState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
  readonly file?: { readonly name: string; readonly content: string; readonly rows: number };
}

export async function exportRosterAction(
  _previous: ExportacionState,
  formData: FormData,
): Promise<ExportacionState> {
  const actor = await currentActor();
  const values = { reason: textField(formData, 'reason') };

  const resultado = await exportRoster(actor, {
    roster: textField(formData, 'roster') as 'UNION',
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

  return {
    status: 'ok',
    message: `Padrón exportado: ${resultado.data.rows} fila(s). La exportación quedó en la bitácora.`,
    file: { name: resultado.data.fileName, content: resultado.data.content, rows: resultado.data.rows },
  };
}
