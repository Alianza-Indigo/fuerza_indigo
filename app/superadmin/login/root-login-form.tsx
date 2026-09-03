'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton } from '@/design-system/primitives';
import { rootLoginAction, type RootLoginState } from './actions';

const INITIAL: RootLoginState = { status: 'idle' };

export function RootLoginForm() {
  const [state, formAction, pending] = useActionState(rootLoginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && (
        <ErrorNotice title={state.message ?? 'No se pudo iniciar sesión.'}>
          {state.retryAfterSeconds !== undefined && (
            <p>Vuelve a intentarlo en {Math.ceil(state.retryAfterSeconds / 60)} minutos.</p>
          )}
        </ErrorNotice>
      )}
      <Field name="email" label="Correo del Superadmin" type="email" required autoComplete="username" />
      <Field name="password" label="Contraseña" type="password" required autoComplete="current-password" />
      <SubmitButton>{pending ? 'Verificando…' : 'Entrar'}</SubmitButton>
    </form>
  );
}
