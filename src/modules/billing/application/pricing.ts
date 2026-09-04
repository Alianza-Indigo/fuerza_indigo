import { db } from '@/platform/db/client';
import type { Tx } from '@/platform/db/unit-of-work';
import type { DiscountKind, ScholarshipProgram } from '@prisma-client/enums';

/**
 * Cuánto paga de verdad una persona por un concepto (PRD §11.3).
 *
 * Un descuento o una beca que existen en una tabla y no cambian lo que se
 * cobra no son un descuento ni una beca: son una promesa. Este módulo es el
 * único sitio donde se decide el importe final, y lo llama el cobro antes de
 * mandar a nadie a pagar.
 *
 * Tres reglas gobiernan el cálculo:
 *
 *  1. **La beca gana al descuento, y no se acumulan.** Una beca responde a que
 *     alguien no puede pagar; un descuento, a una condición comercial.
 *     Sumarlos podría dejar el importe en negativo, y sobre todo haría que el
 *     motivo por el que alguien pagó menos dejara de ser una sola cosa
 *     explicable.
 *  2. **Se elige el más favorable a la persona**, no el primero que aparezca.
 *     Que el orden de las filas decida cuánto paga alguien sería arbitrario.
 *  3. **El importe nunca baja de cero.** Un descuento fijo mayor que el precio
 *     deja el cobro en cero, no en un abono a favor.
 */

export interface AppliedPrice {
  readonly baseMinor: bigint;
  readonly finalMinor: bigint;
  readonly discountGrantId: string | null;
  readonly scholarshipId: string | null;
  /** Frase corta que explica el descuento a quien paga y a quien revisa. */
  readonly explanation: string | null;
}

/** Programa del catálogo al que corresponde cada tipo de concepto. */
const PROGRAMA_POR_CONCEPTO: Record<string, ScholarshipProgram> = {
  ENROLLMENT_FEE: 'MEMBERSHIP',
  UNION_DUE_ORDINARY: 'MEMBERSHIP',
  UNION_DUE_EXTRAORDINARY: 'MEMBERSHIP',
  HONORARY_MEMBERSHIP: 'MEMBERSHIP',
  RENEWAL: 'MEMBERSHIP',
  SERVICE_SUBSCRIPTION: 'TOOL_ACCESS',
  CIAN_SERVICE: 'CIAN_SERVICE',
  COURSE: 'COURSE',
  CENI_PROGRAM: 'COURSE',
  CENI_ASSESSMENT: 'COURSE',
  CENI_CERTIFICATION: 'COURSE',
};

function aplicarDescuento(kind: DiscountKind, value: number, base: bigint): bigint {
  if (kind === 'FULL_WAIVER') return 0n;
  if (kind === 'PERCENTAGE') {
    // División entera hacia abajo: el redondeo favorece a quien paga, y da
    // siempre el mismo resultado para el mismo importe.
    const descontado = (base * BigInt(value)) / 100n;
    return base - descontado;
  }
  const restante = base - BigInt(value);
  return restante < 0n ? 0n : restante;
}

/**
 * Resuelve el importe final de un concepto para una persona.
 *
 * `productKind` decide a qué programa de beca corresponde el concepto: una beca
 * de membresía no rebaja un curso, y al revés.
 */
export async function priceFor(input: {
  readonly personId: string;
  readonly legalEntityId: string;
  readonly productId: string;
  readonly productKind: string;
  readonly baseMinor: bigint;
  readonly at?: Date;
  readonly tx?: Tx;
}): Promise<AppliedPrice> {
  const cliente = input.tx ?? db();
  const ahora = input.at ?? new Date();
  const base = input.baseMinor;

  const programa = PROGRAMA_POR_CONCEPTO[input.productKind];

  const beca =
    programa === undefined
      ? null
      : await cliente.scholarship.findFirst({
          where: {
            personId: input.personId,
            legalEntityId: input.legalEntityId,
            programKind: programa,
            revokedAt: null,
            validFrom: { lte: ahora },
            OR: [{ validTo: null }, { validTo: { gt: ahora } }],
          },
          orderBy: { coveragePercent: 'desc' },
          select: { id: true, coveragePercent: true },
        });

  if (beca !== null) {
    const cubierto = (base * BigInt(beca.coveragePercent)) / 100n;
    const final = base - cubierto;
    return {
      baseMinor: base,
      finalMinor: final < 0n ? 0n : final,
      discountGrantId: null,
      scholarshipId: beca.id,
      explanation:
        beca.coveragePercent >= 100
          ? 'Exención total por beca'
          : `Beca del ${String(beca.coveragePercent)} %`,
    };
  }

  const descuentos = await cliente.discountGrant.findMany({
    where: {
      legalEntityId: input.legalEntityId,
      revokedAt: null,
      validFrom: { lte: ahora },
      OR: [{ validTo: null }, { validTo: { gt: ahora } }],
      // Sin conceptos enlazados alcanza a todos los de su entidad; con ellos,
      // solo a los enlazados.
      AND: [{ OR: [{ products: { none: {} } }, { products: { some: { productId: input.productId } } }] }],
    },
    select: { id: true, name: true, kind: true, value: true, maxRedemptions: true, redemptions: true },
  });

  const utilizables = descuentos.filter(
    (descuento) => descuento.maxRedemptions === null || descuento.redemptions < descuento.maxRedemptions,
  );

  if (utilizables.length === 0) {
    return { baseMinor: base, finalMinor: base, discountGrantId: null, scholarshipId: null, explanation: null };
  }

  // El más favorable a la persona, no el primero que devuelva la consulta.
  let elegido = utilizables[0]!;
  let mejor = aplicarDescuento(elegido.kind, elegido.value, base);
  for (const candidato of utilizables.slice(1)) {
    const resultado = aplicarDescuento(candidato.kind, candidato.value, base);
    if (resultado < mejor) {
      mejor = resultado;
      elegido = candidato;
    }
  }

  if (mejor >= base) {
    return { baseMinor: base, finalMinor: base, discountGrantId: null, scholarshipId: null, explanation: null };
  }

  return {
    baseMinor: base,
    finalMinor: mejor,
    discountGrantId: elegido.id,
    scholarshipId: null,
    explanation: elegido.name,
  };
}
