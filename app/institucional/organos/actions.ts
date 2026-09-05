'use server';

import { revalidatePath } from 'next/cache';
import { createUnionBody, declareIncompatibility, defineOffice } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Actos sobre órganos y cargos. La política vive en el caso de uso. */

export interface GovernanceFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function createUnionBodyAction(
  _previous: GovernanceFormState,
  formData: FormData,
): Promise<GovernanceFormState> {
  const actor = await currentActor();
  const instalado = textField(formData, 'installedOn');

  const resultado = await createUnionBody(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    kind: textField(formData, 'kind') as 'GENERAL_ASSEMBLY',
    territorialUnitId: textField(formData, 'territorialUnitId'),
    legalEntityId: textField(formData, 'legalEntityId'),
    installedOn: instalado === '' ? null : instalado,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/organos');
  return { status: 'ok', message: 'Órgano instalado conforme a las reglas estatutarias en vigor.' };
}

export async function defineOfficeAction(
  _previous: GovernanceFormState,
  formData: FormData,
): Promise<GovernanceFormState> {
  const actor = await currentActor();

  const permisos = formData
    .getAll('permissionCodes')
    .filter((valor): valor is string => typeof valor === 'string' && valor !== '');

  const resultado = await defineOffice(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    unionBodyId: textField(formData, 'unionBodyId'),
    kind: textField(formData, 'kind') as 'SECRETARY_GENERAL',
    termMonths: Number.parseInt(textField(formData, 'termMonths'), 10),
    reelectionAllowed: formData.get('reelectionAllowed') !== null,
    seats: Number.parseInt(textField(formData, 'seats') || '1', 10),
    grantsRoleCode: textField(formData, 'grantsRoleCode') as 'EXECUTIVE_SECRETARY',
    permissionCodes: permisos,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/organos');
  return { status: 'ok', message: 'Cargo definido con sus facultades.' };
}

export async function declareIncompatibilityAction(
  _previous: GovernanceFormState,
  formData: FormData,
): Promise<GovernanceFormState> {
  const actor = await currentActor();

  const resultado = await declareIncompatibility(actor, {
    officeAId: textField(formData, 'officeAId'),
    officeBId: textField(formData, 'officeBId'),
    rationale: textField(formData, 'rationale'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/organos');
  return { status: 'ok', message: 'Incompatibilidad declarada. Vale en los dos sentidos.' };
}
