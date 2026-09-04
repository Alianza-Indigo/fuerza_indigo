'use server';

import { revalidatePath } from 'next/cache';
import { moveAsset, registerAsset } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';

/** Acciones del registro patrimonial. */

export interface PatrimonioState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): PatrimonioState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

function opcional(formData: FormData, name: string): string | undefined {
  const valor = textField(formData, name).trim();
  return valor === '' ? undefined : valor;
}

export async function registerAssetAction(_previo: PatrimonioState, formData: FormData): Promise<PatrimonioState> {
  const actor = withReason(await currentActor(), 'alta en el registro patrimonial');

  const resultado = await registerAsset(actor, {
    legalEntityId: textField(formData, 'legalEntityId'),
    assetKind: textField(formData, 'assetKind') as never,
    name: textField(formData, 'name'),
    description: textField(formData, 'description'),
    acquisitionMode: textField(formData, 'acquisitionMode') as never,
    acquiredOn: textField(formData, 'acquiredOn'),
    documentedValue: textField(formData, 'documentedValue'),
    currency: textField(formData, 'currency') as never,
    ...(opcional(formData, 'location') === undefined ? {} : { location: opcional(formData, 'location') }),
    ...(opcional(formData, 'custodianPersonId') === undefined
      ? {}
      : { custodianPersonId: opcional(formData, 'custodianPersonId') }),
    ...(opcional(formData, 'authorizingResolutionNote') === undefined
      ? {}
      : { authorizingResolutionNote: opcional(formData, 'authorizingResolutionNote') }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/patrimonio');
  return { status: 'ok', message: 'Registrado, con su alta como primer movimiento de su historia.' };
}

export async function moveAssetAction(_previo: PatrimonioState, formData: FormData): Promise<PatrimonioState> {
  const acuerdo = opcional(formData, 'authorizingResolutionNote');
  const actor = withReason(await currentActor(), acuerdo ?? 'movimiento patrimonial');

  const evidencias = formData
    .getAll('evidenceFileIds')
    .filter((valor): valor is string => typeof valor === 'string' && valor.trim() !== '');

  const resultado = await moveAsset(actor, {
    assetId: textField(formData, 'assetId'),
    movementKind: textField(formData, 'movementKind') as never,
    occurredOn: textField(formData, 'occurredOn'),
    evidenceFileIds: evidencias,
    ...(opcional(formData, 'toCustodianPersonId') === undefined
      ? {}
      : { toCustodianPersonId: opcional(formData, 'toCustodianPersonId') }),
    ...(opcional(formData, 'amount') === undefined ? {} : { amount: opcional(formData, 'amount') }),
    ...(acuerdo === undefined ? {} : { authorizingResolutionNote: acuerdo }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/patrimonio');
  return { status: 'ok', message: 'Movimiento registrado. La historia del bien no se reescribe: se le añade.' };
}
