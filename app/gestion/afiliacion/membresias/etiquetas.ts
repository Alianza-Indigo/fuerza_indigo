/**
 * Nombres de los estados y motivos de una membresía (PRD §3.6).
 *
 * En un módulo sin directiva, porque los leen la pantalla —de servidor— y los
 * formularios —de cliente—: una constante declarada dentro de un módulo
 * `'use client'` no cruza esa frontera (ADR-0078).
 */
export const ESTADO_DE_MEMBRESIA: Record<string, string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  EXPIRED: 'Vencida',
  DISCIPLINARY_PROCESS: 'En proceso disciplinario',
  VOLUNTARY_WITHDRAWAL: 'Baja voluntaria',
  STATUS_LOSS: 'Pérdida de calidad',
  DECEASED: 'Fallecimiento',
  CANCELLED_DUPLICATE: 'Cancelada por duplicidad o error',
};

/**
 * Los siete motivos de terminación, con la explicación de qué significa cada
 * uno. Quien termina una membresía elige de esta lista, y la lista es lo único
 * que impide que «se fue» y «lo expulsamos» acaben anotados igual.
 */
export const MOTIVOS_DE_BAJA = [
  { value: 'VOLUNTARY_WITHDRAWAL', label: 'Baja voluntaria', help: 'La persona pidió dejar de ser miembro.' },
  { value: 'EXPULSION', label: 'Expulsión', help: 'Resolución de un procedimiento disciplinario firme.' },
  { value: 'INACTIVITY', label: 'Inactividad', help: 'Pérdida de la calidad por las causas del estatuto.' },
  { value: 'DECEASED', label: 'Fallecimiento', help: 'Se registra para cerrar, no para excluir.' },
  {
    value: 'CONVERSION',
    label: 'Conversión a otra calidad',
    help: 'La persona pasó de honoraria a agremiada, o al revés. No es una baja.',
  },
  {
    value: 'ADMIN_CORRECTION',
    label: 'Corrección administrativa',
    help: 'Se creó por error. Úsalo solo cuando de verdad no debió existir.',
  },
  { value: 'DUPLICATE', label: 'Duplicidad', help: 'La persona ya tenía esta membresía en otro registro.' },
] as const;
