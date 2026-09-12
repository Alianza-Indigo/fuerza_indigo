'use server';

import { revalidatePath } from 'next/cache';
import { createAccountSetupLink, disableAccount, inviteUser, reenableAccount } from '@/modules/identity';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface InviteFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  /**
   * Enlace para establecer contraseña. Durante la puesta en marcha se devuelve
   * al panel; cuando `ACCOUNT_ACTIVATION_DELIVERY=email`, llega vacío porque se
   * entrega por correo a la persona destinataria.
   */
  readonly invitationUrl?: string;
}

export async function inviteUserAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await currentActor();
  const segundoApellido = textField(formData, 'secondFamilyName');
  const territorio = textField(formData, 'territorialUnitId');

  const resultado = await inviteUser(actor, {
    email: textField(formData, 'email'),
    givenName: textField(formData, 'givenName'),
    familyName: textField(formData, 'familyName'),
    ...(segundoApellido === '' ? {} : { secondFamilyName: segundoApellido }),
    ...(territorio === '' ? {} : { territorialUnitId: territorio }),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/personas');
  return {
    status: 'ok',
    message: 'Cuenta activa. Comparte el enlace de un solo uso para que la persona establezca su contraseña; es válido siete días.',
    ...(resultado.data.invitationUrl === '' ? {} : { invitationUrl: resultado.data.invitationUrl }),
  };
}

export interface SetupLinkFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly setupUrl?: string;
}

export async function createAccountSetupLinkAction(
  _previous: SetupLinkFormState,
  formData: FormData,
): Promise<SetupLinkFormState> {
  const actor = await currentActor();
  const resultado = await createAccountSetupLink(actor, { userId: textField(formData, 'userId') });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };

  revalidatePath('/gestion/personas');
  return {
    status: 'ok',
    message: 'Enlace generado. Caduca en siete días y solo puede utilizarse una vez.',
    setupUrl: resultado.data.setupUrl,
  };
}

export interface AccountFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Cierra o reabre una cuenta (defecto `D-F4-003`).
 *
 * Las dos operaciones comparten formulario porque comparten el único dato que
 * piden —el motivo— y porque en la pantalla nunca aparecen las dos a la vez: una
 * cuenta está abierta o cerrada.
 */
export async function accountLifecycleAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await currentActor();
  const userId = textField(formData, 'userId');
  const reason = textField(formData, 'reason');
  const reabrir = textField(formData, 'intent') === 'reabrir';

  const resultado = reabrir
    ? await reenableAccount(actor, { userId, reason })
    : await disableAccount(actor, { userId, reason });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/personas');
  return {
    status: 'ok',
    message: reabrir
      ? 'Cuenta reabierta. Sus nombramientos no volvieron: hay que otorgarlos de nuevo.'
      : `Cuenta cerrada. Se revocaron ${resultado.data.revokedSessions} sesiones y ${resultado.data.revokedAssignments} nombramientos.`,
  };
}
