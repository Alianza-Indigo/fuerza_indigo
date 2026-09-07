import { describe, expect, it } from 'vitest';
import { priceGenerationMinor, AI_PRICE_CURRENCY } from '@/platform/ai/pricing';

/**
 * Precio de una ejecución (ADR-0138).
 *
 * El costo alimenta el techo mensual, así que tiene que ser fiel: redondear hacia
 * arriba para no regalar fracciones, cobrar de más ante un modelo desconocido
 * —subestimar el gasto no es seguro— y negarse a inventar una cifra cuando la
 * moneda no coincide.
 */

describe('priceGenerationMinor', () => {
  it('cobra por tokens de entrada y de salida, redondeando hacia arriba', () => {
    // gemini-2.5-flash: 150 centavos/millón de entrada, 600 de salida.
    // 1 000 000 de entrada = 150; 1 de salida = ceil(600/1e6) = 1.
    const c = priceGenerationMinor({
      model: 'gemini-2.5-flash',
      promptTokens: 1_000_000,
      completionTokens: 1,
      currency: AI_PRICE_CURRENCY,
    });
    expect(c).toBe(151n);
  });

  it('no cobra por una ejecución sin tokens', () => {
    expect(
      priceGenerationMinor({ model: 'gemini-2.5-flash', promptTokens: 0, completionTokens: 0, currency: AI_PRICE_CURRENCY }),
    ).toBe(0n);
  });

  it('cobra a la tarifa más cara conocida ante un modelo sin tarifa', () => {
    const conocido = priceGenerationMinor({
      model: 'gemini-2.5-pro',
      promptTokens: 1_000_000,
      completionTokens: 0,
      currency: AI_PRICE_CURRENCY,
    });
    const desconocido = priceGenerationMinor({
      model: 'un-modelo-que-nadie-tarifó',
      promptTokens: 1_000_000,
      completionTokens: 0,
      currency: AI_PRICE_CURRENCY,
    });
    expect(desconocido).toBe(conocido);
    expect(desconocido).toBeGreaterThan(0n);
  });

  it('devuelve cero cuando la moneda no es la de la tabla, en vez de inventar una cifra', () => {
    expect(
      priceGenerationMinor({ model: 'gemini-2.5-flash', promptTokens: 1_000_000, completionTokens: 1_000_000, currency: 'USD' }),
    ).toBe(0n);
  });
});
