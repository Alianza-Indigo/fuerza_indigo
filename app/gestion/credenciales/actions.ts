'use server';

import { revalidatePath } from 'next/cache';

import { issueCredential, replaceCredential, revokeCredential } from '@/modules/membership';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Emitir, revocar y reponer credenciales (PRD §7.4; F4-CRE-001, F4-CRE-004).
 *
 * Los tres actos invalidan la ruta al terminar. No por rendimiento: la lista de
 * gestión tiene que reflejar la revocación en cuanto se hace, igual que el
 * verificador, y una página cacheada seguiría enseñando como vigente algo que
 * dejó de serlo.
 */

export interface CredencialState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

export async function issueCredentialAction(
  _previous: CredencialState,
  formData: FormData,
): Promise<CredencialState> {
  const actor = await currentActor();
  const values = {
    personId: textField(formData, 'personId'),
    kind: textField(formData, 'kind'),
    legalEntityId: textField(formData, 'legalEntityId'),
    territoryLabel: textField(formData, 'territoryLabel'),
    expiresOn: textField(formData, 'expiresOn'),
    reason: textField(formData, 'reason'),
  };

  const resultado = await issueCredential(actor, {
    personId: values.personId,
    kind: values.kind as 'OFFICE_OR_REPRESENTATION',
    legalEntityId: values.legalEntityId,
    territoryLabel: values.territoryLabel,
    ...(values.expiresOn === '' ? {} : { expiresOn: values.expiresOn }),
    reason: values.reason,
  });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/credenciales');
  return { status: 'ok', message: `Credencial emitida con el código ${resultado.data.publicCode}.` };
}

export async function revokeCredentialAction(
  _previous: CredencialState,
  formData: FormData,
): Promise<CredencialState> {
  const actor = await currentActor();
  const values = {
    credentialId: textField(formData, 'credentialId'),
    reason: textField(formData, 'reason'),
  };

  const resultado = await revokeCredential(actor, values);
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/credenciales');
  return {
    status: 'ok',
    message: 'Credencial revocada. Deja de valer en el verificador desde este momento.',
  };
}

export async function replaceCredentialAction(
  _previous: CredencialState,
  formData: FormData,
): Promise<CredencialState> {
  const actor = await currentActor();
  const values = {
    credentialId: textField(formData, 'credentialId'),
    reason: textField(formData, 'reason'),
  };

  const resultado = await replaceCredential(actor, values);
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/credenciales');
  return {
    status: 'ok',
    message: `Credencial repuesta. El código nuevo es ${resultado.data.publicCode}; el anterior ya no vale.`,
  };
}
