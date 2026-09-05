'use server';

import { revalidatePath } from 'next/cache';
import { registerCareRelationship, revokeCareRelationship } from '@/modules/membership';
import { grantConsent, revokeConsent } from '@/platform/consent';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

/**
 * Relaciones de cuidado y consentimientos (PRD §3.5, §7.3).
 *
 * Van juntas en el mismo archivo porque van juntas en la vida: una relación sin
 * consentimiento no alcanza nada, y un consentimiento otorgado en nombre de otra
 * persona necesita la relación que lo acredite.
 */

export interface RelacionFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

const ALCANCES = ['MEMBERSHIP', 'CASES', 'CIAN', 'DOCUMENTS', 'NOTIFICATIONS'] as const;
const nulo = (valor: string): string | null => (valor === '' ? null : valor);

export async function registerCareRelationshipAction(
  _previous: RelacionFormState,
  formData: FormData,
): Promise<RelacionFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'anchorPersonId');
  const alcance = ALCANCES.filter((uno) => formData.get(`scope.${uno}`) !== null);

  const resultado = await registerCareRelationship(actor, {
    fromPersonId: textField(formData, 'fromPersonId'),
    toPersonId: textField(formData, 'toPersonId'),
    kind: textField(formData, 'kind') as
      | 'PARENT_OR_GUARDIAN'
      | 'CHILD'
      | 'SPOUSE_OR_PARTNER'
      | 'RELATIVE'
      | 'PRIMARY_CAREGIVER'
      | 'SECONDARY_CAREGIVER'
      | 'AUTHORIZED_REPRESENTATIVE'
      | 'EMERGENCY_CONTACT'
      | 'RESPONSIBLE_PROFESSIONAL',
    scope: alcance,
    evidenceFileId: null,
    startsAt: nulo(textField(formData, 'startsAt')),
    endsAt: nulo(textField(formData, 'endsAt')),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/registro/${personId}`);
  return {
    status: 'ok',
    message:
      'Relación registrada. Todavía no alcanza ningún expediente: hace falta además el consentimiento de la persona.',
  };
}

export async function revokeCareRelationshipAction(
  _previous: RelacionFormState,
  formData: FormData,
): Promise<RelacionFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'anchorPersonId');
  const resultado = await revokeCareRelationship(actor, {
    relationshipId: textField(formData, 'relationshipId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/registro/${personId}`);
  return {
    status: 'ok',
    message: 'Relación revocada. Los consentimientos que se apoyaban en ella caen con ella.',
  };
}

export async function grantConsentAction(
  _previous: RelacionFormState,
  formData: FormData,
): Promise<RelacionFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'personId');

  const resultado = await grantConsent(actor, {
    personId,
    purpose: textField(formData, 'purpose') as
      | 'MEMBERSHIP'
      | 'DIRECTORY_PUBLICATION'
      | 'CASE_PROCESSING'
      | 'INTER_ENTITY_REFERRAL'
      | 'CIAN_CARE'
      | 'CLINICAL_DATA_SHARING'
      | 'AI_ASSISTANCE'
      | 'TOOL_IDENTITY_EXCHANGE'
      | 'MARKETING_COMMUNICATIONS'
      | 'EVENT_PARTICIPATION'
      | 'MINOR_REPRESENTATION',
    consentVersionId: textField(formData, 'consentVersionId'),
    scope: {},
    representationRef: nulo(textField(formData, 'representationRef')),
    expiresAt: nulo(textField(formData, 'expiresAt')),
    medium: textField(formData, 'medium') as 'SCREEN' | 'SIGNED_PAPER' | 'VERBAL_WITH_WITNESS',
    mediumNote: nulo(textField(formData, 'mediumNote')),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/registro/${personId}`);
  return {
    status: 'ok',
    message:
      resultado.data.replacedConsentId === null
        ? 'Consentimiento registrado.'
        : 'Consentimiento registrado. El anterior del mismo propósito quedó revocado.',
  };
}

export async function revokeConsentAction(
  _previous: RelacionFormState,
  formData: FormData,
): Promise<RelacionFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'personId');
  const resultado = await revokeConsent(actor, {
    consentId: textField(formData, 'consentId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath(`/gestion/registro/${personId}`);
  return { status: 'ok', message: 'Consentimiento revocado. Surte efecto desde ahora, no hacia atrás.' };
}
