import type { Tone } from '@/design-system/primitives';
import type { EventKind, EventRegistrationStatus } from '@prisma-client/enums';

export const CLASE_DE_EVENTO: Record<EventKind, string> = {
  ASSEMBLY_PUBLIC: 'Asamblea pública',
  COURSE: 'Curso',
  WORKSHOP: 'Taller',
  DIPLOMA: 'Diplomado',
  MEETING: 'Reunión',
  CAMPAIGN: 'Campaña',
};

export const MI_ESTADO: Record<EventRegistrationStatus, { label: string; tone: Tone }> = {
  REGISTERED: { label: 'Inscrito', tone: 'success' },
  WAITLISTED: { label: 'En lista de espera', tone: 'warning' },
  CONFIRMED: { label: 'Confirmado', tone: 'success' },
  ATTENDED: { label: 'Asististe', tone: 'success' },
  NO_SHOW: { label: 'No asististe', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
