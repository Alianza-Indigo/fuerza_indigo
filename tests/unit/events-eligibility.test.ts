import { describe, expect, it } from 'vitest';
import { meetsEligibility, parseEligibility } from '@/modules/events/domain/eligibility';

/**
 * La parte pura de la elegibilidad (Fase 9 bloque E).
 */
describe('parseEligibility', () => {
  it('lee membersOnly y tolera formas inesperadas', () => {
    expect(parseEligibility({ membersOnly: true }).membersOnly).toBe(true);
    expect(parseEligibility(null).membersOnly).toBe(false);
    expect(parseEligibility('x').membersOnly).toBe(false);
  });
  it('conserva solo calidades válidas', () => {
    expect(parseEligibility({ membersOnly: true, membershipCategories: ['UNION_MEMBER', 'X'] }).membershipCategories).toEqual(['UNION_MEMBER']);
  });
});

describe('meetsEligibility', () => {
  it('un evento abierto no exige membresía', () => {
    expect(meetsEligibility({ membersOnly: false, membershipCategories: [] }, { activeMembership: false, membershipCategory: null }).ok).toBe(true);
  });
  it('un evento solo para agremiados rechaza a quien no lo es', () => {
    const r = meetsEligibility({ membersOnly: true, membershipCategories: [] }, { activeMembership: false, membershipCategory: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/agremiada/i);
  });
  it('respeta la calidad exigida', () => {
    const rules = { membersOnly: true, membershipCategories: ['UNION_MEMBER'] as const };
    expect(meetsEligibility(rules, { activeMembership: true, membershipCategory: 'HONORARY_AFFILIATE' }).ok).toBe(false);
    expect(meetsEligibility(rules, { activeMembership: true, membershipCategory: 'UNION_MEMBER' }).ok).toBe(true);
  });
});
