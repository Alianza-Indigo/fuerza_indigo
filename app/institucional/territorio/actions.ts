'use server';

import { revalidatePath } from 'next/cache';
import {
  attachSignedTerritorialAppointment,
  createTerritorialDeploymentByAppointment,
  createTerritorialUnit,
  dissolveTerritorialUnit,
  updateTerritorialUnit,
} from '@/modules/governance';
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
  readonly appointmentPublicId?: string;
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
  revalidatePath('/institucional/organos');
  return {
    status: 'ok',
    message: `Unidad constituida en ${resultado.data.path}. Nace planeada: actívala cuando quede instalada.`,
  };
}

export async function createTerritorialDeploymentByAppointmentAction(
  _previous: TerritorialFormState,
  formData: FormData,
): Promise<TerritorialFormState> {
  const actor = await currentActor();
  const resultado = await createTerritorialDeploymentByAppointment(actor, {
    level: textField(formData, 'level') as 'STATE' | 'MUNICIPALITY' | 'SECTION',
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    parentId: textField(formData, 'parentId'),
    legalEntityId: textField(formData, 'legalEntityId'),
    appointedMembershipId: textField(formData, 'appointedMembershipId'),
    appointedOn: textField(formData, 'appointedOn'),
    termMonths: Number.parseInt(textField(formData, 'termMonths'), 10),
    reelectionAllowed: formData.get('reelectionAllowed') !== null,
    stateCode: opcional(textField(formData, 'stateCode')),
    municipalityCode: opcional(textField(formData, 'municipalityCode')),
    contactEmail: opcional(textField(formData, 'contactEmail')),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  for (const path of [
    '/institucional/territorio',
    '/institucional/organos',
    '/institucional/nombramientos',
    '/superadmin/mapa',
    '/delegaciones',
    '/mapa',
  ]) revalidatePath(path);
  return {
    status: 'ok',
    message: `Nombramiento ${resultado.data.appointmentNumber} registrado. La unidad, su autoridad, el cargo, el periodo y el acuerdo quedaron instalados.`,
    appointmentPublicId: resultado.data.appointmentPublicId,
  };
}

export async function attachSignedTerritorialAppointmentAction(
  _previous: TerritorialFormState,
  formData: FormData,
): Promise<TerritorialFormState> {
  const actor = await currentActor();
  const appointmentId = textField(formData, 'appointmentId');
  const file = formData.get('signedFile');

  if (!(file instanceof File) || file.size === 0) {
    return {
      status: 'error',
      message: 'Elige la copia firmada del acuerdo.',
      fieldErrors: { signedFile: ['Falta el archivo firmado.'] },
    };
  }
  if (file.size > 5 * 1024 * 1024) {
    return {
      status: 'error',
      message: 'La copia firmada supera el máximo de 5 MB.',
      fieldErrors: { signedFile: ['Reduce el archivo a un máximo de 5 MB.'] },
    };
  }

  const result = await attachSignedTerritorialAppointment(actor, {
    appointmentId,
    originalFileName: file.name,
    mimeType: file.type as 'application/pdf' | 'image/png' | 'image/jpeg',
    content: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }

  revalidatePath('/institucional/territorio');
  revalidatePath(`/institucional/territorio/nombramientos/${result.data.appointmentPublicId}`);
  return { status: 'ok', message: 'La copia firmada quedó incorporada al expediente del nombramiento.' };
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
  revalidatePath('/institucional/organos');
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
  revalidatePath('/institucional/organos');
  return { status: 'ok', message: 'Unidad disuelta. Su registro y su historia se conservan.' };
}
