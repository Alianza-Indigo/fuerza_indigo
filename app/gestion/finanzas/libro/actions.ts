'use server';

import { revalidatePath } from 'next/cache';
import { closeReconciliation, postAdjustment, reverseEntry, runReconciliation } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones del libro auxiliar y de la conciliación.
 *
 * Ninguna edita nada: asentar un ajuste y revertir un asiento crean filas
 * nuevas, y conciliar solo calcula y enlaza. El libro no se reescribe.
 */

export interface LibroState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): LibroState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

function refrescar(): void {
  revalidatePath('/gestion/finanzas/libro');
}

export async function postAdjustmentAction(_previo: LibroState, formData: FormData): Promise<LibroState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await postAdjustment(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    entryDate: textField(formData, 'entryDate'),
    direction: textField(formData, 'direction') as never,
    accountCode: textField(formData, 'accountCode') as never,
    amount: textField(formData, 'amount'),
    currency: textField(formData, 'currency') as never,
    description: textField(formData, 'description'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Asentado. El libro no se edita: este es un asiento nuevo.' };
}

export async function reverseEntryAction(_previo: LibroState, formData: FormData): Promise<LibroState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await reverseEntry(actor, {
    entryId: textField(formData, 'entryId'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Revertido con un asiento nuevo. El original sigue donde estaba.' };
}

export async function runReconciliationAction(_previo: LibroState, formData: FormData): Promise<LibroState> {
  const actor = withReason(await currentActor(), 'corte de conciliación');

  const resultado = await runReconciliation(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    periodStart: textField(formData, 'periodStart'),
    periodEnd: textField(formData, 'periodEnd'),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return {
    status: 'ok',
    message:
      resultado.data.differenceMinor === 0n
        ? 'El periodo cuadra: lo que el libro dice es lo que la pasarela confirmó.'
        : `Hay diferencias, y están nombradas una por una: ${String(resultado.data.exceptions)} en total.`,
  };
}

export async function closeReconciliationAction(_previo: LibroState, formData: FormData): Promise<LibroState> {
  const nota = textField(formData, 'note');
  const actor = withReason(await currentActor(), 'cierre de corte');

  const resultado = await closeReconciliation(actor, {
    reconciliationId: textField(formData, 'reconciliationId'),
    ...(nota === '' ? {} : { note: nota }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  refrescar();
  return { status: 'ok', message: 'Corte cerrado. Sus asientos ya no se corrigen dentro de este periodo.' };
}
