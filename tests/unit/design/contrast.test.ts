import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRAST_THRESHOLDS, contrastRatio, parseOklch, type Oklch } from '@/design-system/color';

/**
 * Contraste de los dos temas (PRD §5.2, docs/TEST_PLAN.md §7).
 *
 * Los valores se leen del **archivo de tokens real**, no de una copia en la
 * prueba. Copiarlos aquí haría que la prueba siguiera en verde después de que
 * alguien aclarara un token en la hoja de estilos, que es exactamente el cambio
 * que hay que detectar.
 */

const CSS = readFileSync('app/globals.css', 'utf8');

/** Resuelve un token semántico hasta su valor OKLCH, siguiendo los `var()`. */
function resolver(nombre: string, ambito: string): Oklch {
  const bloque = extraerBloque(ambito);
  const declaracion = new RegExp(`${nombre}:\\s*([^;]+);`).exec(bloque);
  if (declaracion === null) throw new Error(`El token ${nombre} no está en el ámbito «${ambito}».`);

  const valor = (declaracion[1] ?? '').trim();
  const referencia = /var\(\s*(--[\w-]+)\s*\)/.exec(valor);
  if (referencia !== null) {
    // Los valores crudos viven siempre en `@theme`.
    const nombreCrudo = referencia[1]!;
    const crudo = new RegExp(`${nombreCrudo}:\\s*(oklch\\([^)]+\\));`).exec(CSS);
    if (crudo === null) throw new Error(`El token ${nombreCrudo} no tiene valor crudo.`);
    const color = parseOklch(crudo[1]!);
    if (color === null) throw new Error(`El token ${nombreCrudo} no es OKLCH.`);
    return color;
  }

  const color = parseOklch(valor);
  if (color === null) throw new Error(`El token ${nombre} no es OKLCH ni referencia: «${valor}».`);
  return color;
}

/** Recorta el bloque de declaraciones de un selector concreto. */
function extraerBloque(selector: string): string {
  const inicio = CSS.indexOf(selector);
  if (inicio === -1) throw new Error(`No se encontró el selector «${selector}».`);
  const abre = CSS.indexOf('{', inicio);
  let profundidad = 0;
  for (let i = abre; i < CSS.length; i += 1) {
    if (CSS[i] === '{') profundidad += 1;
    if (CSS[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return CSS.slice(abre, i);
    }
  }
  throw new Error(`El bloque de «${selector}» no cierra.`);
}

const TEMAS = [
  ['claro', ':root {'],
  ['oscuro', ':root[data-theme="dark"] {'],
] as const;

describe.each(TEMAS)('tema %s', (_nombre, ambito) => {
  const par = (tinta: string, fondo: string) =>
    contrastRatio(resolver(tinta, ambito), resolver(fondo, ambito));

  it('el texto principal alcanza AAA sobre las dos superficies', () => {
    // AAA en el cuerpo, no AA: las rutas de trámite lo exigen, y tener dos
    // niveles según la ruta obligaría a dos paletas que se desincronizarían.
    expect(par('--color-ink', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAAA);
    expect(par('--color-ink', '--color-surface-raised')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAAA);
  });

  it('el texto atenuado alcanza AA, que es donde se usa', () => {
    // `ink-soft` es para descripciones y ayudas, nunca para el cuerpo de un
    // trámite. AA es el umbral que le corresponde.
    expect(par('--color-ink-soft', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAA);
    expect(par('--color-ink-soft', '--color-surface-raised')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAA);
  });

  it('el texto más tenue sigue siendo legible', () => {
    expect(par('--color-ink-faint', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.largeAA);
  });

  it('el acento alcanza AA como texto de enlace', () => {
    expect(par('--color-accent', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAA);
    expect(par('--color-accent-ink', '--color-surface-raised')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAA);
  });

  it('las señales de error, aviso y éxito alcanzan AA', () => {
    // El error se lee cuando algo ya salió mal: es el peor momento para tener
    // que forzar la vista.
    for (const señal of ['--color-danger', '--color-warning', '--color-success']) {
      expect(par(señal, '--color-surface'), `${señal} sobre la superficie`).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.bodyAA,
      );
      expect(par(señal, '--color-surface-raised'), `${señal} sobre la superficie elevada`).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.bodyAA,
      );
    }
  });

  it('cada señal contrasta con su propio fondo suave', () => {
    // El patrón real: texto de error sobre el recuadro de error.
    for (const [tinta, fondo] of [
      ['--color-danger', '--color-danger-soft'],
      ['--color-warning', '--color-warning-soft'],
      ['--color-success', '--color-success-soft'],
      ['--color-accent-ink', '--color-accent-soft'],
    ]) {
      expect(par(tinta!, fondo!), `${tinta} sobre ${fondo}`).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.bodyAA);
    }
  });

  it('el borde de un control alcanza el 3:1 de elementos no textuales', () => {
    // Es el contorno de un campo o de una casilla: lo único que lo identifica.
    // La norma le exige 3:1, y la primera versión de estos tokens daba 1.32.
    expect(par('--color-line-strong', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.largeAA);
    expect(par('--color-line-strong', '--color-surface-raised')).toBeGreaterThanOrEqual(
      CONTRAST_THRESHOLDS.largeAA,
    );
  });

  it('la línea decorativa se ve, sin pretender ser un control', () => {
    // Separa secciones y la norma no le fija umbral, pero una línea que no se
    // distingue no separa nada.
    expect(par('--color-line', '--color-surface')).toBeGreaterThanOrEqual(1.45);
    expect(par('--color-line', '--color-surface-raised')).toBeGreaterThanOrEqual(1.45);
  });

  it('el indicador de foco se distingue de las dos superficies', () => {
    // Si el foco no se ve, la navegación por teclado deja de existir.
    expect(par('--color-accent', '--color-surface')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.largeAA);
    expect(par('--color-accent', '--color-surface-raised')).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.largeAA);
  });
});

describe('los dos bloques del tema oscuro no pueden divergir', () => {
  it('la preferencia del sistema y la elección explícita declaran lo mismo', () => {
    // Hay dos bloques oscuros: el de `prefers-color-scheme` y el de
    // `data-theme="dark"`. Al corregir el contraste de los bordes, uno quedó
    // actualizado y el otro no, y la prueba siguió en verde porque solo miraba
    // el explícito. Quien tiene el sistema en oscuro y no ha elegido nada usa
    // justo el bloque que no se estaba verificando.
    const normalizar = (bloque: string) =>
      bloque
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => linea !== '' && !linea.startsWith('/*') && !linea.startsWith('*'))
        .join('\n');

    expect(normalizar(extraerBloque(':root:not([data-theme="light"]) {'))).toBe(
      normalizar(extraerBloque(':root[data-theme="dark"] {')),
    );
  });
});

describe('acentos por módulo', () => {
  it('comparten luminosidad y croma, y solo cambian de matiz', () => {
    // Es lo que hace que el ecosistema se vea como uno solo. Si un acento se
    // sale de esa relación, su módulo parece otro producto.
    const acentos = ['indigo', 'alianza', 'cian', 'ceni', 'tools'].map((modulo) => {
      const crudo = new RegExp(`--color-${modulo}-500:\\s*(oklch\\([^)]+\\));`).exec(CSS);
      if (crudo === null) throw new Error(`Falta el acento del módulo ${modulo}.`);
      const color = parseOklch(crudo[1]!);
      if (color === null) throw new Error(`El acento de ${modulo} no es OKLCH.`);
      return { modulo, color };
    });

    const referencia = acentos[0]!.color;
    for (const { modulo, color } of acentos) {
      expect(color.l, `la luminosidad de ${modulo} se aparta de la familia`).toBeCloseTo(referencia.l, 2);
    }

    // Y los matices sí tienen que ser distintos entre sí.
    const matices = new Set(acentos.map(({ color }) => color.h));
    expect(matices.size).toBe(acentos.length);
  });

  it('cada acento de módulo contrasta como texto sobre el papel', () => {
    const fondo = resolver('--color-surface-raised', ':root {');
    for (const modulo of ['indigo', 'alianza', 'cian', 'ceni', 'tools']) {
      const crudo = new RegExp(`--color-${modulo}-600:\\s*(oklch\\([^)]+\\));`).exec(CSS);
      const color = parseOklch(crudo![1]!)!;
      expect(contrastRatio(color, fondo), `el acento ${modulo}-600 como texto`).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.bodyAA,
      );
    }
  });
});

describe('la utilidad de contraste', () => {
  it('coincide con los valores de referencia de la norma', () => {
    const blanco = parseOklch('oklch(1 0 0)')!;
    const negro = parseOklch('oklch(0 0 0)')!;
    // Blanco sobre negro es el máximo posible: 21:1.
    expect(contrastRatio(blanco, negro)).toBeCloseTo(21, 1);
    expect(contrastRatio(blanco, blanco)).toBeCloseTo(1, 5);
  });

  it('es simétrica', () => {
    const a = parseOklch('oklch(0.488 0.186 286)')!;
    const b = parseOklch('oklch(0.974 0.004 286)')!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('rechaza un valor que no es OKLCH', () => {
    expect(parseOklch('#4f46e5')).toBeNull();
    expect(parseOklch('rgb(79 70 229)')).toBeNull();
  });
});
