import { describe, expect, it } from 'vitest';
import { huellaDePadron, type RosterEntryShape } from '@/modules/assembly/domain';

/**
 * Huella del padrón congelado (PRD §9.4; F5-ASA-003).
 *
 * La propiedad que importa: **quien reciba el padrón puede recomputar la huella
 * y comparar**. Para eso tiene que dar el mismo valor con las mismas entradas
 * en cualquier orden, y uno distinto en cuanto cambie cualquier cosa.
 */

function entrada(numero: string, conVoto = true): RosterEntryShape {
  return {
    membershipId: `00000000-0000-4000-8000-${numero.padStart(12, '0')}`,
    memberNumber: numero,
    territorialUnitId: null,
    hasVoice: true,
    hasVote: conVoto,
  };
}

describe('huella del padrón congelado', () => {
  it('no depende del orden en que la base devuelva las filas', () => {
    const padron = [entrada('A-003'), entrada('A-001'), entrada('A-002')];
    const alReves = [...padron].reverse();

    expect(huellaDePadron(padron)).toBe(huellaDePadron(alReves));
  });

  it('cambia si se añade una persona', () => {
    const padron = [entrada('A-001'), entrada('A-002')];
    expect(huellaDePadron([...padron, entrada('A-003')])).not.toBe(huellaDePadron(padron));
  });

  it('cambia si se quita una persona', () => {
    const padron = [entrada('A-001'), entrada('A-002'), entrada('A-003')];
    expect(huellaDePadron(padron.slice(0, 2))).not.toBe(huellaDePadron(padron));
  });

  it('cambia si a alguien se le quita el voto', () => {
    // Es la alteración más silenciosa y la más grave: el número de personas no
    // cambia, así que un control que solo contara filas no la vería.
    const padron = [entrada('A-001'), entrada('A-002')];
    const alterado = [entrada('A-001'), entrada('A-002', false)];

    expect(huellaDePadron(alterado)).not.toBe(huellaDePadron(padron));
  });

  it('un padrón vacío tiene huella y no lanza', () => {
    expect(huellaDePadron([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la huella es de sesenta y cuatro caracteres hexadecimales', () => {
    expect(huellaDePadron([entrada('A-001')])).toMatch(/^[0-9a-f]{64}$/);
  });
});
