import { describe, expect, it } from 'vitest';
import { proponerCanalizacion, NOMBRE_DE_MATERIA } from '@/modules/support/domain';
import type { SupportRequestType } from '@prisma-client/enums';

/**
 * Clasificación informativa y propuesta de canalización (PRD §10.1, F6-CAS-002).
 *
 * Lo que se comprueba no es que la tabla diga lo que dice —eso sería copiarla—,
 * sino las propiedades que tiene que cumplir **cualquier** versión de ella:
 * que toda materia tenga propuesta, que ninguna propuesta llegue sin motivo,
 * que lo laboral vaya al sindicato y lo social a la asociación, y que la
 * elección de la persona mande sobre la tabla.
 */

const TODAS: readonly SupportRequestType[] = [
  'GENERAL_CONTACT',
  'INDIVIDUAL_LABOR_DISPUTE',
  'COLLECTIVE_DISPUTE',
  'DISCRIMINATION_OR_ADJUSTMENTS',
  'EDUCATION_ACCESS',
  'HEALTH_ACCESS',
  'ACCESSIBILITY',
  'FAMILY_GUIDANCE',
  'PSYCHOSOCIAL_RISK',
  'VIOLENCE_OR_URGENCY',
  'TRAINING_OR_INSTITUTIONAL_SUPPORT',
  'OTHER',
];

describe('toda materia tiene propuesta, y ninguna llega muda', () => {
  it('las doce materias del catálogo proponen entidad, dominio y motivo', () => {
    for (const materia of TODAS) {
      const propuesta = proponerCanalizacion({ requestType: materia });
      expect(['FUERZA_INDIGO', 'ALIANZA_INDIGO'], materia).toContain(propuesta.entidad);
      expect(['UNION_DEFENSE', 'SOCIAL_ATTENTION'], materia).toContain(propuesta.dominio);
      // El motivo es lo que lee quien confirma y quien recibe. Una propuesta sin
      // motivo es una orden sin fundamento.
      expect(propuesta.motivo.length, materia).toBeGreaterThan(40);
      expect(NOMBRE_DE_MATERIA[materia]).toBeTruthy();
    }
  });

  it('la alternativa, cuando la hay, es la otra entidad y no la misma', () => {
    for (const materia of TODAS) {
      const propuesta = proponerCanalizacion({ requestType: materia });
      if (propuesta.alternativa !== null) {
        expect(propuesta.alternativa, materia).not.toBe(propuesta.entidad);
      }
    }
  });

  it('el dominio corresponde con la entidad que se propone', () => {
    // El compartimento del expediente sale del dominio, así que proponer la
    // asociación civil con dominio sindical abriría el expediente en el
    // compartimento equivocado.
    for (const materia of TODAS) {
      const propuesta = proponerCanalizacion({ requestType: materia });
      const esperado = propuesta.entidad === 'FUERZA_INDIGO' ? 'UNION_DEFENSE' : 'SOCIAL_ATTENTION';
      expect(propuesta.dominio, materia).toBe(esperado);
    }
  });
});

describe('el reparto sigue a la institución, no a la técnica', () => {
  it('lo que ocurre en la relación de trabajo va al sindicato', () => {
    for (const materia of ['INDIVIDUAL_LABOR_DISPUTE', 'COLLECTIVE_DISPUTE'] as const) {
      expect(proponerCanalizacion({ requestType: materia }).entidad).toBe('FUERZA_INDIGO');
    }
  });

  it('la atención educativa, de salud y familiar va a la asociación civil', () => {
    for (const materia of ['EDUCATION_ACCESS', 'HEALTH_ACCESS', 'FAMILY_GUIDANCE'] as const) {
      expect(proponerCanalizacion({ requestType: materia }).entidad).toBe('ALIANZA_INDIGO');
    }
  });

  it('un conflicto laboral entra como prioritario y una consulta de accesibilidad no', () => {
    // No es un matiz: un conflicto laboral tiene plazos que se pierden.
    expect(proponerCanalizacion({ requestType: 'INDIVIDUAL_LABOR_DISPUTE' }).urgencia).toBe('PRIORITY');
    expect(proponerCanalizacion({ requestType: 'ACCESSIBILITY' }).urgencia).toBe('ROUTINE');
  });
});

describe('el riesgo inmediato se marca donde de verdad puede haberlo', () => {
  it('violencia o urgencia entra como urgente y con protocolo a la vista', () => {
    const propuesta = proponerCanalizacion({ requestType: 'VIOLENCE_OR_URGENCY' });
    expect(propuesta.urgencia).toBe('URGENT');
    expect(propuesta.requiereProtocoloDeRiesgo).toBe(true);
  });

  it('un riesgo psicosocial también enseña el protocolo, sin declararse urgente', () => {
    const propuesta = proponerCanalizacion({ requestType: 'PSYCHOSOCIAL_RISK' });
    expect(propuesta.requiereProtocoloDeRiesgo).toBe(true);
    // Declararlo urgente por sistema convertiría la urgencia en ruido: lo que
    // hace falta es que la persona vea las rutas humanas, no una etiqueta.
    expect(propuesta.urgencia).toBe('PRIORITY');
  });

  it('una consulta de capacitación no levanta ningún protocolo', () => {
    expect(
      proponerCanalizacion({ requestType: 'TRAINING_OR_INSTITUTIONAL_SUPPORT' }).requiereProtocoloDeRiesgo,
    ).toBe(false);
  });
});

describe('lo que la persona eligió manda sobre la tabla', () => {
  it('si escribió a una entidad, ahí queda, y el motivo lo dice', () => {
    // Quien escribe a una entidad concreta ya tomó una decisión. El sistema no
    // está para corregírsela por la espalda.
    const propuesta = proponerCanalizacion({
      requestType: 'EDUCATION_ACCESS',
      entidadElegida: 'FUERZA_INDIGO',
    });
    expect(propuesta.entidad).toBe('FUERZA_INDIGO');
    expect(propuesta.dominio).toBe('UNION_DEFENSE');
    expect(propuesta.alternativa).toBe('ALIANZA_INDIGO');
    expect(propuesta.motivo).toContain('Alianza Índigo');
  });

  it('si eligió la misma que propondría la tabla, el motivo es el de la materia', () => {
    const conEleccion = proponerCanalizacion({
      requestType: 'EDUCATION_ACCESS',
      entidadElegida: 'ALIANZA_INDIGO',
    });
    const sinEleccion = proponerCanalizacion({ requestType: 'EDUCATION_ACCESS' });
    expect(conEleccion).toEqual(sinEleccion);
  });

  it('la urgencia no cambia porque la persona elija otra entidad', () => {
    // La urgencia sale de lo que está pasando, no de a quién se le cuenta.
    const propuesta = proponerCanalizacion({
      requestType: 'VIOLENCE_OR_URGENCY',
      entidadElegida: 'FUERZA_INDIGO',
    });
    expect(propuesta.urgencia).toBe('URGENT');
    expect(propuesta.requiereProtocoloDeRiesgo).toBe(true);
  });
});

describe('la propuesta es reproducible', () => {
  it('la misma entrada da exactamente la misma propuesta', () => {
    // Es lo que separa una tabla de un modelo estadístico: se puede volver a
    // ella dentro de un año y explicar por qué aquel asunto fue donde fue.
    for (const materia of TODAS) {
      expect(proponerCanalizacion({ requestType: materia })).toEqual(
        proponerCanalizacion({ requestType: materia }),
      );
    }
  });
});
