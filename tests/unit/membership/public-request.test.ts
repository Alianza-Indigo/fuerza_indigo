import { describe, expect, it } from 'vitest';

import { publicMembershipRequestSchema } from '@/modules/membership';

const CONTACT = {
  givenName: 'María',
  familyName: 'Gómez',
  secondFamilyName: '',
  curp: 'GODE561231MDFRRN09',
  email: 'maria@example.mx',
  phone: '',
  territory: 'Ciudad de México, Coyoacán',
  occupation: 'Docente',
  promoterReference: '',
  otherUnionMembership: 'NONE',
  otherUnionClarification: '',
  acceptsStatutes: true,
  acceptedPrivacyNotice: true as const,
};

describe('solicitud pública de registro', () => {
  it('acepta la solicitud sindical cuando contiene CURP, ocupación y vínculo laboral', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'UNION_MEMBER',
      workRelation: 'SUBORDINATE',
      neurodivergentConnection: 'Acompaño a estudiantes neurodivergentes dentro del aula.',
      protectedProfile: '',
      context: '',
      ageConfirmed: true,
    });

    expect(result.success).toBe(true);
  });

  it('limita la forma de trabajo a subordinado o independiente', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'UNION_MEMBER',
      workRelation: 'AUTONOMOUS',
      neurodivergentConnection: 'Acompaño a estudiantes neurodivergentes dentro del aula.',
      protectedProfile: '',
      context: '',
      ageConfirmed: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'workRelation')).toBe(true);
  });

  it('acepta la solicitud de agremiado honorario con voz y sin voto', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'HONORARY_AFFILIATE',
      workRelation: '',
      neurodivergentConnection: 'Como docente tengo contacto cotidiano con estudiantes neurodivergentes.',
      protectedProfile: '',
      context: 'Quiero colaborar en programas de formación.',
      ageConfirmed: false,
    });

    expect(result.success).toBe(true);
  });

  it('acepta a una empresa como agremiada honoraria y conserva a su representante', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'HONORARY_AFFILIATE',
      honorarySubjectKind: 'ORGANIZATION',
      organizationLegalName: 'Inclusión Índigo, S.A. de C.V.',
      organizationTradeName: 'Inclusión Índigo',
      organizationTaxId: 'IIN260101AB1',
      organizationKind: 'COMPANY',
      organizationSector: 'Tecnología accesible',
      organizationWebsite: 'https://example.mx',
      organizationPublicListingAuthorized: true,
      workRelation: '',
      neurodivergentConnection: 'La empresa atiende a personas neurodivergentes entre sus clientes y usuarios.',
      protectedProfile: '',
      context: 'Deseamos colaborar con programas de inclusión.',
      ageConfirmed: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.organizationTaxId).toBe('IIN260101AB1');
  });

  it('exige identificación institucional cuando la titular es una organización', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'HONORARY_AFFILIATE',
      honorarySubjectKind: 'ORGANIZATION',
      organizationLegalName: '',
      organizationTaxId: '',
      organizationKind: '',
      organizationSector: '',
      workRelation: '',
      neurodivergentConnection: 'La organización tiene contacto con personas neurodivergentes.',
      protectedProfile: '',
      context: '',
      ageConfirmed: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['organizationLegalName', 'organizationTaxId', 'organizationKind', 'organizationSector']),
    );
  });

  it('acepta el registro de una persona beneficiaria protegida sin voz, voto ni cuota', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'PROTECTED_BENEFICIARY',
      workRelation: '',
      neurodivergentConnection: '',
      protectedProfile: 'NEURODIVERGENT_PERSON',
      context: '',
      ageConfirmed: false,
    });

    expect(result.success).toBe(true);
  });

  it('rechaza una CURP incompleta junto al campo correspondiente', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      curp: 'GODE561231',
      modality: 'HONORARY_AFFILIATE',
      workRelation: '',
      neurodivergentConnection: '',
      protectedProfile: 'NEURODIVERGENT_PERSON',
      context: '',
      ageConfirmed: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'curp')).toBe(true);
  });

  it('exige ocupación en las tres categorías', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      occupation: '',
      modality: 'HONORARY_AFFILIATE',
      workRelation: '',
      neurodivergentConnection: 'Como terapeuta tengo contacto con personas neurodivergentes en consulta.',
      protectedProfile: '',
      context: 'Quiero colaborar en la atención de la comunidad.',
      ageConfirmed: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'occupation')).toBe(true);
  });

  it('acepta el código de Embajador Índigo como dato opcional', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      promoterReference: 'fi-emb-00015',
      modality: 'UNION_MEMBER',
      workRelation: 'INDEPENDENT',
      neurodivergentConnection: 'Trabajo cotidianamente con personas neurodivergentes en mi comunidad.',
      protectedProfile: '',
      context: '',
      ageConfirmed: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.promoterReference).toBe('FI-EMB-00015');
  });

  it('rechaza nombres o referencias que no identifican a un embajador', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      promoterReference: 'Ana Pérez',
      modality: 'UNION_MEMBER',
      workRelation: 'INDEPENDENT',
      neurodivergentConnection: 'Trabajo cotidianamente con personas neurodivergentes en mi comunidad.',
      protectedProfile: '',
      context: '',
      ageConfirmed: true,
    });

    expect(result.success).toBe(false);
  });
});
