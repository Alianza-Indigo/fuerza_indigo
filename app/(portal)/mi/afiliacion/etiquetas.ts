/**
 * Nombres en español de los estados y catálogos de la afiliación.
 *
 * Viven fuera de las pantallas porque las usan varias —la de la persona y la de
 * quien revisa— y porque un estado traducido de dos maneras distintas es un
 * estado que nadie sabe si es el mismo.
 */
export const ESTADO_DE_SOLICITUD: Record<string, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  DOCUMENTATION_PENDING: 'Falta documentación',
  UNDER_REVIEW: 'En revisión',
  CLARIFICATION_REQUIRED: 'Te pedimos una aclaración',
  APPROVED: 'Aprobada',
  PENDING_PAYMENT: 'Falta el pago',
  ACTIVATED: 'Activada',
  REJECTED: 'Rechazada',
  WITHDRAWN: 'Retirada',
};

export const TIPO_DE_DOCUMENTO: Record<string, string> = {
  IDENTITY: 'Identificación',
  WORK_PROOF: 'Comprobante de actividad',
  CERTIFICATE: 'Constancia o certificado',
  REFERENCE: 'Referencia',
  STATEMENT: 'Declaración',
  CLARIFICATION: 'Aclaración',
  OTHER: 'Otro',
};

export const ESTADO_DE_DOCUMENTO: Record<string, string> = {
  SUBMITTED: 'Sin revisar',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  SUPERSEDED: 'Sustituido',
};

export const FORMA_DE_TRABAJO: Record<string, string> = {
  SUBORDINATE: 'Por cuenta ajena, con patrón',
  INDEPENDENT: 'De forma independiente',
  AUTONOMOUS: 'De forma autónoma',
  SELF_EMPLOYED: 'Por cuenta propia',
};

export const OTRO_SINDICATO: Record<string, string> = {
  NONE: 'No pertenece a ningún otro sindicato',
  SAME_TRADE: 'Pertenece a otro sindicato del mismo gremio',
  DIFFERENT_TRADE: 'Pertenece a otro sindicato de otro gremio',
};

export const PERFIL_HONORARIO: Record<string, string> = {
  NEURODIVERGENT_PERSON: 'Persona neurodivergente',
  FAMILY_MEMBER: 'Familiar',
  CAREGIVER: 'Persona cuidadora',
};

export const ACCION_DE_REVISION: Record<string, string> = {
  ASSIGNED: 'Asignada',
  INFORMATION_REQUESTED: 'Aclaración requerida',
  INTERVIEW_SCHEDULED: 'Entrevista programada',
  RECOMMENDED_APPROVAL: 'Recomendada para aprobación',
  RECOMMENDED_REJECTION: 'Recomendada para rechazo',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};
