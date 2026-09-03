'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Field, ErrorNotice, SuccessNotice, SubmitButton } from '@/design-system/primitives';
import { activateAction, type ActivationState } from './actions';

const INITIAL: ActivationState = { status: 'idle' };

export function ActivationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(activateAction, INITIAL);

  if (state.status === 'done') {
    return (
      <SuccessNotice title="Tu cuenta quedó activa">
        <p>Ya puedes entrar con tu correo y la contraseña que acabas de elegir.</p>
        <p className="mt-2">
          <Link href="/acceso" className="underline underline-offset-4">
            Iniciar sesión
          </Link>
        </p>
      </SuccessNotice>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.status === 'error' && (
        <ErrorNotice title={state.message ?? 'No se pudo activar la cuenta.'}>
          <p>Si la invitación caducó, pide a quien te invitó que te la envíe de nuevo.</p>
        </ErrorNotice>
      )}
      <Field
        name="password"
        label="Elige tu contraseña"
        type="password"
        required
        autoComplete="new-password"
        hint="Al menos 12 caracteres. Una frase que recuerdes es más segura que una palabra corta con símbolos."
        errors={state.fieldErrors?.['password']}
      />
      <Field
        name="passwordConfirmation"
        label="Repite la contraseña"
        type="password"
        required
        autoComplete="new-password"
        errors={state.fieldErrors?.['passwordConfirmation']}
      />
      <SubmitButton>{pending ? 'Activando…' : 'Activar mi cuenta'}</SubmitButton>
    </form>
  );
}
