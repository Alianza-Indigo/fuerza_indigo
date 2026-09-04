/**
 * Conversión de color y razón de contraste (WCAG 2.2).
 *
 * Existe para que «contraste verificado» del PRD §24 Fase 2 sea una medición y
 * no una afirmación. Los tokens se declaran en OKLCH, que es perceptualmente
 * uniforme y por eso permite que los acentos de cada módulo compartan
 * luminosidad; pero la razón de contraste se define sobre sRGB, de modo que hay
 * que convertir antes de medir.
 *
 * No se usa ninguna biblioteca: son cuarenta líneas de aritmética con fórmulas
 * publicadas, y una dependencia más en la superficie de un proyecto que maneja
 * datos sindicales tiene un costo que esto no justifica.
 */

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** `oklch(0.585 0.183 286)` → `{ l, c, h }`. Acepta el `/ alfa`, que ignora. */
export function parseOklch(value: string): Oklch | null {
  const match = /oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/.exec(value);
  if (match === null) return null;
  const [, l, c, h] = match;
  if (l === undefined || c === undefined || h === undefined) return null;
  return { l: Number(l), c: Number(c), h: Number(h) };
}

/** OKLCH → sRGB lineal, por OKLab. Fórmulas de Björn Ottosson. */
function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const radianes = (h * Math.PI) / 180;
  const a = c * Math.cos(radianes);
  const b = c * Math.sin(radianes);

  const lPrima = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrima = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrima = l - 0.0894841775 * a - 1.291485548 * b;

  const lLineal = lPrima ** 3;
  const mLineal = mPrima ** 3;
  const sLineal = sPrima ** 3;

  return [
    4.0767416621 * lLineal - 3.3077115913 * mLineal + 0.2309699292 * sLineal,
    -1.2684380046 * lLineal + 2.6097574011 * mLineal - 0.3413193965 * sLineal,
    -0.0041960863 * lLineal - 0.7034186147 * mLineal + 1.707614701 * sLineal,
  ];
}

/**
 * Luminancia relativa (WCAG 2.2, definición 1.4.3).
 *
 * Los canales se recortan a [0, 1]: un OKLCH fuera del gamut de sRGB produce
 * componentes negativas o mayores que uno, y el navegador también las recorta
 * al pintar. Medir sobre el valor sin recortar daría una razón que nadie ve.
 */
export function relativeLuminance(color: Oklch): number {
  const canales = toLinearSrgb(color).map((canal) => Math.min(1, Math.max(0, canal)));
  const [r = 0, g = 0, b = 0] = canales;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste entre dos colores. Va de 1 (idénticos) a 21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const luminanciaA = relativeLuminance(a);
  const luminanciaB = relativeLuminance(b);
  const clara = Math.max(luminanciaA, luminanciaB);
  const oscura = Math.min(luminanciaA, luminanciaB);
  return (clara + 0.05) / (oscura + 0.05);
}

/** Umbrales de la puerta de salida (docs/TEST_PLAN.md §7). */
export const CONTRAST_THRESHOLDS = {
  /** Texto normal, nivel AA. */
  bodyAA: 4.5,
  /** Texto normal, nivel AAA: exigido en el cuerpo de las rutas de trámite. */
  bodyAAA: 7,
  /** Texto grande —24 px, o 19 px en negrita— y componentes de interfaz. */
  largeAA: 3,
} as const;
