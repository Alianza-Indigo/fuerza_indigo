import type { Tone } from '@/design-system/primitives';
import type { NotificationCategory, NotificationChannel, TemplateStatus } from '@prisma-client/enums';

/** Cómo se nombra cada canal, clase y estado de una plantilla de aviso. */
export const CANAL: Record<NotificationChannel, string> = {
  IN_APP: 'Centro en la plataforma',
  EMAIL: 'Correo',
  WEB_PUSH: 'Notificación web',
};

export const CLASE: Record<NotificationCategory, string> = {
  GOVERNANCE_MANDATORY: 'Gobierno obligatorio',
  SECURITY: 'Seguridad',
  MEMBERSHIP: 'Afiliación',
  PAYMENT: 'Pagos',
  CASE: 'Casos',
  APPOINTMENT: 'Citas',
  EVENT: 'Eventos',
  PROMOTIONAL: 'Difusión',
};

export const ESTADO_DE_PLANTILLA: Record<TemplateStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicada', tone: 'success' },
  RETIRED: { label: 'Retirada', tone: 'warning' },
};
