/**
 * Efectos que la IA no puede producir (PRD §15.4; ADR-0147).
 *
 * Es la garantía que gobierna toda la fase: **la IA no decide**. El PRD §15.4
 * enumera diez decisiones, y esta lista no es una recomendación para quien
 * escribe los prompts: es una comprobación del servicio, que **rechaza la
 * ejecución antes de llamar al modelo** cuando la petición declara que produciría
 * uno de estos efectos. Queda como fila `BLOCKED_BY_POLICY` en la bitácora: se
 * intentó usar la IA para decidir algo que no le toca, y quedó registrado.
 *
 * El texto de cada efecto es, palabra por palabra, el del PRD §15.4, para que el
 * control `C-F8-02` pueda cotejar esta lista contra el contrato y fallar si
 * alguna vez divergen —una entrada que se pierda aquí es un efecto que la IA
 * podría volver a tomar sin que nadie lo note—.
 */

export const PROHIBITED_EFFECTS = {
  ADMISSION: 'admisión o rechazo de afiliaciones',
  SANCTION: 'suspensión o expulsión',
  ELECTORAL_ELIGIBILITY: 'elegibilidad electoral definitiva',
  VOTE_VALIDITY: 'sentido o validez de un voto',
  CONFLICT_RESOLUTION: 'resolución de conflictos',
  LEGAL_REPRESENTATION: 'otorgamiento de representación legal',
  DIAGNOSIS: 'diagnóstico médico o psicológico',
  PAYMENT_AUTHORIZATION: 'autorización de pagos o reembolsos',
  CASE_ACCESS: 'acceso a expedientes',
  PERSONAL_DATA_PUBLICATION: 'publicación de datos personales',
} as const;

export type ProhibitedEffect = keyof typeof PROHIBITED_EFFECTS;

const CONJUNTO = new Set<string>(Object.keys(PROHIBITED_EFFECTS));

/** ¿El efecto declarado es uno de los que la IA no puede producir (§15.4)? */
export function isProhibitedEffect(effect: string): effect is ProhibitedEffect {
  return CONJUNTO.has(effect);
}
