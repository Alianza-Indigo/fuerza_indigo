'use server';

import { revalidatePath } from 'next/cache';
import {
  registerBeneficiary,
  restoreBeneficiary,
  revokeBeneficiary,
  updateBeneficiary,
} from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Acciones del registro de personas beneficiarias (PRD §3.4, §8.3). */

export interface BeneficiariaFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
  readonly beneficiaryId?: string;
}

const CAMPOS = [
  'personId',
  'legalEntityId',
  'profileKind',
  'originKind',
  'territorialUnitId',
  'responsiblePersonId',
  'privacyLevel',
] as const;

function loEscrito(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = textField(formData, campo);
  return valores;
}

const nulo = (valor: string): string | null => (valor === '' ? null : valor);

export async function registerBeneficiaryAction(
  _previous: BeneficiariaFormState,
  formData: FormData,
): Promise<BeneficiariaFormState> {
  const actor = await currentActor();
  const resultado = await registerBeneficiary(actor, {
    personId: textField(formData, 'personId'),
    legalEntityId: textField(formData, 'legalEntityId'),
    profileKind: textField(formData, 'profileKind') as
      | 'NEURODIVERGENT_PERSON'
      | 'FAMILY_MEMBER'
      | 'CAREGIVER',
    originKind: textField(formData, 'originKind') as
      | 'SELF'
      | 'FAMILY_OR_CAREGIVER'
      | 'UNION_MEMBER'
      | 'DELEGATE'
      | 'SOCIAL_STAFF'
      | 'EXTERNAL_REFERRAL',
    territorialUnitId: nulo(textField(formData, 'territorialUnitId')),
    responsiblePersonId: nulo(textField(formData, 'responsiblePersonId')),
    privacyLevel: (textField(formData, 'privacyLevel') || 'REINFORCED') as 'STANDARD' | 'REINFORCED',
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/beneficiarios');
  return {
    status: 'ok',
    message: `Registro protegido creado con el identificador ${resultado.data.publicId}.`,
    beneficiaryId: resultado.data.beneficiaryId,
  };
}

export async function updateBeneficiaryAction(
  _previous: BeneficiariaFormState,
  formData: FormData,
): Promise<BeneficiariaFormState> {
  const actor = await currentActor();
  const beneficiaryId = textField(formData, 'beneficiaryId');
  const resultado = await updateBeneficiary(actor, {
    beneficiaryId,
    profileKind: textField(formData, 'profileKind') as
      | 'NEURODIVERGENT_PERSON'
      | 'FAMILY_MEMBER'
      | 'CAREGIVER',
    territorialUnitId: nulo(textField(formData, 'territorialUnitId')),
    responsiblePersonId: nulo(textField(formData, 'responsiblePersonId')),
    privacyLevel: textField(formData, 'privacyLevel') as 'STANDARD' | 'REINFORCED',
    privacyChangeReason: nulo(textField(formData, 'privacyChangeReason')),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/afiliacion/beneficiarios/${beneficiaryId}`);
  return { status: 'ok', message: 'Registro actualizado.' };
}

export async function revokeBeneficiaryAction(
  _previous: BeneficiariaFormState,
  formData: FormData,
): Promise<BeneficiariaFormState> {
  const actor = await currentActor();
  const beneficiaryId = textField(formData, 'beneficiaryId');
  const resultado = await revokeBeneficiary(actor, {
    beneficiaryId,
    reasonKind: textField(formData, 'reasonKind') as
      | 'IMPERSONATION'
      | 'DUPLICATE'
      | 'ADMINISTRATIVE_ERROR'
      | 'FALSE_INFORMATION'
      | 'MISUSE'
      | 'PERSON_REQUEST'
      | 'OTHER',
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/beneficiarios');
  revalidatePath(`/gestion/afiliacion/beneficiarios/${beneficiaryId}`);
  return { status: 'ok', message: 'Registro revocado.' };
}

export async function restoreBeneficiaryAction(
  _previous: BeneficiariaFormState,
  formData: FormData,
): Promise<BeneficiariaFormState> {
  const actor = await currentActor();
  const beneficiaryId = textField(formData, 'beneficiaryId');
  const resultado = await restoreBeneficiary(actor, {
    beneficiaryId,
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }
  revalidatePath('/gestion/afiliacion/beneficiarios');
  revalidatePath(`/gestion/afiliacion/beneficiarios/${beneficiaryId}`);
  return { status: 'ok', message: 'Registro restaurado y credencial nueva emitida.' };
}
