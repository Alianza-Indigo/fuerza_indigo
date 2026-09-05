/** Nombres en español del registro de personas beneficiarias (PRD §3.4, §8.3). */

export const ORIGEN: Record<string, string> = {
  SELF: 'La propia persona',
  FAMILY_OR_CAREGIVER: 'Familiar o persona cuidadora autorizada',
  UNION_MEMBER: 'Una persona agremiada',
  DELEGATE: 'Una delegación territorial',
  SOCIAL_STAFF: 'Personal social de Alianza Índigo',
  CIAN: 'CIAN',
  EXTERNAL_REFERRAL: 'Canalización externa',
};

export const URGENCIA: Record<string, string> = {
  ROUTINE: 'Ordinaria',
  PRIORITY: 'Prioritaria',
  URGENT: 'Urgente',
};

export const ESTADO_DE_ATENCION: Record<string, string> = {
  REGISTERED: 'Registrada',
  IN_ATTENTION: 'En atención',
  REFERRED: 'Canalizada',
  CLOSED: 'Cerrada',
  ARCHIVED: 'Archivada',
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
  CIAN: 'Atención CIAN',
  DOCUMENTS: 'Documentos',
  NOTIFICATIONS: 'Avisos y notificaciones',
};
