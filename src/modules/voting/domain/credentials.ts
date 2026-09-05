import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Credencial de voto (ADR-0012).
 *
 * **El servidor no guarda la credencial ni su huella al emitirla.** Se generan
 * treinta y dos bytes aleatorios, se firman con la clave del proceso y se
 * entregan a la persona. Del lado identificado solo queda que se emitió y en
 * qué fecha civil —sin hora—, de modo que no hay ningún dato con el que unir a
 * una persona con una boleta.
 *
 * La huella aparece **una sola vez**, al depositar: entonces se escribe en
 * `SpentVoteCredential`, que no tiene ni tiempo ni identidad, y sirve
 * únicamente para impedir el segundo depósito.
 *
 * La clave de firma se deriva del secreto del entorno y de la sal del proceso.
 * Al certificar los resultados la sal se borra: la clave deja de poder
 * derivarse y nadie puede fabricar credenciales válidas retroactivamente,
 * aunque conserve el secreto maestro.
 */

const VERSION = 'v1';

/** Sal nueva de un proceso. Se guarda con él y se borra al certificar. */
export function nuevaSalDeProceso(): string {
  return randomBytes(24).toString('base64url');
}

/** Clave de firma del proceso. Nunca se guarda: se deriva cada vez. */
function claveDeProceso(secretoMaestro: string, sal: string): Buffer {
  return createHmac('sha256', secretoMaestro).update(`voto:${sal}`).digest();
}

/**
 * Emite una credencial. El valor devuelto es lo único que existe: en cuanto la
 * función retorna, nadie más puede reconstruirlo.
 */
export function emitirCredencial(secretoMaestro: string, sal: string): string {
  const cuerpo = randomBytes(32).toString('base64url');
  const firma = createHmac('sha256', claveDeProceso(secretoMaestro, sal)).update(cuerpo).digest('base64url');
  return `${VERSION}.${cuerpo}.${firma}`;
}

/** Comprueba la firma de una credencial presentada. */
export function credencialValida(secretoMaestro: string, sal: string, credencial: string): boolean {
  const partes = credencial.trim().split('.');
  if (partes.length !== 3) return false;
  const [version, cuerpo, firma] = partes;
  if (version !== VERSION || cuerpo === undefined || firma === undefined) return false;

  const esperada = createHmac('sha256', claveDeProceso(secretoMaestro, sal)).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) {
    // Se compara igualmente contra sí misma para no revelar por duración que la
    // longitud no coincidía.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Huella de la credencial presentada.
 *
 * Solo se calcula al depositar. Es `sha256` del valor completo, y como el valor
 * contiene treinta y dos bytes aleatorios, la huella no permite deducir nada de
 * quien la presentó: no hay diccionario que recorrer.
 */
export function huellaDeCredencial(credencial: string): string {
  return createHash('sha256').update(credencial.trim(), 'utf8').digest('hex');
}

/**
 * Código de verificación de una boleta.
 *
 * La persona lo conserva y comprueba en la lista publicada que su boleta fue
 * contada. La lista enseña los códigos, no su sentido: se verifica inclusión
 * sin poder demostrar ante nadie por quién se votó, que es lo que retira el
 * instrumento de la coacción.
 */
export function nuevoCodigoDeVerificacion(): string {
  return randomBytes(15).toString('base64url').toUpperCase();
}

/** Código de acuse, entregado al recibir la credencial. */
export function nuevoCodigoDeAcuse(): string {
  return randomBytes(12).toString('base64url').toUpperCase();
}
