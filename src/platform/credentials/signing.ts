import { createHmac } from 'node:crypto';

import { env } from '@/platform/config/env';
import { newPublicId, safeEquals } from '@/platform/kernel/ids';

/**
 * Código opaco y firmado de una credencial (PRD §7.4, ADR-0029).
 *
 * **El QR no lleva datos personales.** Lleva un código que no dice nada por sí
 * mismo —ni nombre, ni número de miembro, ni identificador de base— y una firma
 * que acredita que ese código lo emitió esta organización. Quien fotografíe el
 * QR de otra persona obtiene una cadena sin significado; quien lo escanee llega
 * al verificador, que decide qué enseñar.
 *
 * **La firma no sustituye a la base de datos**, la precede. Sirve para dos
 * cosas concretas: descartar un código inventado sin tocar la base —de otro modo
 * cada intento de adivinar sería una consulta— y hacer inútil fabricar un QR
 * con un código plausible. Lo que decide si la credencial vale sigue siendo su
 * estado, que se lee siempre en vivo.
 *
 * **El identificador de clave viaja con el código** para que rotar el llavero no
 * invalide de golpe lo ya impreso (defecto `D-F0-012`): una credencial firmada
 * con `k1` se sigue verificando mientras `k1` siga en el llavero, aunque las
 * nuevas se firmen con `k2`.
 */

/** Longitud del código. 20 símbolos de Crockford ≈ 100 bits. */
const LARGO_DEL_CODIGO = 20;

/**
 * Bytes de firma que viajan en el QR. Doce bytes —dieciséis caracteres en
 * base64url— bastan de sobra para el trabajo que hace: no protege un secreto,
 * descarta falsificaciones, y quien quisiera acertar una a ciegas necesitaría
 * 2⁹⁶ intentos contra un verificador que además registra cada consulta.
 */
const BYTES_DE_FIRMA = 12;

export interface CodigoFirmado {
  readonly publicCode: string;
  readonly signingKeyId: string;
  readonly signature: string;
  /** Lo que se escribe dentro del QR: `código.clave.firma`. */
  readonly token: string;
}

function firmar(secreto: string, codigo: string): string {
  return createHmac('sha256', secreto).update(codigo).digest('base64url').slice(0, BYTES_DE_FIRMA * 2);
}

/** Emite un código nuevo con la clave activa del llavero. */
export function nuevoCodigoFirmado(): CodigoFirmado {
  const activa = env().QR_SIGNING_SECRET.active;
  const publicCode = newPublicId(LARGO_DEL_CODIGO);
  const signature = firmar(activa.secret, publicCode);
  return {
    publicCode,
    signingKeyId: activa.keyId,
    signature,
    token: `${publicCode}.${activa.keyId}.${signature}`,
  };
}

/** Rearma el token de una credencial ya emitida, para volver a dibujar su QR. */
export function tokenDe(credencial: {
  publicCode: string;
  signingKeyId: string;
  signature: string;
}): string {
  return `${credencial.publicCode}.${credencial.signingKeyId}.${credencial.signature}`;
}

export type LecturaDeToken =
  /** Venía firmado y la firma cuadra: el código se puede buscar. */
  | { readonly clase: 'FIRMADO'; readonly publicCode: string }
  /**
   * Venía sin firma: alguien tecleó el código a mano. Se busca igual, porque el
   * estado en la base es la respuesta verdadera, pero se sabe que no hubo firma
   * que comprobar.
   */
  | { readonly clase: 'SIN_FIRMA'; readonly publicCode: string }
  /** Venía firmado y la firma no cuadra, o el formato no es el que es. */
  | { readonly clase: 'INVALIDO' };

/** Solo los símbolos del alfabeto de Crockford que usa `newPublicId`. */
const CODIGO = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8,40}$/;

/**
 * Lee lo que llegó por la dirección del verificador.
 *
 * Acepta las dos formas en que un código llega de verdad: escaneado —con su
 * clave y su firma— y dictado por teléfono o copiado a mano —solo el código—.
 * La segunda existe porque estas credenciales se usan en oficinas territoriales
 * donde no siempre hay cámara, y porque el alfabeto se eligió para poder
 * dictarlo (`newPublicId`). Negarse a comprobar un código tecleado convertiría
 * una medida de seguridad en una barrera de accesibilidad, sin ganar nada: el
 * estado en la base es igual de autoritativo por los dos caminos.
 */
export function leerToken(entrada: string): LecturaDeToken {
  const limpio = entrada.trim().toUpperCase().replace(/\s+/g, '');
  if (limpio === '') return { clase: 'INVALIDO' };

  const partes = limpio.split('.');

  if (partes.length === 1) {
    const codigo = partes[0]!;
    return CODIGO.test(codigo) ? { clase: 'SIN_FIRMA', publicCode: codigo } : { clase: 'INVALIDO' };
  }

  if (partes.length !== 3) return { clase: 'INVALIDO' };
  const [codigo, keyId, firma] = partes as [string, string, string];
  if (!CODIGO.test(codigo)) return { clase: 'INVALIDO' };

  // El identificador de clave y la firma sí distinguen mayúsculas: se
  // recuperan del original, que no se tocó más que para quitar espacios.
  const original = entrada.trim().replace(/\s+/g, '').split('.');
  const claveOriginal = original[1] ?? keyId;
  const firmaOriginal = original[2] ?? firma;

  const clave = env().QR_SIGNING_SECRET.all.find((una) => una.keyId === claveOriginal);
  if (clave === undefined) return { clase: 'INVALIDO' };

  return safeEquals(firmar(clave.secret, codigo), firmaOriginal)
    ? { clase: 'FIRMADO', publicCode: codigo }
    : { clase: 'INVALIDO' };
}
