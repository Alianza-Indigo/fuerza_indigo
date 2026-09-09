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
  acceptedPrivacyNotice: true as const,
};

describe('solicitud pública de afiliación', () => {
  it('acepta la solicitud sindical cuando contiene CURP, ocupación y vínculo laboral', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'UNION_MEMBER',
      workRelation: 'SUBORDINATE',
      neurodivergentConnection: 'Acompaño a estudiantes neurodivergentes dentro del aula.',
      honoraryProfile: '',
      context: '',
      ageConfirmed: true,
    });

    expect(result.success).toBe(true);
  });

  it('acepta la solicitud honoraria y no exige una relación laboral', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      modality: 'HONORARY_AFFILIATE',
      workRelation: '',
      neurodivergentConnection: '',
      honoraryProfile: 'FAMILY_MEMBER',
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
      honoraryProfile: 'NEURODIVERGENT_PERSON',
      context: '',
      ageConfirmed: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'curp')).toBe(true);
  });

  it('exige ocupación en las dos modalidades', () => {
    const result = publicMembershipRequestSchema.safeParse({
      ...CONTACT,
      occupation: '',
      modality: 'HONORARY_AFFILIATE',
      workRelation: '',
      neurodivergentConnection: '',
      honoraryProfile: 'CAREGIVER',
      context: '',
      ageConfirmed: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'occupation')).toBe(true);
  });
});
