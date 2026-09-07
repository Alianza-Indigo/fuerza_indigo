'use server';

import { revalidatePath } from 'next/cache';
import { sendCampaign } from '@/modules/notifications';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Envío de una campaña (PRD §16.2). Lleva motivo —es un acto masivo— y el motivo
 * lo captura el formulario y lo vuelve a validar el caso de uso.
 */
export interface CampanaState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function sendCampaignAction(_previous: CampanaState, formData: FormData): Promise<CampanaState> {
  const actor = await currentActor();
  const resultado = await sendCampaign(actor, {
    templateCode: textField(formData, 'templateCode'),
    legalEntityId: textField(formData, 'legalEntityId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/comunicaciones/campanas');
  const { audience, queued, suppressed } = resultado.data;
  return {
    status: 'ok',
    message:
      audience === 0
        ? 'No hay miembros activos con correo en tu entidad. No se envió nada.'
        : `Campaña enviada a ${audience} miembro(s): ${queued} en cola de envío y ${suppressed} que silenciaron esta clase.`,
  };
}
