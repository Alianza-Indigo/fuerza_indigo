import { describe, expect, it } from 'vitest';
import {
  CLAVES_DE_REGLA,
  alcanzaMayoria,
  leerReglas,
  reglasFaltantes,
  type NormativeRules,
} from '@/modules/governance/domain';

/**
 * Umbrales estatutarios (PRD §9.3, §9.4; F5-GOB-003).
 *
 * Lo que se comprueba aquí es que **la ausencia se note**. Un umbral que falta
 * y se lee como cero convierte «no lo sabemos» en «cero días de anticipación»,
 * y eso pasa desapercibido hasta que alguien impugna una asamblea.
 */

const COMPLETAS: NormativeRules = {
  executiveCommitteeTermMonths: 48,
  oversightCommissionSeats: 3,
  electoralCommissionSeats: 3,
  firstCallQuorum: 'HALF_PLUS_ONE',
  secondCallQuorum: 'THOSE_PRESENT',
  ordinaryMajority: 'SIMPLE',
  ordinaryAssemblyMinimumPerYear: 1,
  assemblyNoticeDaysOrdinary: 15,
  assemblyNoticeDaysExtraordinary: 8,
  extraordinaryAssemblyPetitionPercent: 33,
  reelectionAllowed: false,
  statuteAmendmentMajority: 'TWO_THIRDS',
  dissolutionMajority: 'THREE_FOURTHS',
  electionCallNoticeDays: 30,
  genderProportionalityMinPercent: 40,
  disciplinaryAnswerDays: 10,
  disciplinaryAppealDays: 15,
  bargainingConsultationMajority: 'SIMPLE',
};

describe('umbrales estatutarios', () => {
  it('un conjunto completo se lee entero', () => {
    expect(leerReglas(COMPLETAS)).toEqual(COMPLETAS);
    expect(reglasFaltantes(COMPLETAS)).toEqual([]);
  });

  it('falta un umbral y la lectura devuelve nulo en vez de un cero', () => {
    const { assemblyNoticeDaysOrdinary: _omitido, ...incompletas } = COMPLETAS;

    expect(leerReglas(incompletas)).toBeNull();
    expect(reglasFaltantes(incompletas)).toContain('Anticipación de la convocatoria ordinaria (días)');
  });

  it('cada umbral declarado es obligatorio', () => {
    // Si mañana alguien añade un campo al esquema y olvida exigirlo, esta
    // prueba lo dice: quitar cualquiera de ellos tiene que impedir la lectura.
    for (const clave of CLAVES_DE_REGLA) {
      const sinUno: Record<string, unknown> = { ...COMPLETAS };
      delete sinUno[clave];
      expect(leerReglas(sinUno), `falta ${clave} y la lectura no lo notó`).toBeNull();
    }
  });

  it('un valor imposible se rechaza', () => {
    expect(leerReglas({ ...COMPLETAS, assemblyNoticeDaysOrdinary: 0 })).toBeNull();
    expect(leerReglas({ ...COMPLETAS, oversightCommissionSeats: -1 })).toBeNull();
    expect(leerReglas({ ...COMPLETAS, firstCallQuorum: 'LO_QUE_SEA' })).toBeNull();
  });

  it('lo que no es un objeto no se lee como reglas', () => {
    for (const basura of [null, undefined, 'texto', 42, []]) {
      expect(leerReglas(basura)).toBeNull();
    }
  });
});

describe('mayorías', () => {
  it('la simple compara a favor con en contra y no cuenta abstenciones', () => {
    // 5 a favor, 4 en contra, 11 abstenciones: hay mayoría simple aunque el
    // «sí» no llegue a la mitad de lo emitido. Es la definición, y confundirla
    // con la absoluta rechaza acuerdos legítimos.
    expect(alcanzaMayoria('SIMPLE', 5, 4, 20)).toBe(true);
    expect(alcanzaMayoria('SIMPLE', 4, 5, 20)).toBe(false);
    expect(alcanzaMayoria('SIMPLE', 5, 5, 20)).toBe(false);
  });

  it('las calificadas se miden sobre lo emitido, abstenciones incluidas', () => {
    expect(alcanzaMayoria('TWO_THIRDS', 20, 10, 30)).toBe(true);
    // Mismos votos a favor y en contra, pero con abstenciones el listón sube.
    expect(alcanzaMayoria('TWO_THIRDS', 20, 10, 40)).toBe(false);
    expect(alcanzaMayoria('THREE_FOURTHS', 30, 10, 40)).toBe(true);
    expect(alcanzaMayoria('THREE_FOURTHS', 29, 11, 40)).toBe(false);
  });

  it('sin votos emitidos no hay mayoría calificada', () => {
    expect(alcanzaMayoria('TWO_THIRDS', 0, 0, 0)).toBe(false);
  });
});
