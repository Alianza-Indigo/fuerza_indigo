'use server';

import { revalidatePath } from 'next/cache';
import { createTerritorialUnit, dissolveTerritorialUnit, updateTerritorialUnit } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Actos sobre la estructura territorial.
 *
 * Esta capa solo traduce el formulario al caso de uso. La comprobación de
 * facultades, el acuerdo habilitante y la negativa a disolver una unidad que
 * todavía sostiene algo viven en `@/modules/governance`, no aquí.
 */

export interface TerritorialFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function opcional(valor: string): string | null {
  return valor === '' ? null : valor;
}

export async function createTerritorialUnitAction(
  _previous: TerritorialFormState,
  formData: FormData,
): Promise<TerritorialFormState> {
  const actor = await currentActor();

  const resultado = await createTerritorialUnit(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    type: textField(formData, 'type') as
      | 'FOREIGN_COUNTRY'
      | 'STATE'
      | 'MUNICIPALITY'
      | 'SECTION'
      | 'DELEGATION'
      | 'OFFICE'
      | 'VIRTUAL_THEMATIC',
    parentId: textField(formData, 'parentId'),
    enablingResolutionId: textField(formData, 'enablingResolutionId'),
    createdOn: textField(formData, 'createdOn'),
    stateCode: opcional(textField(formData, 'stateCode')),
    municipalityCode: opcional(textField(formData, 'municipalityCode')),
    contactEmail: opcional(textField(formData, 'contactEmail')),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/territorio');
  return {
    status: 'ok',
    message: `Unidad constituida en ${resultado.data.path}. Nace planeada: actívala cuando quede instalada.`,
  };
}

export async function updateTerritorialUnitAction(
  _previous: TerritorialFormState,
  formData: FormData,
): Promise<TerritorialFormState> {
  const actor = await currentActor();

  const resultado = await updateTerritorialUnit(actor, {
    territorialUnitId: textField(formData, 'territorialUnitId'),
    name: textField(formData, 'name'),
    contactEmail: opcional(textField(formData, 'contactEmail')),
    status: textField(formData, 'status') as 'PLANNED' | 'ACTIVE' | 'SUSPENDED',
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/territorio');
  return { status: 'ok', message: 'Unidad actualizada.' };
}

export async function dissolveTerritorialUnitAction(
  _previous: TerritorialFormState,
  formData: FormData,
): Promise<TerritorialFormState> {
  const actor = await currentActor();

  const resultado = await dissolveTerritorialUnit(actor, {
    territorialUnitId: textField(formData, 'territorialUnitId'),
    dissolvedOn: textField(formData, 'dissolvedOn'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/territorio');
  return { status: 'ok', message: 'Unidad disuelta. Su registro y su historia se conservan.' };
}
