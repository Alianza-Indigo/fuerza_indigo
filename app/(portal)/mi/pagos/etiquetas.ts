import type { Tone } from '@/design-system/primitives';
import type { PaymentStatus, SubscriptionStatus } from '@prisma-client/enums';

/**
 * Cómo se le nombra a la persona el estado de su dinero.
 *
 * Los nombres del esquema son términos de la pasarela y no significan nada
 * fuera de ella. «REQUIRES_PAYMENT» no le dice a nadie que su cobro se está
 * confirmando, y «DISPUTED» suena a acusación cuando lo que hay es una
 * aclaración en curso con el banco.
 *
 * Están en un solo sitio para que la persona y quien lleva las finanzas lean
 * exactamente lo mismo del mismo estado.
 */

export const ESTADO_DE_PAGO: Record<PaymentStatus, { label: string; tone: Tone }> = {
  REQUIRES_PAYMENT: { label: 'Sin completar', tone: 'neutral' },
  PENDING: { label: 'Confirmándose', tone: 'accent' },
  SUCCEEDED: { label: 'Pagado', tone: 'success' },
  FAILED: { label: 'No se pudo cobrar', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Devuelto en parte', tone: 'warning' },
  REFUNDED: { label: 'Devuelto', tone: 'warning' },
  DISPUTED: { label: 'En aclaración con el banco', tone: 'warning' },
};

export const ESTADO_DE_SUSCRIPCION: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  INCOMPLETE: { label: 'Sin terminar de activar', tone: 'neutral' },
  TRIALING: { label: 'En periodo de prueba', tone: 'accent' },
  ACTIVE: { label: 'Al corriente', tone: 'success' },
  PAST_DUE: { label: 'Con un cobro pendiente', tone: 'warning' },
  GRACE_PERIOD: { label: 'En periodo de gracia', tone: 'warning' },
  CANCELED: { label: 'Cancelada', tone: 'neutral' },
  UNPAID: { label: 'Sin pagar', tone: 'danger' },
};

export const PERIODICIDAD: Record<string, string> = {
  MONTH: 'al mes',
  QUARTER: 'al trimestre',
  SEMESTER: 'al semestre',
  YEAR: 'al año',
};
