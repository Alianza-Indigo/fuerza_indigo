'use server';

import { activateAccount } from '@/modules/identity';
import { requestContext } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface ActivationState {
  readonly status: 'idle' | 'error' | 'done';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function activateAction(_previous: ActivationState, formData: FormData): Promise<ActivationState> {
  const context = await requestContext();
  const result = await activateAccount(
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
