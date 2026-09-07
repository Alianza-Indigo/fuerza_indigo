import type { Tone } from '@/design-system/primitives';
import type { NotificationCategory } from '@prisma-client/enums';

/**
 * Cómo se le nombra a la persona cada clase de aviso.
 *
 * Los nombres del esquema son términos del sistema. «GOVERNANCE_MANDATORY» no le
 * dice nada a quien recibe el aviso, y «PROMOTIONAL» suena a spam cuando lo que
 * hay es la difusión que la persona sí puede querer. Están en un solo sitio para
 * que el centro y las preferencias lean exactamente lo mismo de cada clase.
 */
export const CLASE_DE_AVISO: Record<NotificationCategory, { label: string; description: string; tone: Tone }> = {
  GOVERNANCE_MANDATORY: {
    label: 'Gobierno obligatorio',
    description: 'Convocatorias, acuerdos y avisos que la organización debe hacerte llegar.',
    tone: 'accent',
  },
  SECURITY: {
    label: 'Seguridad',
    description: 'Entradas a tu cuenta y cambios en tu acceso.',
    tone: 'warning',
  },
  MEMBERSHIP: {
    label: 'Afiliación',
    description: 'El estado de tu afiliación y lo que necesita de ti.',
    tone: 'neutral',
  },
  PAYMENT: {
    label: 'Pagos',
    description: 'Cobros, comprobantes y recordatorios de cuota.',
    tone: 'neutral',
  },
  CASE: {
    label: 'Casos',
    description: 'Novedades de los casos en los que participas.',
    tone: 'neutral',
  },
  APPOINTMENT: {
    label: 'Citas',
    description: 'Recordatorios de citas y audiencias.',
    tone: 'neutral',
  },
  EVENT: {
    label: 'Eventos',
    description: 'Cursos, talleres y convocatorias abiertas a inscripción.',
    tone: 'neutral',
  },
  PROMOTIONAL: {
    label: 'Difusión',
    description: 'Campañas y novedades que no son obligatorias.',
    tone: 'neutral',
  },
};
