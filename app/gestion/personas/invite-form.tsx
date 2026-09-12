'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { inviteUserAction, type InviteFormState } from './actions';

const INICIAL: InviteFormState = { status: 'idle' };

/**
 * Invitación de una persona administradora.
 *
 * La cuenta nace activa, pero sin contraseña no puede iniciar sesión. Durante
 * la puesta en marcha el enlace de un solo uso se entrega desde el panel.
 */
export function InviteForm({ territorios }: { territorios: readonly { value: string; label: string }[] }) {
  const [estado, accion, pendiente] = useActionState(inviteUserAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo invitar'} />}
      {estado.status === 'ok' && (
        <SuccessNotice title={estado.message ?? 'Cuenta creada'}>
          {estado.invitationUrl !== undefined && (
            <p className="mt-2 break-all text-xs">
              Copia y entrega este enlace únicamente a la persona titular de la cuenta.
              <br />
              <code>{estado.invitationUrl}</code>
            </p>
          )}
        </SuccessNotice>
      )}

      <Field
        name="givenName"
        label="Nombre"
        required
        autoComplete="off"
        errors={estado.fieldErrors?.['givenName']}
      />
      <Field
        name="familyName"
        label="Primer apellido"
        required
        autoComplete="off"
        errors={estado.fieldErrors?.['familyName']}
      />
      <Field
        name="secondFamilyName"
        label="Segundo apellido"
        hint="Opcional."
        autoComplete="off"
        errors={estado.fieldErrors?.['secondFamilyName']}
      />
      <Field
        name="email"
        label="Correo electrónico"
        type="email"
        required
        autoComplete="off"
        hint="Identifica la cuenta. Por ahora el enlace para establecer la contraseña se mostrará en este panel."
        errors={estado.fieldErrors?.['email']}
      />

      <div className="space-y-1.5">
        <label htmlFor="territorialUnitId" className="block text-sm font-medium">
          Unidad territorial
        </label>
        <p id="territorialUnitId-ayuda" className="text-sm text-[var(--color-ink-soft)]">
          Opcional. Es el dato de la persona, no su alcance de trabajo: eso lo define el nombramiento.
        </p>
        <select
          id="territorialUnitId"
          name="territorialUnitId"
          defaultValue=""
          aria-describedby="territorialUnitId-ayuda"
          className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
        >
          <option value="">Sin especificar</option>
          {territorios.map((territorio) => (
            <option key={territorio.value} value={territorio.value}>
              {territorio.label}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton>{pendiente ? 'Creando…' : 'Crear cuenta activa'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Creando la cuenta' : ''}
      </p>
    </form>
  );
}
