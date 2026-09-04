import type { LegalEntityCode, StripeAccountKey } from '@prisma-client/enums';

/**
 * Qué cuenta de cobro recibe el dinero de cada entidad jurídica (PRD §11.2).
 *
 * Fuerza Índigo y Alianza Índigo son personas morales distintas y cada una
 * cobra por su cuenta. La correspondencia vive aquí, en un solo sitio, y no
 * repartida por los casos de uso: un cobro que entrara a la cuenta equivocada
 * sería dinero de una entidad en la contabilidad de la otra, y eso no se
 * arregla con una corrección de datos.
 *
 * Devuelve `null` en lugar de suponer una cuenta. Si algún día se añade una
 * tercera entidad, quien la añada tiene que decidir de forma explícita a qué
 * cuenta cobra, y hasta entonces el cobro no sale.
 */
const CUENTA_POR_ENTIDAD: Record<LegalEntityCode, StripeAccountKey> = {
  FUERZA_INDIGO: 'FUERZA',
  ALIANZA_INDIGO: 'ALIANZA',
};

export function accountForLegalEntity(code: string): StripeAccountKey | null {
  return CUENTA_POR_ENTIDAD[code as LegalEntityCode] ?? null;
}
