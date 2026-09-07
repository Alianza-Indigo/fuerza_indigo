import type { MembershipCategory } from '@prisma-client/enums';

/**
 * Elegibilidad de un evento: la parte pura (PRD §16.3).
 *
 * Las reglas viven en `Event.eligibilityRules` como JSON, y aquí se leen y se
 * evalúan sin base de datos. Hoy la regla es una: si el evento es solo para
 * agremiados, y de qué calidades. Es una función pura para que la prueba pueda
 * romperla y verla fallar sin montar un evento entero.
 */

export interface EligibilityRules {
  /** Si solo pueden inscribirse quienes tienen una membresía activa. */
  readonly membersOnly: boolean;
  /** Calidades de membresía admitidas. Vacío = cualquiera con membresía activa. */
  readonly membershipCategories: readonly MembershipCategory[];
}

const CATEGORIAS: readonly MembershipCategory[] = ['UNION_MEMBER', 'HONORARY_AFFILIATE'];

/** Lee las reglas del JSON, tolerando ausencias y formas inesperadas. */
export function parseEligibility(json: unknown): EligibilityRules {
  const obj = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const membersOnly = obj['membersOnly'] === true;
  const categorias = Array.isArray(obj['membershipCategories'])
    ? obj['membershipCategories'].filter((v): v is MembershipCategory => typeof v === 'string' && CATEGORIAS.includes(v as MembershipCategory))
    : [];
  return { membersOnly, membershipCategories: categorias };
}

export interface Eligible {
  readonly activeMembership: boolean;
  readonly membershipCategory: MembershipCategory | null;
}

/** Si una persona cumple las reglas de elegibilidad de un evento. */
export function meetsEligibility(rules: EligibilityRules, persona: Eligible): { ok: boolean; reason: string | null } {
  if (!rules.membersOnly) return { ok: true, reason: null };
  if (!persona.activeMembership) {
    return { ok: false, reason: 'Este evento es solo para personas agremiadas con membresía activa.' };
  }
  if (rules.membershipCategories.length > 0) {
    if (persona.membershipCategory === null || !rules.membershipCategories.includes(persona.membershipCategory)) {
      return { ok: false, reason: 'Tu calidad de membresía no está entre las admitidas para este evento.' };
    }
  }
  return { ok: true, reason: null };
}
