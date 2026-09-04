'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton } from '@/design-system/primitives';
import { openPortalAction, startCheckoutAction, type PagoState } from './actions';

const INICIAL: PagoState = { status: 'idle' };

/**
 * Botón de pago.
 *
 * Un formulario y no un enlace: pagar cambia el estado del sistema —abre una
 * intención de cobro— y eso no se hace con una petición que un navegador puede
 * repetir al recargar o al precargar el enlace.
 */
export function PayButton({ productId, label }: { productId: string; label: string }) {
  const [estado, accion, pendiente] = useActionState(startCheckoutAction, INICIAL);

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <SubmitButton>{pendiente ? 'Abriendo el pago…' : label}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Abriendo la página de pago' : ''}
      </p>
    </form>
  );
}

/** Entrada al portal de cliente, donde se cambia la tarjeta y se cancela. */
export function PortalButton({ legalEntityId, label }: { legalEntityId: string; label: string }) {
  const [estado, accion, pendiente] = useActionState(openPortalAction, INICIAL);

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="legalEntityId" value={legalEntityId} />
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <SubmitButton variant="secondary">{pendiente ? 'Abriendo…' : label}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Abriendo el portal de pagos' : ''}
      </p>
    </form>
  );
}
