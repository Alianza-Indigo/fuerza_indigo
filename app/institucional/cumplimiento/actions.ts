'use server';

import { revalidatePath } from 'next/cache';
import { advanceObligation, openObligation } from '@/modules/bargaining';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import type { AppError } from '@/platform/errors/app-error';

/** Actos sobre las obligaciones ante la autoridad laboral. */

export interface ComplianceFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(resultado: { error: AppError }): ComplianceFormState {
  return {
    status: 'error',
    message: resultado.error.message,
    ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
  };
}

export async function openObligationAction(
  _previous: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const actor = await currentActor();

  const resultado = await openObligation(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    kind: textField(formData, 'kind') as
      | 'MEMBER_REGISTRY_UPDATE'
      | 'LEADERSHIP_CHANGE'
      | 'STATUTE_AMENDMENT'
      | 'FINANCIAL_REPORT'
      | 'OTHER',
    triggerEventRef: textField(formData, 'triggerEventRef'),
    dueOn: textField(formData, 'dueOn'),
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/cumplimiento');
  return { status: 'ok', message: 'Obligación registrada con su acto de origen y su plazo.' };
}

export async function advanceObligationAction(
  _previous: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const actor = await currentActor();

  const archivo = formData.get('evidence');
  const acuse =
    archivo instanceof File && archivo.size > 0
      ? {
          fileName: archivo.name,
          mimeType: archivo.type,
          content: new Uint8Array(await archivo.arrayBuffer()),
        }
      : null;

  const referencia = textField(formData, 'authorityReference');

  const resultado = await advanceObligation(actor, {
    obligationId: textField(formData, 'obligationId'),
    status: textField(formData, 'status') as 'PREPARED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'OBSERVED' | 'CLOSED',
    authorityReference: referencia === '' ? null : referencia,
    note: textField(formData, 'note'),
    evidence: acuse,
  });
  if (!resultado.ok) return fallo(resultado);

  revalidatePath('/institucional/cumplimiento');
  return { status: 'ok', message: 'Obligación actualizada.' };
}
