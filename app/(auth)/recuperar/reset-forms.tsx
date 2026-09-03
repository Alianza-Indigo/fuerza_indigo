'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Field, ErrorNotice, SuccessNotice, SubmitButton } from '@/design-system/primitives';
import { requestResetAction, completeResetAction, type ResetFormState } from './actions';

const INITIAL: ResetFormState = { status: 'idle' };

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestResetAction, INITIAL);

  if (state.status === 'sent') {
    return (
      <SuccessNotice title="Revisa tu correo">
        <p>
          Si ese correo corresponde a una cuenta, te enviamos un enlace para elegir una contraseña nueva. El
          enlace caduca en una hora y solo se puede usar una vez.
        </p>
        <p className="mt-2">
          <Link href="/acceso" className="underline underline-offset-4">
            Volver a iniciar sesión
          </Link>
        </p>
      </SuccessNotice>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo procesar la solicitud.'} />}
      <Field
        name="email"
        label="Correo electrónico"
        type="email"
        required
        autoComplete="username"
        hint="Te enviaremos un enlace para elegir una contraseña nueva."
        errors={state.fieldErrors?.['email']}
      />
      <SubmitButton>{pending ? 'Enviando…' : 'Enviar enlace'}</SubmitButton>
    </form>
  );
}

export function CompleteResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(completeResetAction, INITIAL);

  if (state.status === 'done') {
    return (
      <SuccessNotice title="Tu contraseña quedó actualizada">
        <p>Cerramos todas tus sesiones abiertas por seguridad. Ya puedes entrar con la contraseña nueva.</p>
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
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo cambiar la contraseña.'} />}
      <Field
        name="password"
        label="Contraseña nueva"
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
      <SubmitButton>{pending ? 'Guardando…' : 'Guardar contraseña'}</SubmitButton>
    </form>
  );
}
