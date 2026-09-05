/**
 * Consentimientos versionados y revocables (PRD §7.3).
 *
 * Vive en la plataforma y no en un módulo por la misma razón que los archivos:
 * lo necesitan la afiliación, el directorio, los casos, CIAN y la IA, y ninguno
 * de ellos es su dueño. Un módulo dueño del consentimiento obligaría a los demás
 * a importarlo para preguntar si alguien dijo que sí.
 */
export {
  draftConsentVersion,
  publishConsentVersion,
  retireConsentVersion,
  consentVersionList,
  consentEntityOptions,
  draftConsentVersionSchema,
  publishConsentVersionSchema,
  retireConsentVersionSchema,
  type DraftConsentVersionInput,
  type PublishConsentVersionInput,
  type RetireConsentVersionInput,
  type ConsentVersionRow,
} from './consent-versions';
export {
  grantConsent,
  revokeConsent,
  personConsents,
  publishedConsentTexts,
  hasLiveConsent,
  grantConsentSchema,
  revokeConsentSchema,
  type GrantConsentInput,
  type RevokeConsentInput,
  type GrantedConsent,
  type ConsentRow,
  type ConsentOffer,
} from './consents';
