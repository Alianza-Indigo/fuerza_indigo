'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { answerClarificationAction, type AclaracionFormState } from '../actions';

const INICIAL: AclaracionFormState = { status: 'idle' };

/**
 * Respuesta a una aclaración (PRD §8.1, paso 10).
 *
 * Contestar aquí devuelve la solicitud a revisión, también si el plazo ya pasó.
 * El formulario sigue estando cuando el plazo vence, y no desaparece: quitarlo
 * sería decirle a la persona que ya no puede hacer nada, que es falso.
 */
export function ClarificationForm({
  clarificationId,
  applicationId,
  vencido,
}: {
  clarificationId: string;
  applicationId: string;
  vencido: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(answerClarificationAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Respuesta recibida'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="clarificationId" value={clarificationId} />
      <input type="hidden" name="applicationId" value={applicationId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo enviar'} />}

      <TextArea
        name="answer"
        label="Tu respuesta"
        required
        rows={6}
        hint={
          vencido
            ? 'El plazo ya pasó y puedes contestar igual: tu solicitud sigue en pie.'
            : 'Con tus palabras. Si además hace falta un documento, adjúntalo abajo.'
        }
        defaultValue={estado.values?.['answer']}
        errors={estado.fieldErrors?.['answer']}
      />

      <SubmitButton>{pendiente ? 'Enviando…' : 'Enviar mi respuesta'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Enviando la respuesta' : ''}</p>
    </form>
  );
}
