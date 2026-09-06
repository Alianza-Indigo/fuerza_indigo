import type { EcosystemAccent } from '@prisma-client/enums';

/**
 * Una ficha del catálogo, **ya resuelta** para enseñarse (PRD §12.2).
 *
 * `modulo` y `accesoUrl` no son columnas: son la traducción de lo que hay en la
 * base a lo que la pantalla necesita, y se hace **una vez**, en la consulta. Hay
 * dos pantallas que enseñan estas fichas —el sitio público y el portal— y el PRD
 * §12.4 exige que sean las mismas. Si cada una tradujera por su cuenta, la misma
 * ficha acabaría de un color en un sitio y de otro en el otro, y peor: bastaría
 * que una tratara la cadena vacía como dirección válida para que apareciera el
 * botón que no lleva a ninguna parte.
 *
 * `accesoUrl` nula no es un estado degradado: es lo que hay mientras la
 * organización no configure el acceso. La ficha se ve igual y dice lo que es;
 * lo que no aparece es el botón.
 */
export interface FichaDelEcosistema {
  readonly code: string;
  readonly name: string;
  readonly summary: string;
  readonly audienceText: string;
  readonly modulo: ModuloDeFicha;
  readonly accesoUrl: string | null;
  readonly logotipoUrl: string | null;
  readonly responsable: string | null;
}

export type ModuloDeFicha = 'sindicato' | 'alianza' | 'cian' | 'ceni' | 'herramientas';

/** Acento del sistema de diseño que corresponde a una ficha. */
export function moduloDeLaFicha(accento: EcosystemAccent | null): ModuloDeFicha {
  switch (accento) {
    case 'SINDICATO':
      return 'sindicato';
    case 'ALIANZA':
      return 'alianza';
    case 'CIAN':
      return 'cian';
    case 'CENI':
      return 'ceni';
    case 'HERRAMIENTAS':
    case null:
      return 'herramientas';
  }
}

/**
 * La dirección a la que mandar a alguien, o nada.
 *
 * La comprobación es explícita —y no `url ? url : null`— porque la cadena vacía
 * es verdadera para una comprobación descuidada y falsa para lo que aquí
 * importa. La base ya lo impide, pero esta función es lo que decide si hay
 * botón, y no debe depender de que la base lo siga impidiendo mañana.
 */
export function logotipoDeLaFicha(code: string, logoFileId: string | null): string | null {
  // La dirección se compone del código y no del identificador del archivo: la
  // ruta que lo sirve no acepta identificadores, y así no hay dos maneras de
  // pedir la misma imagen.
  return logoFileId === null ? null : `/herramientas/logotipo/${encodeURIComponent(code)}`;
}

export function accesoDeLaFicha(externalUrl: string | null): string | null {
  if (externalUrl === null) return null;
  return externalUrl.startsWith('https://') ? externalUrl : null;
}
