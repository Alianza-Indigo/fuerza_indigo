/**
 * Proporcionalidad de género en una planilla (PRD §9.6).
 *
 * **El sistema alerta, no decide.** Es la regla del PRD §9.3 y aquí importa
 * especialmente: la determinación formal de que una planilla cumple corresponde
 * a la Comisión Electoral, que puede tener a la vista razones que la plataforma
 * no conoce. Lo que hace este cálculo es que nadie pueda decir que no lo sabía.
 *
 * **Quien no declara su identidad de género no se reparte.** Se cuenta aparte,
 * y el porcentaje se calcula sobre quienes sí la declararon. Repartir a quien
 * no contestó entre dos casillas para que la cuenta salga redonda es inventar
 * un dato sobre una persona, y además falsea la alerta.
 */

export type GeneroDeclarado = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER' | 'UNDISCLOSED';

export interface ComposicionDeGenero {
  readonly total: number;
  readonly mujeres: number;
  readonly hombres: number;
  readonly noBinarias: number;
  readonly otras: number;
  readonly sinDeclarar: number;
  /** Base del porcentaje: quienes declararon. */
  readonly declarantes: number;
  readonly porcentajeMujeres: number | null;
  readonly porcentajeHombres: number | null;
}

export function componerGenero(generos: readonly GeneroDeclarado[]): ComposicionDeGenero {
  const cuenta = (valor: GeneroDeclarado): number => generos.filter((genero) => genero === valor).length;

  const mujeres = cuenta('WOMAN');
  const hombres = cuenta('MAN');
  const noBinarias = cuenta('NON_BINARY');
  const otras = cuenta('OTHER');
  const sinDeclarar = cuenta('UNDISCLOSED');
  const declarantes = generos.length - sinDeclarar;

  return {
    total: generos.length,
    mujeres,
    hombres,
    noBinarias,
    otras,
    sinDeclarar,
    declarantes,
    porcentajeMujeres: declarantes === 0 ? null : (mujeres * 100) / declarantes,
    porcentajeHombres: declarantes === 0 ? null : (hombres * 100) / declarantes,
  };
}

export interface AlertaDePlanilla {
  readonly codigo: string;
  readonly mensaje: string;
}

/**
 * Alertas de una planilla, antes de registrarla.
 *
 * Se conservan aunque la planilla se registre igualmente: el registro con una
 * alerta encima es una decisión de quien registra, y tiene que constar que la
 * tomó sabiendo.
 */
export function alertasDePlanilla(input: {
  readonly composicion: ComposicionDeGenero;
  readonly porcentajeMinimo: number;
  readonly cargosDelOrgano: number;
  readonly cargosCubiertos: number;
  readonly duplicados: readonly string[];
  readonly sinDerechosPoliticos: readonly string[];
  readonly enComisionElectoral: readonly string[];
}): readonly AlertaDePlanilla[] {
  const alertas: AlertaDePlanilla[] = [];
  const { composicion, porcentajeMinimo } = input;

  if (composicion.sinDeclarar > 0) {
    alertas.push({
      codigo: 'GENERO_SIN_DECLARAR',
      mensaje: `${composicion.sinDeclarar} integrante(s) no declararon identidad de género. El porcentaje se calcula sobre quienes sí lo hicieron, y por eso puede no reflejar la composición real.`,
    });
  }

  if (composicion.declarantes > 0 && porcentajeMinimo > 0) {
    if ((composicion.porcentajeMujeres ?? 0) < porcentajeMinimo) {
      alertas.push({
        codigo: 'PROPORCIONALIDAD_MUJERES',
        mensaje: `Las mujeres son el ${(composicion.porcentajeMujeres ?? 0).toFixed(1)} % de quienes declararon género y el estatuto exige al menos ${porcentajeMinimo} %.`,
      });
    }
    if ((composicion.porcentajeHombres ?? 0) < porcentajeMinimo) {
      alertas.push({
        codigo: 'PROPORCIONALIDAD_HOMBRES',
        mensaje: `Los hombres son el ${(composicion.porcentajeHombres ?? 0).toFixed(1)} % de quienes declararon género y el estatuto exige al menos ${porcentajeMinimo} %.`,
      });
    }
  }

  if (input.cargosCubiertos < input.cargosDelOrgano) {
    alertas.push({
      codigo: 'CARGOS_SIN_CUBRIR',
      mensaje: `La planilla cubre ${input.cargosCubiertos} de ${input.cargosDelOrgano} cargos del órgano. Los que faltan quedarían vacantes.`,
    });
  }

  if (input.duplicados.length > 0) {
    alertas.push({
      codigo: 'PERSONA_REPETIDA',
      mensaje: `Hay personas propuestas para más de un cargo: ${input.duplicados.join(', ')}.`,
    });
  }

  if (input.sinDerechosPoliticos.length > 0) {
    alertas.push({
      codigo: 'SIN_DERECHOS_POLITICOS',
      mensaje: `Estas personas no están en pleno goce de derechos políticos: ${input.sinDerechosPoliticos.join(', ')}.`,
    });
  }

  if (input.enComisionElectoral.length > 0) {
    alertas.push({
      codigo: 'INTEGRANTE_DE_LA_COMISION',
      mensaje: `Estas personas integran la Comisión Electoral de este proceso: ${input.enComisionElectoral.join(', ')}. Ser juez y parte es exactamente lo que la comisión existe para evitar.`,
    });
  }

  return alertas;
}
