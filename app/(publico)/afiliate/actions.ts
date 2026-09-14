'use server';

import { submitPublicMembershipRequest } from '@/modules/membership';
import { checkboxField, textField } from '@/platform/http/form-fields';
import { requestContext } from '@/platform/http/request-context';

export interface AffiliationRequestState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly folio?: string;
  readonly destination?: 'APPLICATION' | 'PROTECTED_BENEFICIARY';
  readonly accountAccess?: 'SETUP_LINK' | 'EMAIL' | 'EXISTING';
  readonly accountSetupUrl?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export async function submitAffiliationRequestAction(
  _previous: AffiliationRequestState,
  formData: FormData,
): Promise<AffiliationRequestState> {
  const context = await requestContext();

  const result = await submitPublicMembershipRequest(
    {
      modality: textField(formData, 'modality') as never,
      givenName: textField(formData, 'givenName'),
      familyName: textField(formData, 'familyName'),
      secondFamilyName: textField(formData, 'secondFamilyName'),
      curp: textField(formData, 'curp'),
      email: textField(formData, 'email'),
      phone: textField(formData, 'phone'),
      territory: textField(formData, 'territory'),
      occupation: textField(formData, 'occupation'),
      promoterReference: textField(formData, 'promoterReference'),
      physicalCredentialRequested: checkboxField(formData, 'physicalCredentialRequested'),
      honorarySubjectKind: (textField(formData, 'honorarySubjectKind') || undefined) as
        | 'PERSON'
        | 'ORGANIZATION'
        | undefined,
      organizationLegalName: textField(formData, 'organizationLegalName'),
      organizationTradeName: textField(formData, 'organizationTradeName'),
      organizationTaxId: textField(formData, 'organizationTaxId'),
      organizationKind: textField(formData, 'organizationKind'),
      organizationSector: textField(formData, 'organizationSector'),
      organizationWebsite: textField(formData, 'organizationWebsite'),
      organizationPublicListingAuthorized: checkboxField(formData, 'organizationPublicListingAuthorized'),
      workRelation: textField(formData, 'workRelation'),
      otherUnionMembership: textField(formData, 'otherUnionMembership'),
      otherUnionClarification: textField(formData, 'otherUnionClarification'),
      neurodivergentConnection: textField(formData, 'neurodivergentConnection'),
      protectedProfile: textField(formData, 'protectedProfile'),
      context: textField(formData, 'context'),
      ageConfirmed: checkboxField(formData, 'ageConfirmed'),
      acceptsStatutes: checkboxField(formData, 'acceptsStatutes'),
      acceptedPrivacyNotice: checkboxField(formData, 'acceptedPrivacyNotice') as never,
    },
    { correlationId: context.correlationId, ipHash: context.ipHash },
  );

  if (!result.ok) {
    return {
      status: 'error',
      message: result.error.message,
      ...(result.error.details === undefined ? {} : { fieldErrors: result.error.details }),
    };
  }

  return {
    status: 'ok',
    folio: result.data.folio,
    destination: result.data.destination,
    accountAccess: result.data.accountAccess,
    ...(result.data.accountSetupUrl === undefined ? {} : { accountSetupUrl: result.data.accountSetupUrl }),
  };
}
