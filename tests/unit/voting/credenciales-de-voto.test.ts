import { describe, expect, it } from 'vitest';
import {
  credencialValida,
  emitirCredencial,
  huellaDeCredencial,
  nuevaSalDeProceso,
  nuevoCodigoDeVerificacion,
} from '@/modules/voting/domain';

/**
 * Secreto del voto: la parte que se puede comprobar sin base de datos
 * (ADR-0012).
 *
 * Estas pruebas son adversarias a propósito: no comprueban que la función
 * «funcione», sino que **no se pueda hacer** lo que el diseño promete que es
 * imposible.
 */
describe('credencial de voto', () => {
  it('una credencial vale para su proceso y no para otro', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const salA = nuevaSalDeProceso();
    const salB = nuevaSalDeProceso();

    const credencial = emitirCredencial(secreto, salA);

    expect(credencialValida(secreto, salA, credencial)).toBe(true);
    // Llevar la credencial de una votación a otra es el fraude más obvio, y el
    // que una clave derivada por proceso cierra de raíz.
    expect(credencialValida(secreto, salB, credencial)).toBe(false);
  });

  it('sin la sal del proceso, la credencial ya no puede validarse ni fabricarse', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();
    const credencial = emitirCredencial(secreto, sal);

    // Al certificar, la sal se borra. Quien conserve el secreto maestro y la
    // credencial no puede derivar la clave sin ella: eso es lo que significa
    // «la clave se destruye».
    const otraSal = nuevaSalDeProceso();
    expect(credencialValida(secreto, otraSal, credencial)).toBe(false);
  });

  it('una credencial alterada en un solo carácter deja de valer', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();
    const credencial = emitirCredencial(secreto, sal);

    const alterada = `${credencial.slice(0, -1)}${credencial.endsWith('A') ? 'B' : 'A'}`;
    expect(credencialValida(secreto, sal, alterada)).toBe(false);
  });

  it('dos credenciales del mismo proceso nunca coinciden', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();

    const emitidas = new Set(Array.from({ length: 500 }, () => emitirCredencial(secreto, sal)));
    expect(emitidas.size).toBe(500);
  });

  it('la huella no revela la credencial y distingue credenciales distintas', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();
    const a = emitirCredencial(secreto, sal);
    const b = emitirCredencial(secreto, sal);

    expect(huellaDeCredencial(a)).toBe(huellaDeCredencial(a));
    expect(huellaDeCredencial(a)).not.toBe(huellaDeCredencial(b));
    expect(huellaDeCredencial(a)).not.toContain(a.slice(3, 20));
  });

  it('el código de verificación no contiene nada de la credencial', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();
    const credencial = emitirCredencial(secreto, sal);
    const codigo = nuevoCodigoDeVerificacion();

    // Si el código se derivara de la credencial, publicar la lista de códigos
    // escrutados permitiría a quien tuviera una credencial demostrar cuál fue
    // su boleta, y con ello coaccionar.
    expect(credencial).not.toContain(codigo);
    expect(codigo).not.toContain(credencial.slice(3, 15));
  });

  it('una credencial mal formada se rechaza sin lanzar', () => {
    const secreto = 'secreto-maestro-de-prueba';
    const sal = nuevaSalDeProceso();

    for (const basura of ['', 'v1', 'v1.solo-dos', 'v2.a.b', 'a.b.c.d', '   ']) {
      expect(credencialValida(secreto, sal, basura)).toBe(false);
    }
  });
});
