'use server';

import { revalidatePath } from 'next/cache';
import { createMembershipType, updateMembershipType } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Administración del catálogo de calidades (PRD §3.2, §3.3).
 *
 * La categoría y los derechos políticos solo se fijan al crear. Editarlos
 * después convertiría una calidad honoraria en sindical de golpe, para todas
 * las membresías vivas de ese tipo y hacia atrás.
 */

export interface CalidadFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

const CAMPOS = [
  'code',
  'name',
  'category',
  'legalEntityId',
  'benefitsSummary',
  'catalogProductId',
  'durationMonths',
  'effectiveFrom',
  'effectiveTo',
] as const;

function loEscrito(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = textField(formData, campo);
  for (const casilla of [
    'grantsPoliticalRights',
    'countsForQuorum',
    'appearsInAuthorityRoster',
    'requiresHumanReview',
    'requiresPayment',
    'renewable',
    'isActive',
  ]) {
    valores[casilla] = formData.get(casilla) === null ? '' : 'si';
  }
  return valores;
}

const marcada = (formData: FormData, nombre: string): boolean => formData.get(nombre) !== null;

const opcionalTexto = (formData: FormData, nombre: string): string | null => {
  const valor = textField(formData, nombre);
  return valor === '' ? null : valor;
};

const opcionalNumero = (formData: FormData, nombre: string): number | null => {
  const valor = textField(formData, nombre);
  return valor === '' ? null : Number(valor);
};

export async function createMembershipTypeAction(
  _previous: CalidadFormState,
  formData: FormData,
): Promise<CalidadFormState> {
  const actor = await currentActor();
  const resultado = await createMembershipType(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    category: textField(formData, 'category') as 'UNION_MEMBER' | 'HONORARY_AFFILIATE',
    legalEntityId: textField(formData, 'legalEntityId'),
    benefitsSummary: textField(formData, 'benefitsSummary'),
    grantsPoliticalRights: marcada(formData, 'grantsPoliticalRights'),
    countsForQuorum: marcada(formData, 'countsForQuorum'),
    appearsInAuthorityRoster: marcada(formData, 'appearsInAuthorityRoster'),
    requiresHumanReview: marcada(formData, 'requiresHumanReview'),
    requiresPayment: marcada(formData, 'requiresPayment'),
    renewable: marcada(formData, 'renewable'),
    isActive: marcada(formData, 'isActive'),
    catalogProductId: opcionalTexto(formData, 'catalogProductId'),
    durationMonths: opcionalNumero(formData, 'durationMonths'),
    effectiveFrom: textField(formData, 'effectiveFrom'),
    effectiveTo: opcionalTexto(formData, 'effectiveTo'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/calidades');
  return { status: 'ok', message: `Calidad ${resultado.data.code} creada.` };
}

export async function updateMembershipTypeAction(
  _previous: CalidadFormState,
  formData: FormData,
): Promise<CalidadFormState> {
  const actor = await currentActor();
  const membershipTypeId = textField(formData, 'membershipTypeId');
  const resultado = await updateMembershipType(actor, {
    membershipTypeId,
    name: textField(formData, 'name'),
    benefitsSummary: textField(formData, 'benefitsSummary'),
    requiresHumanReview: marcada(formData, 'requiresHumanReview'),
    requiresPayment: marcada(formData, 'requiresPayment'),
    renewable: marcada(formData, 'renewable'),
    isActive: marcada(formData, 'isActive'),
    catalogProductId: opcionalTexto(formData, 'catalogProductId'),
    durationMonths: opcionalNumero(formData, 'durationMonths'),
    effectiveFrom: textField(formData, 'effectiveFrom'),
    effectiveTo: opcionalTexto(formData, 'effectiveTo'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/calidades');
  revalidatePath(`/gestion/afiliacion/calidades/${membershipTypeId}`);
  return { status: 'ok', message: 'Calidad actualizada.' };
}
