'use server';

import { redirect } from 'next/navigation';
import { openBillingPortal, startCheckout } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Ir a pagar y volver.
 *
 * La redirección a la pasarela se hace desde el servidor y no desde el
 * navegador: así la dirección de la sesión de cobro no llega a existir en el
 * cliente, y no queda en el historial ni se puede compartir por accidente.
 */

export interface PagoState {
  readonly status: 'idle' | 'error';
  readonly message?: string;
}

export async function startCheckoutAction(_previo: PagoState, formData: FormData): Promise<PagoState> {
  const actor = await currentActor();

  const resultado = await startCheckout(actor, {
    productId: textField(formData, 'productId'),
    returnPath: '/mi/pagos',
  });

  if (!resultado.ok) return { status: 'error', message: resultado.error.message };

  redirect(resultado.data.url);
}

export async function openPortalAction(_previo: PagoState, formData: FormData): Promise<PagoState> {
  const actor = await currentActor();

  const resultado = await openBillingPortal(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    returnPath: '/mi/pagos',
  });

  if (!resultado.ok) return { status: 'error', message: resultado.error.message };

  redirect(resultado.data.url);
}
