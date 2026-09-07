import { afterEach, describe, expect, it } from 'vitest';
import { resolveAiApiKey } from '@/platform/config/ai-key';

/**
 * Resolución de la clave del proveedor por el nombre de su variable (ADR-0136).
 *
 * La clave se guarda en el entorno y la fila del proveedor guarda solo el
 * **nombre** de la variable. Aquí se comprueba que ese nombre se resuelva a su
 * valor, que la ausencia sea la cadena vacía —la señal de degradación, no un
 * error— y que un valor que no parece un nombre de variable se rechace: es la
 * defensa ante una clave pegada donde va un nombre.
 */

const VARIABLE = 'AI_KEY_PRUEBA_UNITARIA';

afterEach(() => {
  delete process.env[VARIABLE];
});

describe('resolveAiApiKey', () => {
  it('devuelve el valor de la variable nombrada', () => {
    process.env[VARIABLE] = 'clave-secreta-de-prueba';
    expect(resolveAiApiKey(VARIABLE)).toBe('clave-secreta-de-prueba');
  });

  it('devuelve la cadena vacía cuando la variable no está definida', () => {
    expect(resolveAiApiKey(VARIABLE)).toBe('');
  });

  it('rechaza un nombre que en realidad es una clave', () => {
    // Una clave de Gemini empieza con «AIza» y sigue en minúsculas: no tiene
    // forma de nombre de variable, y resolverla como tal leería
    // process.env['AIza…'], que devuelve indefinido y haría parecer «sin clave»
    // a un proveedor que sí la tiene.
    expect(() => resolveAiApiKey('AIzaSyD-una-clave-de-verdad')).toThrow(/forma de nombre de variable/);
  });

  it('rechaza un nombre en minúsculas o con guiones', () => {
    expect(() => resolveAiApiKey('gemini_api_key')).toThrow();
    expect(() => resolveAiApiKey('GEMINI-API-KEY')).toThrow();
  });
});
