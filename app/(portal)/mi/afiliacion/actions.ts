'use server';

import { revalidatePath } from 'next/cache';
import {
  answerClarification,
  attachApplicationDocument,
  submitApplication,
  withdrawApplication,
  type SubmitApplicationInput,
} from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de la afiliación propia (PRD §8.1, pasos 6 a 8).
 *
 * El formulario por pasos guarda su borrador en el navegador y manda todo junto
 * al final: por eso la acción recibe el trámite completo y no campo a campo.
 */

export interface AfiliacionFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly folio?: string;
  readonly applicationId?: string;
}

const nulo = (valor: string): string | null => (valor === '' ? null : valor);

export async function submitApplicationAction(
  _previous: AfiliacionFormState,
  formData: FormData,
): Promise<AfiliacionFormState> {
  const actor = await currentActor();
  const categoria = textField(formData, 'category');

  const comunes = {
    membershipTypeId: textField(formData, 'membershipTypeId'),
    territorialUnitId: nulo(textField(formData, 'territorialUnitId')),
    acceptsStatutes: textField(formData, 'acceptsStatutes') === 'si',
  };

  const entrada: SubmitApplicationInput =
    categoria === 'HONORARY_AFFILIATE'
      ? {
          ...comunes,
          category: 'HONORARY_AFFILIATE',
          honoraryProfile: textField(formData, 'honoraryProfile') as
            | 'NEURODIVERGENT_PERSON'
            | 'FAMILY_MEMBER'
            | 'CAREGIVER',
          neurodivergentContactStatement: nulo(textField(formData, 'neurodivergentContactStatement')),
        }
      : {
          ...comunes,
          category: 'UNION_MEMBER',
          occupationSpecialtyId: textField(formData, 'occupationSpecialtyId'),
          workRelationKind: textField(formData, 'workRelationKind') as
            | 'SUBORDINATE'
            | 'INDEPENDENT'
            | 'AUTONOMOUS'
            | 'SELF_EMPLOYED',
          neurodivergentContactStatement: textField(formData, 'neurodivergentContactStatement'),
          otherUnionMembership: textField(formData, 'otherUnionMembership') as
            | 'NONE'
            | 'SAME_TRADE'
            | 'DIFFERENT_TRADE',
          otherUnionClarification: nulo(textField(formData, 'otherUnionClarification')),
        };

  const resultado = await submitApplication(actor, entrada);

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/mi/afiliacion');
  return {
    status: 'ok',
    message: resultado.data.requiresReview
      ? `Solicitud enviada con folio ${resultado.data.folio}. La Secretaría de Organización la revisará y te avisaremos.`
      : `Solicitud enviada con folio ${resultado.data.folio}.`,
    folio: resultado.data.folio,
    applicationId: resultado.data.applicationId,
  };
}

export interface DocumentoFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function attachDocumentAction(
  _previous: DocumentoFormState,
  formData: FormData,
): Promise<DocumentoFormState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const archivo = formData.get('file');

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: 'error', message: 'Elige un archivo para adjuntar.', fieldErrors: { file: ['Falta el archivo.'] } };
  }

  const resultado = await attachApplicationDocument(actor, {
    applicationId,
    documentKind: textField(formData, 'documentKind') as
      | 'IDENTITY'
      | 'WORK_PROOF'
      | 'CERTIFICATE'
      | 'REFERENCE'
      | 'STATEMENT'
      | 'CLARIFICATION'
      | 'OTHER',
    originalFileName: archivo.name,
    mimeType: archivo.type,
    content: new Uint8Array(await archivo.arrayBuffer()),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/mi/afiliacion/${applicationId}`);
  return { status: 'ok', message: 'Documento adjuntado. Quien revise lo verá con tu solicitud.' };
}

export interface AclaracionFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

/**
 * Respuesta de la persona a una aclaración (PRD §8.1, paso 10).
 *
 * Devuelve lo escrito cuando falla: perder una respuesta larga por un error de
 * validación es la clase de cosa que hace que alguien abandone un trámite que ya
 * casi tenía hecho.
 */
export async function answerClarificationAction(
  _previous: AclaracionFormState,
  formData: FormData,
): Promise<AclaracionFormState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const answer = textField(formData, 'answer');

  const resultado = await answerClarification(actor, {
    clarificationId: textField(formData, 'clarificationId'),
    answer,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: { answer },
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/mi/afiliacion/${applicationId}`);
  return {
    status: 'ok',
    message: resultado.data.late
      ? 'Recibimos tu respuesta. El plazo ya había pasado, y aun así tu solicitud sigue su curso.'
      : 'Recibimos tu respuesta. Tu solicitud vuelve a revisión.',
  };
}

export interface RetiroFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function withdrawApplicationAction(
  _previous: RetiroFormState,
  formData: FormData,
): Promise<RetiroFormState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const resultado = await withdrawApplication(actor, {
    applicationId,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/mi/afiliacion');
  revalidatePath(`/mi/afiliacion/${applicationId}`);
  return { status: 'ok', message: 'Solicitud retirada.' };
}
