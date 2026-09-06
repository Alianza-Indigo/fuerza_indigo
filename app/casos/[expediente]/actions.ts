'use server';

import { revalidatePath } from 'next/cache';
import { assessCase } from '@/modules/cases';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface CaseFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Asienta la valoración humana del expediente.
 *
 * No decide nada por su cuenta: quién puede, si está a cargo y si el expediente
 * admite la valoración lo resuelve el módulo, que es donde está probado.
 */
export async function assessCaseAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const plazo = textField(formData, 'dueAt');

  const resultado = await assessCase(actor, {
    caseId: textField(formData, 'caseId'),
    humanAssessment: textField(formData, 'humanAssessment'),
    priority: textField(formData, 'priority') as never,
    status: textField(formData, 'status') as never,
    dueAt: plazo === '' ? null : plazo,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message: resultado.data.primeraRespuesta
      ? `Valorado. Queda registrado como la primera respuesta del expediente ${resultado.data.folio}.`
      : `Valoración actualizada en el expediente ${resultado.data.folio}.`,
  };
}
