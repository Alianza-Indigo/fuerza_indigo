'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { accountLifecycleAction, type AccountFormState } from './actions';

const INICIAL: AccountFormState = { status: 'idle' };

/**
 * Cierre y reapertura de una cuenta (PRD §4.3, defecto `D-F4-003`).
 *
 * Cerrar no borra: la fila queda con su historial y su auditoría. Lo que se
 * acaba es el acceso, y con él los nombramientos vivos, porque un cargo sin
 * persona que pueda ejercerlo no es un cargo.
 */
export function AccountForm({
  userId,
  displayName,
  cerrada,
}: {
  userId: string;
  displayName: string;
  cerrada: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(accountLifecycleAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={cerrada ? 'reabrir' : 'cerrar'} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo hacer'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Hecho'} />}

      <TextArea
        name="reason"
        label={cerrada ? `Por qué se reabre la cuenta de ${displayName}` : `Por qué se cierra la cuenta de ${displayName}`}
        required
        rows={2}
        hint={
          cerrada
            ? 'Mínimo quince caracteres. Los nombramientos no vuelven solos: hay que otorgarlos de nuevo.'
            : 'Mínimo quince caracteres. Se revocan sus sesiones y sus nombramientos vivos.'
        }
        errors={estado.fieldErrors?.['reason']}
      />

      <SubmitButton variant={cerrada ? 'secondary' : 'danger'}>
        {pendiente ? 'Guardando…' : cerrada ? 'Reabrir la cuenta' : 'Cerrar la cuenta'}
      </SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando' : ''}
      </p>
    </form>
  );
}
