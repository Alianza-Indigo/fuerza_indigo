import type { NotificationCategory, NotificationChannel } from '@prisma-client/enums';

/**
 * La taxonomía de avisos, y la única regla que la fase pone por encima de la
 * preferencia (PRD §16.2).
 *
 * Un aviso puede llegar por varios canales y de varias clases. La persona decide
 * qué clases quiere y por dónde —salvo una: **los avisos obligatorios de
 * gobierno sindical no son una preferencia**. Son la vía por la que la
 * organización informa de lo que obliga a la persona, y por eso ni el esquema ni
 * este dominio dejan silenciarlos. La base lo impone con un `CHECK`; aquí se
 * comprueba antes, para que la persona reciba un mensaje claro en vez de un error
 * de base de datos.
 */

/** Las ocho clases de aviso, en el orden en que se le presentan a la persona. */
export const NOTIFICATION_CATEGORIES = [
  'GOVERNANCE_MANDATORY',
  'SECURITY',
  'MEMBERSHIP',
  'PAYMENT',
  'CASE',
  'APPOINTMENT',
  'EVENT',
  'PROMOTIONAL',
] as const satisfies readonly NotificationCategory[];

/** Los canales por los que un aviso puede viajar. */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'WEB_PUSH'] as const satisfies readonly NotificationChannel[];

/**
 * Las clases que ninguna preferencia puede silenciar. Hoy, solo la obligatoria
 * de gobierno; y no es una lista por comodidad: es exactamente lo que el `CHECK`
 * `preferencia_obligatoria_no_se_suprime` rechaza en la base.
 */
const NO_SILENCIABLES = new Set<NotificationCategory>(['GOVERNANCE_MANDATORY']);

/** Si una clase de aviso es obligatoria y, por tanto, no admite supresión. */
export function isMandatoryCategory(category: NotificationCategory): boolean {
  return NO_SILENCIABLES.has(category);
}
