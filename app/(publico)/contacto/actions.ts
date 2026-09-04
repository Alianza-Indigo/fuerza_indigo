'use server';

import { submitRequest } from '@/modules/support';
import { requestContext } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Envío del formulario público.
 *
 * No resuelve actor: quien escribe no tiene sesión y no la necesita. Lo único
 * que toma de la petición es la correlación y la huella del origen, que es lo
 * que permite limitar el envío en serie sin conservar la dirección.
 */

export interface RequestState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly folio?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function submitRequestAction(_previo: RequestState, formData: FormData): Promise<RequestState> {
  const context = await requestContext();

  const resultado = await submitRequest(
    {
      requestType: textField(formData, 'requestType') as never,
      legalEntity: textField(formData, 'legalEntity') as never,
      contactName: textField(formData, 'contactName'),
      contactEmail: textField(formData, 'contactEmail'),
      contactPhone: textField(formData, 'contactPhone'),
      preferredChannel: (textField(formData, 'preferredChannel') || 'EMAIL') as never,
      subject: textField(formData, 'subject'),
      narrative: textField(formData, 'narrative'),
      territoryHint: textField(formData, 'territoryHint'),
      acceptedPrivacyNotice: formData.get('acceptedPrivacyNotice') === 'on' ? true : (false as never),
    },
    { correlationId: context.correlationId, ipHash: context.ipHash },
  );

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  return { status: 'ok', folio: resultado.data.folio };
}
