'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import {
  grantOwnConsentAction,
  revokeOwnConsentAction,
  type ConsentimientoState,
} from './actions';

const INICIAL: ConsentimientoState = { status: 'idle' };

/**
 * Aceptar un texto para un propósito concreto.
 *
 * Un botón por propósito, y no una casilla con once opciones: el PRD §7.3 exige
 * que el consentimiento sea granular, y una sola casilla que abarque varios
 * propósitos es exactamente el consentimiento genérico que la regla prohíbe.
 */
export function GrantForm({
  consentVersionId,
  purpose,
  etiqueta,
}: {
  consentVersionId: string;
  purpose: string;
  etiqueta: string;
}) {
  const [estado, accion, pendiente] = useActionState(grantOwnConsentAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Consentimiento registrado'} />;

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="consentVersionId" value={consentVersionId} />
      <input type="hidden" name="purpose" value={purpose} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo registrar'} />}
      <SubmitButton>{pendiente ? 'Registrando…' : `Acepto para: ${etiqueta}`}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Registrando' : ''}</p>
    </form>
  );
}

/**
 * Retirarlo.
 *
 * Pide un motivo porque el motivo es de la persona y queda escrito: si mañana
 * alguien pregunta por qué se dejó de tratar un dato, la respuesta está en sus
 * palabras y no en una casilla desmarcada.
 */
export function RevokeForm({ consentId }: { consentId: string }) {
  const [estado, accion, pendiente] = useActionState(revokeOwnConsentAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Consentimiento retirado'} />;

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="consentId" value={consentId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      <TextArea
        name="reason"
        label="Por qué lo retiras"
        required
        rows={2}
        hint="Con una frase basta. Queda registrado en tus palabras."
        defaultValue={estado.values?.['reason']}
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar este consentimiento'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Retirando' : ''}</p>
    </form>
  );
}
