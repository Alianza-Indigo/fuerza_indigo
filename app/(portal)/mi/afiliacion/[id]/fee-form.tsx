'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton } from '@/design-system/primitives';
import { payApplicationFeeAction, type CuotaFormState } from '../actions';

const INICIAL: CuotaFormState = { status: 'idle' };

/**
 * Pagar la cuota de inscripción (PRD §8.1 paso 12).
 *
 * No hay aviso de éxito porque no hay vuelta: la acción redirige a la pasarela.
 * Lo que sí hay es el aviso de que volver del navegador no activa nada —el
 * cobro lo confirma el webhook firmado (PRD §11.4)—, dicho antes de ir y no
 * después, cuando alguien ya está esperando que pase algo.
 */
export function FeeForm({
  applicationId,
  productId,
  productName,
}: {
  applicationId: string;
  productId: string;
  productName: string;
}) {
  const [estado, accion, pendiente] = useActionState(payApplicationFeeAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="productId" value={productId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo abrir el cobro'} />}

      <p>
        Concepto: <strong>{productName}</strong>
      </p>
      <p className="text-sm text-[var(--color-ink-soft)]">
        Vas a salir a la pasarela de pago. Tu membresía se activa cuando el pago queda confirmado, no al
        volver del navegador: si tarda un momento en aparecer, no lo pagues dos veces.
      </p>

      <SubmitButton>{pendiente ? 'Abriendo el cobro…' : 'Pagar mi cuota de inscripción'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Abriendo el cobro' : ''}</p>
    </form>
  );
}
