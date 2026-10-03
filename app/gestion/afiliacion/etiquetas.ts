/** Nombres en español del registro de personas beneficiarias (PRD §3.4, §8.3). */

export const ORIGEN: Record<string, string> = {
  SELF: 'La propia persona',
  FAMILY_OR_CAREGIVER: 'Familiar o persona cuidadora autorizada',
  UNION_MEMBER: 'Una persona agremiada',
  DELEGATE: 'Una delegación territorial',
  SOCIAL_STAFF: 'Personal social de Alianza Índigo',
  EXTERNAL_REFERRAL: 'Canalización externa',
};

export const ESTADO_DE_REGISTRO_PROTEGIDO: Record<string, string> = {
  ACTIVE: 'Vigente',
  REVOKED: 'Revocado',
};

export const PERFIL_PROTEGIDO: Record<string, string> = {
  NEURODIVERGENT_PERSON: 'Persona neurodivergente',
  FAMILY_MEMBER: 'Familiar de una persona neurodivergente',
  CAREGIVER: 'Persona cuidadora',
};

export const MOTIVO_REVOCACION: Record<string, string> = {
  IMPERSONATION: 'Suplantación de identidad',
  DUPLICATE: 'Registro duplicado',
  ADMINISTRATIVE_ERROR: 'Error administrativo',
  FALSE_INFORMATION: 'Información falsa',
  MISUSE: 'Uso indebido',
  PERSON_REQUEST: 'Solicitud de la persona',
  OTHER: 'Otro motivo',
};

export const PRIVACIDAD: Record<string, string> = {
  STANDARD: 'Estándar',
  REINFORCED: 'Reforzada',
};

export const RELACION: Record<string, string> = {
  PARENT_OR_GUARDIAN: 'Madre, padre o tutor',
  CHILD: 'Hija o hijo',
  SPOUSE_OR_PARTNER: 'Cónyuge o pareja',
  RELATIVE: 'Familiar',
  PRIMARY_CAREGIVER: 'Cuidadora principal',
  SECONDARY_CAREGIVER: 'Cuidadora secundaria',
  AUTHORIZED_REPRESENTATIVE: 'Representante autorizada',
  EMERGENCY_CONTACT: 'Contacto de emergencia',
  RESPONSIBLE_PROFESSIONAL: 'Profesional responsable',
};

export const ALCANCE: Record<string, string> = {
  MEMBERSHIP: 'Afiliación',
  CASES: 'Expedientes de caso',
  DOCUMENTS: 'Documentos',
  NOTIFICATIONS: 'Avisos y notificaciones',
};
