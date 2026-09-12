'use server';

import { revalidatePath } from 'next/cache';
import { updateLegalEntity } from '@/modules/admin';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface LegalEntityFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function updateLegalEntityAction(
  _previous: LegalEntityFormState,
  formData: FormData,
): Promise<LegalEntityFormState> {
  const actor = await currentActor();
  const resultado = await updateLegalEntity(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    rowVersion: Number.parseInt(textField(formData, 'rowVersion'), 10),
    legalName: textField(formData, 'legalName'),
    shortName: textField(formData, 'shortName'),
    taxId: textField(formData, 'taxId'),
    registryNumber: textField(formData, 'registryNumber'),
    address: textField(formData, 'address'),
    contactEmail: textField(formData, 'contactEmail'),
    privacyNoticeUrl: textField(formData, 'privacyNoticeUrl'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/superadmin');
  revalidatePath('/superadmin/puesta-en-marcha');
  return { status: 'ok', message: 'Ficha institucional guardada y registrada en la bitácora.' };
}
