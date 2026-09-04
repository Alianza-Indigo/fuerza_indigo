import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Identificadores y utilidades criptográficas de uso general
 * (docs/DATA_MODEL.md §3, ADR-0010).
 */

/**
 * Alfabeto base32 de Crockford, sin las letras que se confunden al leerse en voz
 * alta o al teclearse: I, L, O y U. Importa porque estos códigos se dictan por
 * teléfono y se transcriben a mano en oficinas territoriales.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Identificador público opaco, sin relación alguna con la clave primaria.
 * Conocer uno no permite inferir otro, ni deducir volumen ni antigüedad.
 */
export function newPublicId(length = 22): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[bytes[i]! % CROCKFORD.length];
  return out;
}

/** Identificador de correlación de una petición (docs/ARCHITECTURE.md §12). */
export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Testigo opaco de sesión o de recuperación. Se entrega a la persona una sola
 * vez; la base guarda únicamente su hash.
 */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash del testigo. SHA-256 basta: el valor ya es aleatorio de 32 bytes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Seudonimización de la dirección IP. No se conserva en claro (PRD §20.3), pero
 * se necesita poder reconocer repeticiones para detectar abuso.
 */
export function hashIp(ip: string | null, salt: string): string | null {
  if (ip === null || ip === '') return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/**
 * Huella estable de un identificador, para agrupar sin conservarlo en claro.
 *
 * Se usa como clave del límite de intentos. Antes se usaba el correo
 * **enmascarado**, y la máscara no es inyectiva: `pedro@dominio` y
 * `paula@dominio` producen los dos `pe…o@dominio`… y peor, cualquier par que
 * comparta las dos primeras letras, la última y el dominio. Dos personas
 * distintas compartían cupo, de modo que los intentos fallidos contra una cuenta
 * bloqueaban otra, por accidente o a propósito (`D-F1-015`).
 *
 * La máscara sigue siendo la forma correcta de **mostrar** un correo en una
 * bitácora. Lo que no puede es servir de clave.
 */
export function fingerprint(value: string, salt: string): string {
  return createHmac('sha256', salt).update(value.trim().toLowerCase()).digest('hex');
}

/** Comparación en tiempo constante. Evita distinguir por duración. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Se compara igualmente contra sí mismo para no revelar la diferencia de
    // longitud por el tiempo de respuesta.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Resumen legible y acotado del agente de usuario. Nunca la cadena completa. */
export function summarizeUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent === '') return null;
  return userAgent.slice(0, 200);
}

export function classifyUserAgent(userAgent: string | null): 'MOBILE' | 'DESKTOP' | 'BOT' | 'UNKNOWN' {
  if (userAgent === null || userAgent === '') return 'UNKNOWN';
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|curl|wget|headless/.test(value)) return 'BOT';
  if (/mobile|android|iphone|ipad/.test(value)) return 'MOBILE';
  return 'DESKTOP';
}
