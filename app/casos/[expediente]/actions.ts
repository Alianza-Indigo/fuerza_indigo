'use server';

import { revalidatePath } from 'next/cache';
import { addParticipant, assessCase, removeParticipant } from '@/modules/cases';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface CaseFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Asienta la valoración humana del expediente.
 *
 * No decide nada por su cuenta: quién puede, si está a cargo y si el expediente
 * admite la valoración lo resuelve el módulo, que es donde está probado.
 */
export async function assessCaseAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const plazo = textField(formData, 'dueAt');

  const resultado = await assessCase(actor, {
    caseId: textField(formData, 'caseId'),
    humanAssessment: textField(formData, 'humanAssessment'),
    priority: textField(formData, 'priority') as never,
    status: textField(formData, 'status') as never,
    dueAt: plazo === '' ? null : plazo,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message: resultado.data.primeraRespuesta
      ? `Valorado. Queda registrado como la primera respuesta del expediente ${resultado.data.folio}.`
      : `Valoración actualizada en el expediente ${resultado.data.folio}.`,
  };
}

/**
 * Agrega a alguien al expediente.
 *
 * La calidad no viaja en el formulario: la deriva el módulo del padrón, porque
 * quién es agremiada u honoraria ya está registrado y pedirlo a mano invita a
 * poner lo que a alguien le parece.
 */
export async function addParticipantAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'personId');
  const externalName = textField(formData, 'externalName');

  const resultado = await addParticipant(actor, {
    caseId: textField(formData, 'caseId'),
    personId: personId === '' ? null : personId,
    externalName: externalName === '' ? null : externalName,
    role: textField(formData, 'role') as never,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message: resultado.data.veElExpediente
      ? 'Agregada al expediente. Puede verlo desde su portal, sin las notas reservadas.'
      : 'Agregada al expediente. Figura en él y no lo ve.',
  };
}

/** Retira a alguien del expediente, con su motivo. */
export async function removeParticipantAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();

  const resultado = await removeParticipant(actor, {
    participantId: textField(formData, 'participantId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return { status: 'ok', message: 'Deja de figurar en el expediente y deja de verlo.' };
}
