'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { withdrawApplicationAction, type RetiroFormState } from '../actions';

const INICIAL: RetiroFormState = { status: 'idle' };

/**
 * Retiro de la solicitud propia.
 *
 * Se pide un motivo, y no para justificarse ante nadie: la organización necesita
 * saber si la gente se está yendo porque el trámite es difícil o porque cambió
 * de idea, y esa diferencia no se adivina.
 */
export function WithdrawForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(withdrawApplicationAction, INICIAL);

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Solicitud retirada'} />;
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      <TextArea
        name="reason"
        label="Por qué retiras la solicitud"
        required
        rows={3}
        hint="Con una frase basta. Nos sirve para saber si el trámite está siendo difícil."
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar la solicitud'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Retirando la solicitud' : ''}
      </p>
    </form>
  );
}
