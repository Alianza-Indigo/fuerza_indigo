'use server';

import { requestPasswordReset, completePasswordReset } from '@/modules/identity';
import { requestContext } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface ResetFormState {
  readonly status: 'idle' | 'sent' | 'error' | 'done';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Solicitud de recuperación.
 *
 * Devuelve SIEMPRE el mismo estado, exista o no la cuenta. Es lo único que
 * impide usar esta pantalla para averiguar quién está registrado, dato
 * especialmente sensible en un padrón sindical (PRD §20.5).
 */
export async function requestResetAction(_previous: ResetFormState, formData: FormData): Promise<ResetFormState> {
  const context = await requestContext();
  const result = await requestPasswordReset(
    { email: textField(formData, 'email') },
    { correlationId: context.correlationId, ipHash: context.ipHash },
  );

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }
  return { status: 'sent' };
}

export async function completeResetAction(_previous: ResetFormState, formData: FormData): Promise<ResetFormState> {
  const context = await requestContext();
  const result = await completePasswordReset(
    {
      token: textField(formData, 'token'),
      password: textField(formData, 'password'),
      passwordConfirmation: textField(formData, 'passwordConfirmation'),
    },
    { correlationId: context.correlationId, ipHash: context.ipHash },
  );

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }
  return { status: 'done' };
}
