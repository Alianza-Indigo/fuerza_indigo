'use server';

import { revalidatePath } from 'next/cache';
import { endMembership, reinstateMembership, suspendMembership } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Cambios de estado de una membresía (PRD §3.6).
 *
 * Los tres exigen motivo escrito, y el motivo viaja como la razón del acto: el
 * motor lo pide para las facultades críticas y la bitácora lo conserva. Un
 * cambio de estado sin motivo no se puede explicar el día que alguien pregunte
 * por qué dejó de ser miembro.
 */

export interface MembresiaState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

function conError(
  error: { message: string; details?: Record<string, string[]> | undefined },
  values: Record<string, string>,
): MembresiaState {
  return {
    status: 'error',
    message: error.message,
    values,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

export async function suspendMembershipAction(
  _previous: MembresiaState,
  formData: FormData,
): Promise<MembresiaState> {
  const actor = await currentActor();
  const membershipId = textField(formData, 'membershipId');
  const values = { reason: textField(formData, 'reason') };

  const resultado = await suspendMembership(actor, { membershipId, ...values });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/membresias/${membershipId}`);
  return { status: 'ok', message: 'Membresía suspendida. La persona sigue en el registro.' };
}

export async function reinstateMembershipAction(
  _previous: MembresiaState,
  formData: FormData,
): Promise<MembresiaState> {
  const actor = await currentActor();
  const membershipId = textField(formData, 'membershipId');
  const values = { reason: textField(formData, 'reason') };

  const resultado = await reinstateMembership(actor, { membershipId, ...values });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/membresias/${membershipId}`);
  return { status: 'ok', message: 'Suspensión levantada.' };
}

export async function endMembershipAction(
  _previous: MembresiaState,
  formData: FormData,
): Promise<MembresiaState> {
  const actor = await currentActor();
  const membershipId = textField(formData, 'membershipId');
  const values = {
    endReason: textField(formData, 'endReason'),
    reason: textField(formData, 'reason'),
  };

  const resultado = await endMembership(actor, {
    membershipId,
    endReason: values.endReason as 'VOLUNTARY_WITHDRAWAL',
    reason: values.reason,
  });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/membresias/${membershipId}`);
  return { status: 'ok', message: 'Membresía terminada. El historial queda entero.' };
}
