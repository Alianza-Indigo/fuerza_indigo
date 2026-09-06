import { describe, expect, it } from 'vitest';
import { alertasDePlanilla, componerGenero, type GeneroDeclarado } from '@/modules/election/domain';

/**
 * Proporcionalidad de género (PRD §9.6; F5-ELE-003).
 *
 * Dos cosas se comprueban aquí: que el porcentaje se calcule sobre quienes
 * declararon —y no repartiendo a quien no contestó— y que el sistema **alerte
 * sin decidir**.
 */

const BASE = {
  porcentajeMinimo: 40,
  cargosDelOrgano: 3,
  cargosCubiertos: 3,
  duplicados: [] as string[],
  sinDerechosPoliticos: [] as string[],
  enComisionElectoral: [] as string[],
};

describe('composición de género', () => {
  it('el porcentaje se calcula sobre quienes declararon', () => {
    const generos: GeneroDeclarado[] = ['WOMAN', 'MAN', 'UNDISCLOSED', 'UNDISCLOSED'];
    const composicion = componerGenero(generos);

    expect(composicion.total).toBe(4);
    expect(composicion.declarantes).toBe(2);
    // Y no el 25 %, que sería repartir a quien no contestó.
    expect(composicion.porcentajeMujeres).toBe(50);
  });

  it('sin nadie que declare, el porcentaje es nulo y no cero', () => {
    const composicion = componerGenero(['UNDISCLOSED', 'UNDISCLOSED']);

    expect(composicion.declarantes).toBe(0);
    expect(composicion.porcentajeMujeres).toBeNull();
    expect(composicion.porcentajeHombres).toBeNull();
  });

  it('cuenta las identidades no binarias y otras sin sumarlas a ninguna de las dos', () => {
    const composicion = componerGenero(['WOMAN', 'MAN', 'NON_BINARY', 'OTHER']);

    expect(composicion.noBinarias).toBe(1);
    expect(composicion.otras).toBe(1);
    expect(composicion.declarantes).toBe(4);
    expect(composicion.porcentajeMujeres).toBe(25);
  });
});

describe('alertas de una planilla', () => {
  it('una planilla equilibrada y completa no genera ninguna alerta', () => {
    const composicion = componerGenero(['WOMAN', 'MAN', 'WOMAN', 'MAN']);
    expect(alertasDePlanilla({ ...BASE, composicion, cargosDelOrgano: 4, cargosCubiertos: 4 })).toEqual([]);
  });

  it('con tres cargos y un mínimo del cuarenta por ciento, ninguna composición lo cumple', () => {
    // No es un fallo del cálculo: con tres plazas el reparto más equilibrado
    // deja a un género en 33,3 %. Es una tensión del propio estatuto, y el
    // sistema la enseña en vez de resolverla por su cuenta. Quien decide es la
    // Comisión Electoral, que puede tener a la vista razones que la plataforma
    // no conoce (PRD §9.3: el sistema alerta, no decide).
    for (const reparto of [
      ['WOMAN', 'WOMAN', 'MAN'],
      ['WOMAN', 'MAN', 'MAN'],
    ] as const) {
      const alertas = alertasDePlanilla({ ...BASE, composicion: componerGenero([...reparto]) });
      expect(alertas.some((alerta) => alerta.codigo.startsWith('PROPORCIONALIDAD_'))).toBe(true);
    }
  });

  it('avisa cuando un género queda por debajo del mínimo', () => {
    const composicion = componerGenero(['WOMAN', 'MAN', 'MAN', 'MAN']);
    const alertas = alertasDePlanilla({ ...BASE, composicion, cargosDelOrgano: 4, cargosCubiertos: 4 });

    expect(alertas.map((alerta) => alerta.codigo)).toContain('PROPORCIONALIDAD_MUJERES');
  });

  it('avisa de quien no declaró, porque el porcentaje puede no reflejar la realidad', () => {
    const composicion = componerGenero(['WOMAN', 'MAN', 'UNDISCLOSED']);
    const alertas = alertasDePlanilla({ ...BASE, composicion });

    expect(alertas.map((alerta) => alerta.codigo)).toContain('GENERO_SIN_DECLARAR');
  });

  it('avisa de cargos sin cubrir, de personas repetidas y de quien no tiene derechos', () => {
    const composicion = componerGenero(['WOMAN', 'MAN']);
    const alertas = alertasDePlanilla({
      ...BASE,
      composicion,
      cargosCubiertos: 2,
      duplicados: ['Alguien'],
      sinDerechosPoliticos: ['Otra persona'],
    });

    const codigos = alertas.map((alerta) => alerta.codigo);
    expect(codigos).toContain('CARGOS_SIN_CUBRIR');
    expect(codigos).toContain('PERSONA_REPETIDA');
    expect(codigos).toContain('SIN_DERECHOS_POLITICOS');
  });

  it('avisa de quien integra la comisión que revisará la planilla', () => {
    const composicion = componerGenero(['WOMAN', 'MAN', 'WOMAN']);
    const alertas = alertasDePlanilla({ ...BASE, composicion, enComisionElectoral: ['Quien revisa'] });

    expect(alertas.map((alerta) => alerta.codigo)).toContain('INTEGRANTE_DE_LA_COMISION');
  });

  it('con el mínimo en cero no se alerta de proporcionalidad', () => {
    // El estatuto puede no fijar cuota. Alertar igualmente sería inventarle una.
    const composicion = componerGenero(['MAN', 'MAN', 'MAN']);
    const alertas = alertasDePlanilla({ ...BASE, composicion, porcentajeMinimo: 0 });

    expect(alertas.map((alerta) => alerta.codigo)).not.toContain('PROPORCIONALIDAD_MUJERES');
  });
});
