'use server';

import { revalidatePath } from 'next/cache';

import { createIndigoAmbassador, updateIndigoAmbassador } from '@/modules/admin';
import { textField } from '@/platform/http/form-fields';
import { currentActor } from '@/platform/http/request-context';

export interface AmbassadorFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function createAmbassadorAction(
  _previous: AmbassadorFormState,
  formData: FormData,
): Promise<AmbassadorFormState> {
  const actor = await currentActor();
  const result = await createIndigoAmbassador(actor, {
    givenName: textField(formData, 'givenName'),
    familyName: textField(formData, 'familyName'),
    secondFamilyName: textField(formData, 'secondFamilyName'),
    email: textField(formData, 'email'),
    phone: textField(formData, 'phone'),
    territory: textField(formData, 'territory'),
    notes: textField(formData, 'notes'),
  });
  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }

  revalidatePath('/superadmin');
  revalidatePath('/superadmin/embajadores');
  return { status: 'ok', message: `Embajador creado con el código ${result.data.code}.` };
}

export async function updateAmbassadorAction(
  _previous: AmbassadorFormState,
  formData: FormData,
): Promise<AmbassadorFormState> {
  const actor = await currentActor();
  const ambassadorId = textField(formData, 'ambassadorId');
  const result = await updateIndigoAmbassador(actor, {
    ambassadorId,
    rowVersion: Number.parseInt(textField(formData, 'rowVersion'), 10),
    givenName: textField(formData, 'givenName'),
    familyName: textField(formData, 'familyName'),
    secondFamilyName: textField(formData, 'secondFamilyName'),
    email: textField(formData, 'email'),
    phone: textField(formData, 'phone'),
    territory: textField(formData, 'territory'),
    notes: textField(formData, 'notes'),
    status: textField(formData, 'status') as 'ACTIVE' | 'SUSPENDED' | 'CLOSED',
    reason: textField(formData, 'reason'),
  });
  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }

  revalidatePath('/superadmin');
  revalidatePath('/superadmin/embajadores');
  revalidatePath(`/superadmin/embajadores/${ambassadorId}`);
  return { status: 'ok', message: 'Registro del embajador actualizado.' };
}
