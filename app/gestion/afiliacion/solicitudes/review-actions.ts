'use server';

import { revalidatePath } from 'next/cache';
import {
  closeClarification,
  recordRecommendation,
  requestClarification,
  resolveApplication,
  startReview,
} from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de revisión y resolución (PRD §8.1, pasos 9 a 11).
 *
 * Cada una devuelve lo escrito cuando falla. Un formulario que vuelve en blanco
 * después de un error obliga a redactar otra vez un fundamento de cuatro
 * párrafos, y quien pasa por eso una vez aprende a escribirlo fuera y pegarlo,
 * que es como se pierden los fundamentos.
 */

export interface RevisionState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

function conError(
  error: { message: string; details?: Record<string, string[]> | undefined },
  values: Record<string, string>,
): RevisionState {
  return {
    status: 'error',
    message: error.message,
    values,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

export async function startReviewAction(
  _previous: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const note = textField(formData, 'note');

  const resultado = await startReview(actor, { applicationId, note });
  if (!resultado.ok) return conError(resultado.error, { note });

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return { status: 'ok', message: 'Tomaste esta solicitud: queda a tu nombre en el expediente.' };
}

export async function requestClarificationAction(
  _previous: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const values = {
    request: textField(formData, 'request'),
    dueOn: textField(formData, 'dueOn'),
  };

  const resultado = await requestClarification(actor, { applicationId, ...values });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return {
    status: 'ok',
    message: 'Aclaración pedida. Se le avisó a la persona con el plazo y con lo que falta.',
  };
}

export async function closeClarificationAction(
  _previous: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const values = { closeReason: textField(formData, 'closeReason') };

  const resultado = await closeClarification(actor, {
    clarificationId: textField(formData, 'clarificationId'),
    ...values,
  });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return { status: 'ok', message: 'Aclaración cerrada. La solicitud vuelve a revisión.' };
}

export async function recordRecommendationAction(
  _previous: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const values = {
    recommendation: textField(formData, 'recommendation'),
    rationale: textField(formData, 'rationale'),
  };

  const resultado = await recordRecommendation(actor, {
    applicationId,
    recommendation: values.recommendation as 'RECOMMENDED_APPROVAL' | 'RECOMMENDED_REJECTION',
    rationale: values.rationale,
  });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return { status: 'ok', message: 'Recomendación registrada. Resuelve quien tiene esa facultad.' };
}

export async function resolveApplicationAction(
  _previous: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const actor = await currentActor();
  const applicationId = textField(formData, 'applicationId');
  const values = {
    decision: textField(formData, 'decision'),
    rationale: textField(formData, 'rationale'),
  };

  const resultado = await resolveApplication(actor, {
    applicationId,
    decision: values.decision as 'APPROVED' | 'REJECTED',
    rationale: values.rationale,
  });
  if (!resultado.ok) return conError(resultado.error, values);

  revalidatePath(`/gestion/afiliacion/solicitudes/${applicationId}`);
  return {
    status: 'ok',
    message:
      resultado.data.status === 'APPROVED'
        ? 'Solicitud aprobada. Se le avisó a la persona con el fundamento.'
        : 'Solicitud rechazada. Se le avisó a la persona con el fundamento entero.',
  };
}
