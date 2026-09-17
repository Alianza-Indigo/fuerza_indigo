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
        {/*
          Una sola puerta, y a propósito. Quien nunca llegó a crear su
          contraseña —porque cerró la pestaña, porque el enlace venció, porque
          nunca le llegó— no se reconoce en «olvidé mi contraseña» y se queda
          fuera creyendo que no hay nada para él. El flujo de recuperación ya
          sirve para los dos casos: crea la credencial exista o no una previa.
          Lo que faltaba era decirlo.
        */}
        <Link href="/recuperar" className="text-sm underline underline-offset-4">
          No puedo entrar
        </Link>
      </div>

      <p aria-live="polite" className="sr-only">
        {pending ? 'Verificando tus datos' : ''}
      </p>
    </form>
  );
}
