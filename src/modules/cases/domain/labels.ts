import type { CaseDomain, CaseOutcome, CasePriority, CaseStatus } from '@prisma-client/enums';

/**
 * Cómo se llama cada cosa en la pantalla.
 *
 * Vive aquí y no en la pantalla porque los mismos nombres aparecen en la lista,
 * en el detalle y en el panel de indicadores, y tres copias de una etiqueta
 * acaban siendo tres etiquetas distintas.
 */

export const NOMBRE_DE_DOMINIO: Record<CaseDomain, string> = {
  UNION_DEFENSE: 'Defensa sindical',
  SOCIAL_ATTENTION: 'Atención social',
};

export const NOMBRE_DE_PRIORIDAD: Record<CasePriority, string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

/** El tono acompaña a la palabra; nunca la sustituye (PRD §5.2). */
export const TONO_DE_PRIORIDAD: Record<CasePriority, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  NORMAL: 'accent',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export const NOMBRE_DE_ESTADO: Record<CaseStatus, string> = {
  OPEN: 'Abierto',
  IN_PROGRESS: 'En trabajo',
  WAITING_ON_PERSON: 'Esperando a la persona',
  WAITING_ON_THIRD_PARTY: 'Esperando a un tercero',
  REFERRED: 'Canalizado',
  CLOSED: 'Cerrado',
};

export const NOMBRE_DE_RESULTADO: Record<CaseOutcome, string> = {
  RESOLVED: 'Resuelto',
  PARTIALLY_RESOLVED: 'Resuelto en parte',
  REFERRED: 'Canalizado a otra instancia',
  WITHDRAWN_BY_PERSON: 'Retirado por la persona',
  NOT_COMPETENT: 'Fuera de nuestra competencia',
  NO_CONTACT: 'Sin poder contactar',
};
