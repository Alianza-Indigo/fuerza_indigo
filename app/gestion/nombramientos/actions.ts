'use server';

import { revalidatePath } from 'next/cache';
import { assignRole, revokeRole } from '@/modules/access';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de nombramiento y revocación.
 *
 * Toda la decisión ocurre en el servidor: el formulario funciona sin
 * JavaScript, y la comprobación de facultades la hace `assignRole`, no esta
 * capa. Lo que aquí se ve es únicamente la traducción entre el formulario y el
 * caso de uso.
 */

export interface AppointmentFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function assignRoleAction(
  _previous: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const actor = await currentActor();

  const territorios = formData
    .getAll('territorialUnitIds')
    .filter((valor): valor is string => typeof valor === 'string' && valor !== '');

  const entidad = textField(formData, 'legalEntityId');
  const vence = textField(formData, 'endsAt');

  const resultado = await assignRole(actor, {
    userId: textField(formData, 'userId'),
    roleCode: textField(formData, 'roleCode'),
    reason: textField(formData, 'reason'),
    territorialUnitIds: territorios,
    includesDescendants: textField(formData, 'includesDescendants') === 'si',
    ...(entidad === '' ? {} : { legalEntityId: entidad }),
    // El campo del formulario es una fecha; el caso de uso espera un instante.
    // Se toma el final del día para que «vence el 31» signifique que el 31
    // todavía se puede ejercer el cargo.
    ...(vence === '' ? {} : { endsAt: new Date(`${vence}T23:59:59.999Z`).toISOString() }),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/nombramientos');
  return { status: 'ok', message: 'Nombramiento registrado. Queda en la bitácora con el motivo que escribiste.' };
}

export async function revokeRoleAction(
  _previous: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const actor = await currentActor();

  const resultado = await revokeRole(actor, {
    assignmentId: textField(formData, 'assignmentId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/nombramientos');
  return {
    status: 'ok',
    message: resultado.data.revoked
      ? 'Nombramiento revocado. El historial se conserva: no se borra nada.'
      : 'Ese nombramiento ya estaba revocado.',
  };
}
