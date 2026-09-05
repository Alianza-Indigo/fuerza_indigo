'use server';

import { revalidatePath } from 'next/cache';
import { draftConsentVersion, publishConsentVersion, retireConsentVersion } from '@/platform/consent';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';
import { CODIGOS_DE_PROPOSITO } from './etiquetas';

/**
 * Administración de avisos y consentimientos versionados (defecto `D-F4-001`).
 *
 * Sin esta pantalla, la semilla dejaba los avisos en borrador y nada podía
 * publicarlos: el formulario público de contacto se negaba a recabar datos y
 * fallaba en silencio en cualquier instalación real.
 */

export interface ConsentimientoFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

const CAMPOS = ['code', 'legalEntityId', 'title', 'bodyMarkdown', 'plainLanguageSummary'] as const;

function loEscrito(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = textField(formData, campo);
  return valores;
}


export async function draftConsentVersionAction(
  _previous: ConsentimientoFormState,
  formData: FormData,
): Promise<ConsentimientoFormState> {
  const actor = await currentActor();
  const propositos = CODIGOS_DE_PROPOSITO.filter((uno) => formData.get(`requiredFor.${uno}`) !== null);

  const resultado = await draftConsentVersion(actor, {
    code: textField(formData, 'code'),
    legalEntityId: textField(formData, 'legalEntityId'),
    title: textField(formData, 'title'),
    bodyMarkdown: textField(formData, 'bodyMarkdown'),
    plainLanguageSummary: textField(formData, 'plainLanguageSummary'),
    requiredFor: propositos,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loEscrito(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/consentimientos');
  return {
    status: 'ok',
    message: `Borrador creado: ${resultado.data.code} versión ${resultado.data.version}. Publícalo para que se pueda aceptar.`,
  };
}

export async function publishConsentVersionAction(
  _previous: ConsentimientoFormState,
  formData: FormData,
): Promise<ConsentimientoFormState> {
  const actor = await currentActor();
  const resultado = await publishConsentVersion(actor, {
    consentVersionId: textField(formData, 'consentVersionId'),
    effectiveFrom: textField(formData, 'effectiveFrom'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/consentimientos');
  return {
    status: 'ok',
    message:
      resultado.data.supersededId === null
        ? 'Texto publicado. Ya se puede aceptar.'
        : 'Texto publicado. La versión anterior quedó retirada en el mismo acto.',
  };
}

export async function retireConsentVersionAction(
  _previous: ConsentimientoFormState,
  formData: FormData,
): Promise<ConsentimientoFormState> {
  const actor = await currentActor();
  const resultado = await retireConsentVersion(actor, {
    consentVersionId: textField(formData, 'consentVersionId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/consentimientos');
  return { status: 'ok', message: 'Texto retirado. Deja de servir para consentir y sigue existiendo.' };
}
