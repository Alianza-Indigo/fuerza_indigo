'use server';

import { revalidatePath } from 'next/cache';

import { grantConsent, revokeConsent } from '@/platform/consent';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Otorgar y retirar el consentimiento propio (PRD §7.3, F4-UI-001).
 *
 * Es la pantalla que a `D-F4-009` le faltaba: allí se repartieron las
 * facultades `consent.grant_own` y `consent.revoke_own`, pero ninguna persona
 * tenía dónde ejercerlas. Una facultad sin pantalla es una promesa escrita en
 * el catálogo de permisos.
 */

export interface ConsentimientoState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

export async function grantOwnConsentAction(
  _previous: ConsentimientoState,
  formData: FormData,
): Promise<ConsentimientoState> {
  const actor = await currentActor();
  const values = {
    consentVersionId: textField(formData, 'consentVersionId'),
    purpose: textField(formData, 'purpose'),
  };

  if (actor.personId === null) {
    return { status: 'error', message: 'Tu sesión no tiene una persona asociada.', values };
  }

  const resultado = await grantConsent(actor, {
    // El titular es quien está en sesión. La pantalla no acepta otro: consentir
    // por otra persona exige acreditar la relación, y eso es otro trámite.
    personId: actor.personId,
    purpose: values.purpose as 'MEMBERSHIP',
    consentVersionId: values.consentVersionId,
    medium: 'SCREEN',
  });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/mi/consentimientos');
  revalidatePath('/mi');
  return { status: 'ok', message: 'Queda registrado tu sí, con la fecha y el texto que aceptaste.' };
}

export async function revokeOwnConsentAction(
  _previous: ConsentimientoState,
  formData: FormData,
): Promise<ConsentimientoState> {
  const actor = await currentActor();
  const values = {
    consentId: textField(formData, 'consentId'),
    reason: textField(formData, 'reason'),
  };

  const resultado = await revokeConsent(actor, values);
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/mi/consentimientos');
  revalidatePath('/mi');
  return {
    status: 'ok',
    message: 'Retirado. Surte efecto desde ahora y no borra lo que ya estaba hecho con base en él.',
  };
}
