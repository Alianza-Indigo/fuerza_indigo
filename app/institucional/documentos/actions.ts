'use server';

import { revalidatePath } from 'next/cache';
import { draftTemplate, publishTemplate, retireTemplate } from '@/modules/documents';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Actos sobre las plantillas de documento. */

export interface TemplateFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function draftTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const actor = await currentActor();
  const serie = textField(formData, 'numberingSeries');

  const resultado = await draftTemplate(actor, {
    code: textField(formData, 'code'),
    name: textField(formData, 'name'),
    kind: textField(formData, 'kind') as 'ASSEMBLY_MINUTES',
    legalEntityId: textField(formData, 'legalEntityId'),
    bodyTemplate: textField(formData, 'bodyTemplate'),
    // Las variables llegan separadas por comas o por saltos de línea: es como
    // se escriben cuando se copian del cuerpo de la plantilla.
    variables: textField(formData, 'variables')
      .split(/[\s,]+/)
      .map((nombre) => nombre.trim())
      .filter((nombre) => nombre !== ''),
    numberingSeries: serie === '' ? null : serie,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/documentos');
  return { status: 'ok', message: `Versión ${resultado.data.version} redactada. Revísala y publícala.` };
}

export async function publishTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const actor = await currentActor();

  const resultado = await publishTemplate(actor, { templateId: textField(formData, 'templateId') });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/documentos');
  return {
    status: 'ok',
    message:
      resultado.data.retiredVersion === null
        ? `Versión ${resultado.data.version} publicada.`
        : `Versión ${resultado.data.version} publicada; la ${resultado.data.retiredVersion} queda retirada.`,
  };
}

export async function retireTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const actor = await currentActor();

  const resultado = await retireTemplate(actor, {
    templateId: textField(formData, 'templateId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/institucional/documentos');
  return { status: 'ok', message: 'Plantilla retirada. Los documentos ya emitidos con ella no cambian.' };
}
