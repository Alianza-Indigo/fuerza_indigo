import type { Tone } from '@/design-system/primitives';
import type { EventKind, EventModality, EventRegistrationStatus, EventStatus, EventVisibility } from '@prisma-client/enums';

export const CLASE_DE_EVENTO: Record<EventKind, string> = {
  ASSEMBLY_PUBLIC: 'Asamblea pública',
  COURSE: 'Curso',
  WORKSHOP: 'Taller',
  DIPLOMA: 'Diplomado',
  MEETING: 'Reunión',
  CAMPAIGN: 'Campaña',
};

export const MODALIDAD: Record<EventModality, string> = {
  IN_PERSON: 'Presencial',
  REMOTE: 'A distancia',
  HYBRID: 'Híbrido',
};

export const VISIBILIDAD: Record<EventVisibility, string> = {
  PUBLIC: 'Público',
  MEMBERS: 'Para agremiados',
  INVITATION: 'Por invitación',
};

export const ESTADO_DE_EVENTO: Record<EventStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicado', tone: 'accent' },
  REGISTRATION_OPEN: { label: 'Inscripción abierta', tone: 'success' },
  FULL: { label: 'Cupo lleno', tone: 'warning' },
  IN_PROGRESS: { label: 'En curso', tone: 'accent' },
  COMPLETED: { label: 'Concluido', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

export const ESTADO_DE_INSCRIPCION: Record<EventRegistrationStatus, { label: string; tone: Tone }> = {
  REGISTERED: { label: 'Inscrito', tone: 'success' },
  WAITLISTED: { label: 'En lista de espera', tone: 'warning' },
  CONFIRMED: { label: 'Confirmado', tone: 'success' },
  ATTENDED: { label: 'Asistió', tone: 'success' },
  NO_SHOW: { label: 'No asistió', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
