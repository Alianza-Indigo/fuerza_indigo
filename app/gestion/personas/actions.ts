'use server';

import { revalidatePath } from 'next/cache';
import { inviteUser } from '@/modules/identity';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface InviteFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  /**
   * Enlace de activación.
   *
   * Solo se devuelve cuando el proveedor de correo es la consola, es decir en
   * desarrollo. En cualquier otro caso la invitación llega por correo y este
   * campo queda vacío: mostrar el enlace en pantalla lo dejaría en el historial
   * del navegador de quien invita, que no es su destinataria.
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
    message: 'Invitación enviada. La persona elige su contraseña con un enlace de un solo uso, válido siete días.',
    ...(resultado.data.invitationUrl === '' ? {} : { invitationUrl: resultado.data.invitationUrl }),
  };
}
