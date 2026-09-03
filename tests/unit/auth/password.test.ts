import { describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  CURRENT_PARAMS,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  needsRehash,
  verifyPassword,
} from '@/platform/auth/password';

/** Argon2id y política de contraseñas (ADR-0003, PRD §20.1). */

describe('hashPassword y verifyPassword', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const { hash } = await hashPassword('una frase larga que recuerdo');
    expect(await verifyPassword(hash, 'una frase larga que recuerdo')).toBe(true);
    expect(await verifyPassword(hash, 'una frase larga que recuerd')).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos: la sal es aleatoria', async () => {
    const a = await hashPassword('la misma frase de siempre');
    const b = await hashPassword('la misma frase de siempre');
    expect(a.hash).not.toBe(b.hash);
  });

  it('el hash lleva la marca de Argon2id y sus parámetros', async () => {
    const { hash, params } = await hashPassword('otra frase distinta aquí');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(params).toEqual(CURRENT_PARAMS);
  });

  it('un hash corrupto no se distingue de una contraseña incorrecta', async () => {
    // Si lanzara, el error revelaría por la vía de la excepción que ESA cuenta
    // tiene un problema, que es información sobre la cuenta.
    expect(await verifyPassword('esto-no-es-un-hash', 'lo que sea')).toBe(false);
    expect(await verifyPassword('', 'lo que sea')).toBe(false);
  });

  it('conserva los acentos: la frase se verifica tal como se escribió', async () => {
    const { hash } = await hashPassword('mañana temprano en Michoacán');
    expect(await verifyPassword(hash, 'mañana temprano en Michoacán')).toBe(true);
    expect(await verifyPassword(hash, 'manana temprano en Michoacan')).toBe(false);
  });
});

describe('needsRehash', () => {
  it('los parámetros vigentes no exigen recifrado', () => {
    expect(needsRehash(CURRENT_PARAMS)).toBe(false);
  });

  it('parámetros más débiles exigen recifrado', () => {
    expect(needsRehash({ ...CURRENT_PARAMS, memoryCost: 4096 })).toBe(true);
    expect(needsRehash({ ...CURRENT_PARAMS, timeCost: 1 })).toBe(true);
    expect(needsRehash({ ...CURRENT_PARAMS, parallelism: 4 })).toBe(true);
  });

  it('la ausencia de parámetros exige recifrado', () => {
    // Un hash sin parámetros registrados es anterior a esta política: se eleva
    // en el siguiente inicio de sesión en vez de quedarse como está.
    expect(needsRehash(null)).toBe(true);
    expect(needsRehash(undefined)).toBe(true);
  });
});

describe('checkPasswordPolicy', () => {
  it('acepta una frase larga y corriente', () => {
    expect(checkPasswordPolicy('el perro corre por el parque').ok).toBe(true);
  });

  it('exige longitud mínima y lo explica sin exigir símbolos', () => {
    const resultado = checkPasswordPolicy('corta1');
    expect(resultado.ok).toBe(false);
    expect(resultado.problems[0]).toContain(String(MIN_PASSWORD_LENGTH));
    // Las reglas de composición empeoran la usabilidad sin mejorar la
    // seguridad: la política no debe exigirlas. El mensaje puede mencionar los
    // símbolos, pero solo para decir que no hacen falta.
    expect(resultado.problems.join(' ')).not.toMatch(/debes? (incluir|usar|contener)|al menos una (mayúscula|minúscula|cifra)/i);
    expect(checkPasswordPolicy('todo en minusculas sin cifras').ok).toBe(true);
  });

  it('rechaza contraseñas de listas públicas', () => {
    expect(checkPasswordPolicy('contrasena123').ok).toBe(false);
    expect(checkPasswordPolicy('CONTRASEÑA123').ok).toBe(false);
  });

  it('rechaza incluir el propio correo o el propio nombre', () => {
    expect(checkPasswordPolicy('mariana-y-su-clave', { email: 'mariana@fuerzaindigo.lat' }).ok).toBe(false);
    expect(checkPasswordPolicy('mariana-y-su-clave', { givenName: 'Mariana' }).ok).toBe(false);
  });

  it('un correo corto no dispara la regla del correo', () => {
    // Con una parte local de tres letras, casi cualquier frase la contendría.
    expect(checkPasswordPolicy('la casa azul del cerro', { email: 'ana@fuerzaindigo.lat' }).ok).toBe(true);
  });

  it('rechaza un solo carácter repetido', () => {
    expect(checkPasswordPolicy('aaaaaaaaaaaaaaaa').ok).toBe(false);
  });

  it('acumula todos los problemas en vez de detenerse en el primero', () => {
    // Quien crea su contraseña debe poder corregirlo todo de una vez.
    const resultado = checkPasswordPolicy('mariana', { email: 'mariana@fuerzaindigo.lat' });
    expect(resultado.problems.length).toBeGreaterThan(1);
  });
});
