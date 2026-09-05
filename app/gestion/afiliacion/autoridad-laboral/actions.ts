'use server';

import { revalidatePath } from 'next/cache';
import { advanceFiling } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Avance del trámite ante la autoridad laboral (PRD §9.7). */

export interface TramiteState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

export async function advanceFilingAction(
  _previous: TramiteState,
  formData: FormData,
): Promise<TramiteState> {
  const actor = await currentActor();
  const values = {
    status: textField(formData, 'status'),
    authorityReference: textField(formData, 'authorityReference'),
    notes: textField(formData, 'notes'),
  };

  const resultado = await advanceFiling(actor, {
    filingId: textField(formData, 'filingId'),
    status: values.status as 'PREPARED',
    authorityReference: values.authorityReference,
    notes: values.notes,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/autoridad-laboral');
  return { status: 'ok', message: 'Trámite actualizado. El expediente conserva cada paso con su fecha.' };
}
