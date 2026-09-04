'use server';

import { revalidatePath } from 'next/cache';
import {
  reviewApplicationDocument,
  saveAssistedDraft,
  startAssistedApplication,
  submitApplication,
  type SubmitApplicationInput,
} from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/** Acciones de la cola de solicitudes (PRD §8.1, pasos 2 y 10). */

export interface RevisionDocumentoState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function reviewDocumentAction(
  _previous: RevisionDocumentoState,
  formData: FormData,
): Promise<RevisionDocumentoState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const nota = textField(formData, 'reviewNote');

  const resultado = await reviewApplicationDocument(actor, {
    documentId: textField(formData, 'documentId'),
    decision: textField(formData, 'decision') as 'ACCEPTED' | 'REJECTED',
    reviewNote: nota === '' ? null : nota,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return {
    status: 'ok',
    message: resultado.data.status === 'ACCEPTED' ? 'Documento aceptado.' : 'Documento rechazado con nota.',
  };
}

export interface CapturaAsistidaState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly applicationId?: string;
  readonly folio?: string;
}

export async function startAssistedApplicationAction(
  _previous: CapturaAsistidaState,
  formData: FormData,
): Promise<CapturaAsistidaState> {
  const actor = await currentActor();
  const territorio = textField(formData, 'territorialUnitId');

  const resultado = await startAssistedApplication(actor, {
    personId: textField(formData, 'personId'),
    membershipTypeId: textField(formData, 'membershipTypeId'),
    territorialUnitId: territorio === '' ? null : territorio,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/solicitudes');
  return {
    status: 'ok',
    message: `Borrador abierto con folio ${resultado.data.folio}. Complétalo con la persona y envíalo desde su detalle.`,
    applicationId: resultado.data.applicationId,
    folio: resultado.data.folio,
  };
}

export interface AsistidaFormState {
  readonly status: 'idle' | 'error' | 'ok' | 'guardado';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

const CAMPOS_ASISTIDOS = [
  'occupationSpecialtyId',
  'workRelationKind',
  'neurodivergentContactStatement',
  'otherUnionMembership',
  'otherUnionClarification',
  'honoraryProfile',
  'territorialUnitId',
] as const;

function loCapturado(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS_ASISTIDOS) valores[campo] = textField(formData, campo);
  return valores;
}

const vacioANulo = (valor: string): string | null => (valor === '' ? null : valor);

/**
 * Captura asistida: guardar y enviar comparten formulario.
 *
 * Guardar deja el borrador en el servidor —aquí sí, porque estos datos ya se los
 * dio la persona a la organización— y enviar cierra el trámite con su resumen
 * inmutable. Un solo formulario con dos botones y no dos pantallas: quien
 * captura frente a la persona no puede perder el hilo entre dos páginas.
 */
export async function saveOrSubmitAssistedAction(
  _previous: AsistidaFormState,
  formData: FormData,
): Promise<AsistidaFormState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const enviar = textField(formData, 'intent') === 'enviar';

  if (!enviar) {
    const guardado = await saveAssistedDraft(actor, { applicationId, draft: loCapturado(formData) });
    if (!guardado.ok) {
      return {
        status: 'error',
        message: guardado.error.message,
        values: loCapturado(formData),
        ...(guardado.error.details === undefined ? {} : { fieldErrors: guardado.error.details }),
      };
    }
    revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
    return { status: 'guardado', message: 'Borrador guardado.', values: loCapturado(formData) };
  }

  const categoria = textField(formData, 'category');
  const comunes = {
    applicationId,
    personId: textField(formData, 'personId'),
    membershipTypeId: textField(formData, 'membershipTypeId'),
    territorialUnitId: vacioANulo(textField(formData, 'territorialUnitId')),
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
          neurodivergentContactStatement: vacioANulo(textField(formData, 'neurodivergentContactStatement')),
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
          otherUnionClarification: vacioANulo(textField(formData, 'otherUnionClarification')),
        };

  const resultado = await submitApplication(actor, entrada);
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values: loCapturado(formData),
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/afiliacion/solicitudes');
  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return { status: 'ok', message: `Solicitud enviada con folio ${resultado.data.folio}.` };
}
