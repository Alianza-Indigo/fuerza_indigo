import { logger } from '@/platform/observability/logger';

/**
 * Precio del proveedor por token, para poder registrar el costo de cada
 * ejecución y sostener el techo de gasto mensual (PRD §15.1, §24 Fase 8; ADR-0138).
 *
 * **Por qué el precio vive en el código y el techo en la base.** Son dos cosas
 * distintas. El *techo mensual* es una decisión de la organización —cuánto está
 * dispuesta a gastar— y por eso se administra en `AiProviderConfiguration`, para
 * bajarlo un martes sin desplegar. El *precio por token* no lo decide la
 * organización: lo pone el proveedor, y cambia cuando el proveedor lo cambia,
 * igual que la dirección de su API. Ponerlo en la base sería invitar a que
 * alguien «ajuste el precio» y descuadre la factura; ponerlo aquí lo ata a un
 * commit revisable, que es el sitio donde se actualiza un hecho del proveedor.
 *
 * Se expresa en la **misma moneda** que el techo (`AiProviderConfiguration.currency`).
 * Si alguien cambia esa moneda sin actualizar esta tabla, el costo no se puede
 * calcular sin inventar un tipo de cambio: el servicio lo registra como cero y lo
 * dice en voz alta (mejor un hueco visible que una cifra falsa), y un modelo sin
 * precio cae a la tarifa más cara conocida, porque para un techo de gasto
 * **sobrestimar es seguro y subestimar no**.
 */

/** Moneda en la que está expresada esta tabla. Debe coincidir con la del proveedor. */
export const AI_PRICE_CURRENCY = 'MXN';

/** Centavos (unidad menor) por millón de tokens, de entrada y de salida. */
interface TarifaPorMillon {
  readonly input: bigint;
  readonly output: bigint;
}

/**
 * Tarifas por modelo, en centavos de MXN por millón de tokens. Son la lista del
 * proveedor convertida a la moneda de facturación de la organización; se
 * actualizan cuando el proveedor cambia precios, en un commit.
 */
const TARIFAS: Record<string, TarifaPorMillon> = {
  'gemini-2.5-flash': { input: 150n, output: 600n },
  'gemini-2.5-pro': { input: 2_500n, output: 10_000n },
  'gemini-2.5-flash-lite': { input: 40n, output: 160n },
};

/** La más cara conocida, para modelos sin tarifa: subestimar el gasto no es seguro. */
const TARIFA_CONSERVADORA: TarifaPorMillon = { input: 2_500n, output: 10_000n };

/**
 * Costo de una ejecución en la unidad menor de la moneda configurada. Redondea
 * hacia arriba cada componente: una fracción de centavo cobrada es un centavo.
 *
 * Devuelve cero, y lo registra, cuando la moneda del techo no es la de esta
 * tabla: sin tipo de cambio, cualquier cifra sería inventada, y una cifra
 * inventada en una factura es peor que un cero explicable.
 */
export function priceGenerationMinor(input: {
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly currency: string;
}): bigint {
  if (input.currency !== AI_PRICE_CURRENCY) {
    logger.warn('No se puede calcular el costo de la IA: la moneda del proveedor no coincide con la tabla de precios', {
      module: 'ai',
      outcome: 'failed',
      context: { configurada: input.currency, tabla: AI_PRICE_CURRENCY },
    });
    return 0n;
  }

  const tarifa = TARIFAS[input.model];
  if (tarifa === undefined) {
    logger.warn('Modelo sin tarifa conocida: se cobra a la tarifa más cara para no subestimar el gasto', {
      module: 'ai',
      context: { model: input.model },
    });
  }
  const efectiva = tarifa ?? TARIFA_CONSERVADORA;

  const porTokens = (tokens: number, porMillon: bigint): bigint => {
    if (tokens <= 0) return 0n;
    const numerador = BigInt(tokens) * porMillon;
    // Redondeo hacia arriba: (a + b - 1) / b con enteros.
    return (numerador + 999_999n) / 1_000_000n;
  };

  return porTokens(input.promptTokens, efectiva.input) + porTokens(input.completionTokens, efectiva.output);
}
