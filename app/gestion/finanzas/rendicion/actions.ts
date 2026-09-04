'use server';

import { exportLedger } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Exportación del libro.
 *
 * El archivo se devuelve al navegador desde la propia acción, y el asiento de
 * auditoría lo escribe el caso de uso antes de entregarlo. No hay una ruta de
 * descarga con un identificador reutilizable: una dirección así se copia, se
 * comparte y acaba entregando el libro a quien nadie autorizó.
 */

export interface ExportState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly fileName?: string;
  readonly content?: string;
  readonly rows?: number;
}

export async function exportLedgerAction(_previo: ExportState, formData: FormData): Promise<ExportState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await exportLedger(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    periodStart: textField(formData, 'periodStart'),
    periodEnd: textField(formData, 'periodEnd'),
    reason: motivo,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  return {
    status: 'ok',
    message: `${String(resultado.data.rows)} asientos. La exportación quedó registrada con tu nombre y el motivo.`,
    fileName: resultado.data.fileName,
    content: resultado.data.content,
    rows: resultado.data.rows,
  };
}
