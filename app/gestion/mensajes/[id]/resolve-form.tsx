'use client';

import { useActionState } from 'react';
import { ErrorNotice, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { resolveRequestAction, type RequestState } from '../actions';

const INICIAL: RequestState = { status: 'idle' };

/**
 * Cierre de un mensaje, con nota obligatoria.
 *
 * La nota no es burocracia: «atendido» sin decir cómo no le sirve a quien
 * retome el asunto dentro de seis meses, y descartar sin motivo escrito es el
 * acto que después nadie sabe explicar.
 */
export function ResolveForm({ requestId }: { requestId: string }) {
  const [estado, accion, pendiente] = useActionState(resolveRequestAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Registrado'} />;
  }

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}

      <input type="hidden" name="requestId" value={requestId} />

      <RadioGroup
        name="decision"
        legend="¿Qué hiciste con este mensaje?"
        options={[
          {
            value: 'ATENDER',
            label: 'Me hice cargo',
            hint: 'Contestaste, canalizaste o abriste lo que corresponda.',
          },
          {
            value: 'DESCARTAR',
            label: 'Lo descarto',
            hint: 'Correo inexistente, mensaje sin contenido o duplicado exacto de otro.',
          },
        ]}
        value="ATENDER"
        {...(errores['decision'] === undefined ? {} : { errors: errores['decision'] })}
      />

      <TextArea
        name="note"
        label="¿Qué hiciste, en concreto?"
        hint="Lo lee quien retome el asunto. No se le muestra a quien escribió."
        required
        rows={4}
        maxLength={1000}
        {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
      />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Registrando' : ''}
      </p>
    </form>
  );
}
