'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { inviteUserAction, type InviteFormState } from './actions';

const INICIAL: InviteFormState = { status: 'idle' };

/**
 * Invitación de una persona administradora.
 *
 * No hay autoservicio con privilegios: alguien con facultades invita, y la
 * persona invitada elige su propia contraseña mediante un enlace de un solo uso
 * (PRD §20.1). Quien invita nunca conoce esa contraseña.
 */
export function InviteForm({ territorios }: { territorios: readonly { value: string; label: string }[] }) {
  const [estado, accion, pendiente] = useActionState(inviteUserAction, INICIAL);

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo invitar'} />}
      {estado.status === 'ok' && (
        <SuccessNotice title={estado.message ?? 'Invitación enviada'}>
          {estado.invitationUrl !== undefined && (
            <p className="mt-2 break-all text-xs">
              Entorno de desarrollo: el correo no sale de esta máquina, de modo que el enlace se muestra aquí.
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
        hint="Ahí llegará el enlace para elegir su contraseña."
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

      <SubmitButton>{pendiente ? 'Enviando…' : 'Enviar invitación'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Enviando la invitación' : ''}
      </p>
    </form>
  );
}
