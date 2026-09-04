'use server';

import { revalidatePath } from 'next/cache';
import {
  approveManualPayment,
  approveRefund,
  registerManualPayment,
  rejectManualPayment,
  rejectRefund,
  requestRefund,
} from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de pagos manuales y devoluciones.
 *
 * Todas exigen motivo escrito porque sus permisos lo exigen: mover dinero fuera
 * de la pasarela y devolverlo son actos críticos, y el motivo es lo que después
 * explica el movimiento a quien revise las cuentas.
 */

export interface PagosState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): PagosState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

function refrescar(): void {
  revalidatePath('/gestion/finanzas/pagos');
}

export async function registerManualPaymentAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await registerManualPayment(actor, {
    billingAccountId: textField(formData, 'billingAccountId'),
    amount: textField(formData, 'amount'),
    currency: textField(formData, 'currency') as never,
    method: textField(formData, 'method') as never,
    evidenceFileId: textField(formData, 'evidenceFileId'),
    receivedAt: textField(formData, 'receivedAt'),
    ...(motivo === '' ? {} : { note: motivo }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return {
    status: 'ok',
    message: `Registrado con la referencia ${resultado.data.publicId}. Queda pendiente hasta que otra persona lo apruebe.`,
  };
}

export async function approveManualPaymentAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await approveManualPayment(actor, {
    paymentId: textField(formData, 'paymentId'),
    ...(motivo === '' ? {} : { note: motivo }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Aprobado. El pago ya cuenta.' };
}

export async function rejectManualPaymentAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await rejectManualPayment(actor, {
    paymentId: textField(formData, 'paymentId'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Rechazado. Queda registrado con su motivo.' };
}

export async function requestRefundAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);
  const importe = textField(formData, 'amount').trim();

  const resultado = await requestRefund(actor, {
    paymentId: textField(formData, 'paymentId'),
    reason: motivo,
    ...(importe === '' ? {} : { amount: importe }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Solicitada. La tiene que aprobar otra persona.' };
}

export async function approveRefundAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await approveRefund(actor, {
    refundId: textField(formData, 'refundId'),
    ...(motivo === '' ? {} : { note: motivo }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Aprobada y ejecutada.' };
}

export async function rejectRefundAction(_previo: PagosState, formData: FormData): Promise<PagosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await rejectRefund(actor, {
    refundId: textField(formData, 'refundId'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Rechazada. Queda registrada con su motivo.' };
}
