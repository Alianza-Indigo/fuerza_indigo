'use server';

import { revalidatePath } from 'next/cache';
import { closeBeneficiary, registerBeneficiary, updateBeneficiary } from '@/modules/membership';
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
  'originKind',
  'initialNeed',
  'urgencyLevel',
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
    originKind: textField(formData, 'originKind') as
      | 'SELF'
      | 'FAMILY_OR_CAREGIVER'
      | 'UNION_MEMBER'
      | 'DELEGATE'
      | 'SOCIAL_STAFF'
      | 'CIAN'
      | 'EXTERNAL_REFERRAL',
    initialNeed: textField(formData, 'initialNeed'),
    urgencyLevel: (textField(formData, 'urgencyLevel') || 'ROUTINE') as 'ROUTINE' | 'PRIORITY' | 'URGENT',
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
    message: `Atención registrada con el identificador ${resultado.data.publicId}.`,
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
    urgencyLevel: textField(formData, 'urgencyLevel') as 'ROUTINE' | 'PRIORITY' | 'URGENT',
    status: textField(formData, 'status') as 'REGISTERED' | 'IN_ATTENTION' | 'REFERRED',
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

export async function closeBeneficiaryAction(
  _previous: BeneficiariaFormState,
  formData: FormData,
): Promise<BeneficiariaFormState> {
  const actor = await currentActor();
  const beneficiaryId = textField(formData, 'beneficiaryId');
  const resultado = await closeBeneficiary(actor, {
    beneficiaryId,
    outcome: textField(formData, 'outcome') as 'CLOSED' | 'ARCHIVED',
    closeReason: textField(formData, 'closeReason'),
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
  return { status: 'ok', message: 'Atención cerrada.' };
}
