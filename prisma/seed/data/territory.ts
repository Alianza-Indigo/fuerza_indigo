/**
 * Árbol territorial inicial: nacional y las 32 entidades federativas de México
 * (PRD §9.1). Los municipios, secciones y delegaciones se dan de alta desde la
 * aplicación conforme se constituyen.
 */
export interface TerritorySeed {
  readonly code: string;
  readonly name: string;
  readonly type: 'NATIONAL' | 'STATE';
  readonly stateCode: string | null;
  readonly parentCode: string | null;
}

const STATES: readonly (readonly [string, string])[] = [
  ['AGU', 'Aguascalientes'],
  ['BCN', 'Baja California'],
  ['BCS', 'Baja California Sur'],
  ['CAM', 'Campeche'],
  ['CHP', 'Chiapas'],
  ['CHH', 'Chihuahua'],
  ['CMX', 'Ciudad de México'],
  ['COA', 'Coahuila de Zaragoza'],
  ['COL', 'Colima'],
  ['DUR', 'Durango'],
  ['GUA', 'Guanajuato'],
  ['GRO', 'Guerrero'],
  ['HID', 'Hidalgo'],
  ['JAL', 'Jalisco'],
  ['MEX', 'Estado de México'],
  ['MIC', 'Michoacán de Ocampo'],
  ['MOR', 'Morelos'],
  ['NAY', 'Nayarit'],
  ['NLE', 'Nuevo León'],
  ['OAX', 'Oaxaca'],
  ['PUE', 'Puebla'],
  ['QUE', 'Querétaro'],
  ['ROO', 'Quintana Roo'],
  ['SLP', 'San Luis Potosí'],
  ['SIN', 'Sinaloa'],
  ['SON', 'Sonora'],
  ['TAB', 'Tabasco'],
  ['TAM', 'Tamaulipas'],
  ['TLA', 'Tlaxcala'],
  ['VER', 'Veracruz de Ignacio de la Llave'],
  ['YUC', 'Yucatán'],
  ['ZAC', 'Zacatecas'],
];

export const NATIONAL_CODE = 'MX-NACIONAL';

export const TERRITORY_SEEDS: readonly TerritorySeed[] = [
  { code: NATIONAL_CODE, name: 'Nacional', type: 'NATIONAL', stateCode: null, parentCode: null },
  ...STATES.map(([stateCode, name]) => ({
    code: `MX-${stateCode}`,
    name,
    type: 'STATE' as const,
    stateCode,
    parentCode: NATIONAL_CODE,
  })),
];

/** Ruta materializada a partir del código (ADR-0027). */
export function pathFor(seed: TerritorySeed): string {
  return seed.parentCode === null ? '/mx' : `/mx/${seed.stateCode!.toLowerCase()}`;
}
