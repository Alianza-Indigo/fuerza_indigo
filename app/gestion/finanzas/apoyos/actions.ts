'use server';

import { revalidatePath } from 'next/cache';
import { approveScholarship, grantDiscount, revokeDiscount, revokeScholarship } from '@/modules/billing';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de descuentos y becas.
 *
 * Las cuatro exigen motivo escrito. Otorgar un descuento o una beca es decidir
 * a qué ingreso renuncia la organización, y retirarlos es quitarle algo a
 * alguien: las dos cosas se explican, no se hacen y ya.
 */

export interface ApoyosState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): ApoyosState {
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

export async function grantDiscountAction(_previo: ApoyosState, formData: FormData): Promise<ApoyosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const conceptos = formData
    .getAll('productIds')
    .filter((valor): valor is string => typeof valor === 'string' && valor !== '');

  const resultado = await grantDiscount(actor, {
    name: textField(formData, 'name'),
    legalEntityId: textField(formData, 'legalEntityId'),
    kind: textField(formData, 'kind') as never,
    currency: (opcional(formData, 'currency') ?? 'MXN') as never,
    productIds: conceptos,
    validFrom: textField(formData, 'validFrom'),
    ...(opcional(formData, 'code') === undefined ? {} : { code: opcional(formData, 'code') }),
    ...(opcional(formData, 'value') === undefined ? {} : { value: opcional(formData, 'value') }),
    ...(opcional(formData, 'maxRedemptions') === undefined
      ? {}
      : { maxRedemptions: opcional(formData, 'maxRedemptions') }),
    ...(opcional(formData, 'validTo') === undefined ? {} : { validTo: opcional(formData, 'validTo') }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/apoyos');
  return { status: 'ok', message: 'Descuento otorgado. Ya rebaja lo que se cobra por los conceptos alcanzados.' };
}

export async function revokeDiscountAction(_previo: ApoyosState, formData: FormData): Promise<ApoyosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await revokeDiscount(actor, {
    discountGrantId: textField(formData, 'discountGrantId'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/apoyos');
  return { status: 'ok', message: 'Retirado. Los cobros que ya lo usaron siguen apuntando a él.' };
}

export async function approveScholarshipAction(_previo: ApoyosState, formData: FormData): Promise<ApoyosState> {
  const justificacion = textField(formData, 'justification');
  const actor = withReason(await currentActor(), 'aprobación de beca');

  const evidencias = formData
    .getAll('evidenceFileIds')
    .filter((valor): valor is string => typeof valor === 'string' && valor !== '');

  const resultado = await approveScholarship(actor, {
    personId: textField(formData, 'personId'),
    legalEntityId: textField(formData, 'legalEntityId'),
    programKind: textField(formData, 'programKind') as never,
    coveragePercent: textField(formData, 'coveragePercent'),
    justification: justificacion,
    evidenceFileIds: evidencias,
    validFrom: textField(formData, 'validFrom'),
    ...(opcional(formData, 'validTo') === undefined ? {} : { validTo: opcional(formData, 'validTo') }),
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/apoyos');
  return { status: 'ok', message: 'Beca aprobada. Ya rebaja lo que se le cobra a esa persona.' };
}

export async function revokeScholarshipAction(_previo: ApoyosState, formData: FormData): Promise<ApoyosState> {
  const motivo = textField(formData, 'reason');
  const actor = withReason(await currentActor(), motivo);

  const resultado = await revokeScholarship(actor, {
    scholarshipId: textField(formData, 'scholarshipId'),
    reason: motivo,
  });

  if (!resultado.ok) return fallo(resultado.error);

  revalidatePath('/gestion/finanzas/apoyos');
  return { status: 'ok', message: 'Beca retirada. Queda en el expediente con su motivo.' };
}
