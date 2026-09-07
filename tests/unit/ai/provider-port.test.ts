import { afterEach, describe, expect, it } from 'vitest';
import { aiProvider, setAiProviderForTests } from '@/platform/ai/provider-port';

/**
 * El adaptador de Gemini es **solo de servidor** (PRD §15.1).
 *
 * Correrlo en el navegador llevaría la clave al cliente. El control `C-F8-01` lo
 * impide por construcción —la clave nunca lleva `NEXT_PUBLIC_` y el host solo
 * aparece en el puerto—; este guardia lo impide además en tiempo de ejecución,
 * para que un `import` equivocado falle en voz alta en vez de filtrar en silencio.
 */

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  setAiProviderForTests(null);
});

describe('el adaptador HTTP de Gemini', () => {
  it('se niega a correr si hay un objeto window, que es señal de estar en el cliente', async () => {
    (globalThis as { window?: unknown }).window = {};
    await expect(
      aiProvider().generate({
        apiKey: 'da-igual',
        model: 'gemini-2.5-flash',
        systemText: 's',
        userText: 'u',
        temperature: 0.2,
        maxOutputTokens: 32,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/solo de servidor/);
  });

  it('en el servidor, sin clave, es un defecto de quien llama y no una llamada a ciegas', async () => {
    // Sin `window` (Node) el guardia pasa; con la clave vacía, el puerto se niega
    // en vez de mandar una petición sin credencial que se confundiría con una caída.
    await expect(
      aiProvider().generate({
        apiKey: '',
        model: 'gemini-2.5-flash',
        systemText: 's',
        userText: 'u',
        temperature: 0.2,
        maxOutputTokens: 32,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/sin clave/);
  });
});
