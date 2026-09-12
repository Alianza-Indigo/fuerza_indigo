'use server';

import { revalidatePath } from 'next/cache';
import {
  activateInitialRules,
  draftRuleSet,
  editRuleDraft,
  putRulesInForce,
  CLAVES_DE_REGLA,
  FORMA_DE_REGLA,
} from '@/modules/governance';
import type { NormativeRules } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Actos sobre las reglas estatutarias.
 *
 * Lee del formulario **solo los umbrales que traen valor**. Un campo en blanco
 * no se manda como cero: se omite, y la versión queda incompleta a propósito
 * hasta que el estatuto aporte el número. Poner un cero donde falta un dato es
 * la forma más silenciosa de inventarlo.
 */

export interface RulesFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly missing?: readonly string[];
}

function leerReglasDelFormulario(formData: FormData): Partial<NormativeRules> {
  const reglas: Record<string, unknown> = {};

  for (const clave of CLAVES_DE_REGLA) {
    const forma = FORMA_DE_REGLA[clave];

    if (forma === 'booleano') {
      // Una casilla sin marcar no se envía. Se distingue «no» de «sin
      // contestar» con un campo oculto que siempre viaja.
      const presente = textField(formData, `presente_${clave}`) === 'si';
      if (presente) reglas[clave] = formData.get(clave) !== null;
      continue;
    }

    const bruto = textField(formData, clave).trim();
    if (bruto === '') continue;

    if (forma === 'entero') {
      const numero = Number.parseInt(bruto, 10);
      reglas[clave] = Number.isNaN(numero) ? bruto : numero;
    } else if (forma === 'porcentaje') {
      const numero = Number.parseFloat(bruto);
      reglas[clave] = Number.isNaN(numero) ? bruto : numero;
    } else {
      reglas[clave] = bruto;
    }
  }

  return reglas;
}

export async function draftRuleSetAction(_previous: RulesFormState, formData: FormData): Promise<RulesFormState> {
  const actor = await currentActor();

  const resultado = await draftRuleSet(actor, {
    version: textField(formData, 'version'),
    reason: textField(formData, 'reason'),
    rules: leerReglasDelFormulario(formData),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/reglas');
  return {
    status: 'ok',
    message:
      resultado.data.missing.length === 0
        ? 'Borrador redactado y completo. Ya puede ponerse en vigor con el acuerdo de la asamblea.'
        : 'Borrador redactado. Le faltan umbrales para poder entrar en vigor.',
    missing: resultado.data.missing,
  };
}

export async function editRuleDraftAction(_previous: RulesFormState, formData: FormData): Promise<RulesFormState> {
  const actor = await currentActor();

  const resultado = await editRuleDraft(actor, {
    ruleSetId: textField(formData, 'ruleSetId'),
    reason: textField(formData, 'reason'),
    rules: leerReglasDelFormulario(formData),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/reglas');
  return {
    status: 'ok',
    message: resultado.data.missing.length === 0 ? 'Borrador guardado y completo.' : 'Borrador guardado.',
    missing: resultado.data.missing,
  };
}

export async function putRulesInForceAction(_previous: RulesFormState, formData: FormData): Promise<RulesFormState> {
  const actor = await currentActor();

  const resultado = await putRulesInForce(actor, {
    ruleSetId: textField(formData, 'ruleSetId'),
    effectiveFrom: textField(formData, 'effectiveFrom'),
    approvedByResolutionId: textField(formData, 'approvedByResolutionId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/reglas');
  return {
    status: 'ok',
    message:
      resultado.data.supersededVersion === null
        ? `La versión ${resultado.data.version} está en vigor.`
        : `La versión ${resultado.data.version} está en vigor y supera a la ${resultado.data.supersededVersion}.`,
  };
}

export async function activateInitialRulesAction(
  _previous: RulesFormState,
  formData: FormData,
): Promise<RulesFormState> {
  const actor = await currentActor();
  const resultado = await activateInitialRules(actor, {
    ruleSetId: textField(formData, 'ruleSetId'),
    effectiveFrom: textField(formData, 'effectiveFrom'),
    foundingInstrumentReference: textField(formData, 'foundingInstrumentReference'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/reglas');
  revalidatePath('/superadmin');
  revalidatePath('/superadmin/puesta-en-marcha');
  return { status: 'ok', message: `La versión ${resultado.data.version} quedó en vigor como versión constitutiva inicial.` };
}
