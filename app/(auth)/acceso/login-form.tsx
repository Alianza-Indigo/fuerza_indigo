'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, ErrorNotice, SubmitButton } from '@/design-system/primitives';
import { loginAction, type AuthFormState } from './actions';

const INITIAL: AuthFormState = { status: 'idle' };

/**
 * Formulario de acceso.
 *
 * Es un componente cliente únicamente porque necesita mostrar el resultado de
 * la acción junto a los campos. Sin JavaScript sigue funcionando: el `<form>`
 * envía al servidor igual (PRD §17.1).
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && (
        <ErrorNotice title={state.message ?? 'No se pudo iniciar sesión.'}>
          {state.retryAfterSeconds !== undefined && (
            <p>
              Vuelve a intentarlo en {Math.ceil(state.retryAfterSeconds / 60)} minutos. Si no reconoces estos
              intentos, cambia tu contraseña en cuanto puedas entrar.
            </p>
          )}
        </ErrorNotice>
      )}

      <Field
        name="email"
        label="Correo electrónico"
        type="email"
        required
        autoComplete="username"
        errors={state.fieldErrors?.['email']}
      />

      <Field
        name="password"
        label="Contraseña"
        type="password"
        required
        autoComplete="current-password"
        errors={state.fieldErrors?.['password']}
      />

      <div className="flex items-center justify-between gap-4">
        <SubmitButton>{pending ? 'Entrando…' : 'Entrar'}</SubmitButton>
        <Link href="/recuperar" className="text-sm underline underline-offset-4">
          Olvidé mi contraseña
        </Link>
      </div>

      <p aria-live="polite" className="sr-only">
        {pending ? 'Verificando tus datos' : ''}
      </p>
    </form>
  );
}
