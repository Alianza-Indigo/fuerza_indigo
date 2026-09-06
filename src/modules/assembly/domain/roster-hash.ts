import { createHash } from 'node:crypto';

/**
 * Huella del padrón congelado: la parte pura, y la que hace verificable todo lo
 * demás (PRD §9.4, ADR-0027).
 *
 * Vive en el dominio porque **la comprobación no puede depender de quien
 * emitió el padrón**. Quien reciba las entradas ejecuta esta función por su
 * cuenta y compara con la huella publicada; si tuviera que pedirle el cálculo a
 * la misma plataforma que guarda el padrón, la comprobación no probaría nada.
 */

export interface RosterEntryShape {
  readonly membershipId: string;
  readonly memberNumber: string;
  readonly territorialUnitId: string | null;
  readonly hasVoice: boolean;
  readonly hasVote: boolean;
}

/**
 * Huella canónica del padrón.
 *
 * Una línea por entrada, ordenadas por número de miembro, con los campos
 * separados por barra vertical. El orden es parte de la definición: sin él, dos
 * padrones idénticos producirían huellas distintas según el orden en que la
 * base devolviera las filas, y la comprobación no serviría de nada.
 *
 * Es una función pura y exportada a propósito: quien reciba el padrón la
 * ejecuta por su cuenta y compara. Una huella que solo puede calcular quien la
 * emitió no prueba nada.
 */
export function huellaDePadron(entradas: readonly RosterEntryShape[]): string {
  const canonico = [...entradas]
    .sort((a, b) => a.memberNumber.localeCompare(b.memberNumber, 'en'))
    .map(
      (entrada) =>
        `${entrada.memberNumber}|${entrada.membershipId}|${entrada.territorialUnitId ?? ''}|${entrada.hasVoice ? '1' : '0'}|${entrada.hasVote ? '1' : '0'}`,
    )
    .join('\n');
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

