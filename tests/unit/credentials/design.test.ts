import { describe, expect, it } from 'vitest';
import { CONTRAST_THRESHOLDS, contrastRatio, parseOklch, type Oklch } from '@/design-system/color';
import { colorToken } from '@/design-system/tokens';
import { readFileSync } from 'node:fs';
import { codigoLegible, DISENOS, svgCredencial } from '@/platform/credentials/design';
import type { CredentialKind } from '@prisma-client/enums';

/**
 * Los cuatro diseños de credencial (PRD §7.4).
 *
 * El PRD pide diseños «claramente diferenciados». Aquí se comprueba que la
 * diferencia **no depende del color**: cada tipo lleva su nombre escrito, una
 * franja de anchura propia y un símbolo distinto. Un diseño que solo cambiara
 * de matiz sería indistinguible para quien no percibe ese matiz, y también en
 * la fotocopia en blanco y negro que acaba pegada en la puerta de una oficina.
 */

const CSS = readFileSync('app/globals.css', 'utf8');
const BLANCO: Oklch = { l: 1, c: 0, h: 0 };

function token(nombre: string): Oklch {
  const crudo = new RegExp(`${nombre}:\\s*(oklch\\([^)]*\\))`).exec(CSS)?.[1];
  if (crudo === undefined) throw new Error(`No existe el token ${nombre}.`);
  const color = parseOklch(crudo);
  if (color === null) throw new Error(`El token ${nombre} no es OKLCH.`);
  return color;
}

const TIPOS = Object.keys(DISENOS) as CredentialKind[];

describe('los cuatro diseños se distinguen sin usar el color', () => {
  it('cada uno lleva una etiqueta escrita distinta', () => {
    const etiquetas = TIPOS.map((tipo) => DISENOS[tipo].etiqueta);
    expect(new Set(etiquetas).size).toBe(TIPOS.length);
  });

  it('cada uno lleva una franja de anchura distinta', () => {
    const franjas = TIPOS.map((tipo) => DISENOS[tipo].franja);
    expect(new Set(franjas).size).toBe(TIPOS.length);
  });

  it('cada uno lleva un símbolo distinto', () => {
    const simbolos = TIPOS.map((tipo) => DISENOS[tipo].simbolo);
    expect(new Set(simbolos).size).toBe(TIPOS.length);
  });

  it('cada uno dice en una frase qué acredita', () => {
    for (const tipo of TIPOS) {
      expect(DISENOS[tipo].acredita.length).toBeGreaterThan(20);
    }
  });
});

describe('el contraste de la credencial se mide, no se afirma', () => {
  it('el texto blanco sobre la franja alcanza AA en los cuatro diseños', () => {
    // Es el nombre del tipo, que es la información principal de la tarjeta.
    for (const tipo of TIPOS) {
      const razon = contrastRatio(BLANCO, token(DISENOS[tipo].acento));
      expect(razon, `${tipo}: blanco sobre ${DISENOS[tipo].acento}`).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.bodyAA,
      );
    }
  });

  it('el QR contrasta con el recuadro sobre el que se apoya', () => {
    // Un lector de códigos necesita separar módulo oscuro de fondo claro. El
    // umbral de texto es más exigente que el suyo, y por eso vale de garantía.
    const tinta = token('--color-slate-900');
    for (const tipo of TIPOS) {
      const razon = contrastRatio(tinta, token(DISENOS[tipo].acentoSuave));
      expect(razon, `${tipo}: código sobre ${DISENOS[tipo].acentoSuave}`).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.bodyAA,
      );
    }
  });
});

describe('la tarjeta que se imprime', () => {
  const datos = {
    displayName: 'Persona De Prueba Apellido',
    publicCode: 'A1B2C3D4E5F6G7H8J9K0',
    token: 'A1B2C3D4E5F6G7H8J9K0.k1.firmadeprueba0000',
    verificationUrl: 'https://ejemplo.invalid/verificar',
    issuedAt: new Date('2026-09-05T12:00:00.000Z'),
    expiresAt: new Date('2027-09-05T12:00:00.000Z'),
    territoryLabel: 'Delegación de prueba',
    issuer: 'Fuerza Índigo',
  };

  it('mide lo que mide una tarjeta bancaria', () => {
    const svg = svgCredencial({ ...datos, kind: 'UNION_MEMBER' });
    expect(svg).toContain('width="85.6mm"');
    expect(svg).toContain('height="54mm"');
    expect(svg).toContain('viewBox="0 0 856 540"');
  });

  it('no usa variables CSS: fuera del navegador no existen', () => {
    // La credencial se abre en un visor de imágenes, se manda por correo y se
    // imprime. Una `var(--color-...)` ahí no es un color, es nada.
    for (const tipo of TIPOS) {
      const svg = svgCredencial({ ...datos, kind: tipo });
      expect(svg, tipo).not.toContain('var(--');
      expect(svg, tipo).toContain(colorToken(DISENOS[tipo].acento));
    }
  });

  it('lleva el código en bloques de cinco, para poder dictarlo', () => {
    const svg = svgCredencial({ ...datos, kind: 'HONORARY_AFFILIATE' });
    expect(codigoLegible(datos.publicCode)).toBe('A1B2C 3D4E5 F6G7H 8J9K0');
    expect(svg).toContain('A1B2C 3D4E5 F6G7H 8J9K0');
  });

  it('se anuncia con un texto que describe qué es y de quién', () => {
    const svg = svgCredencial({ ...datos, kind: 'OFFICE_OR_REPRESENTATION' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<desc>');
    expect(svg).toContain('Persona De Prueba Apellido');
  });

  it('escapa el nombre, que viene del registro y no de aquí', () => {
    const svg = svgCredencial({
      ...datos,
      kind: 'UNION_MEMBER',
      displayName: 'Ana <script>alert(1)</script> Pérez & Cía',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp; Cía');
  });

  it('un nombre largo se comprime en vez de salirse de la tarjeta', () => {
    // Defecto `D-F4-018`: un SVG no ajusta ni recorta. Lo que no cabe se sale
    // por el borde y desaparece al imprimir, y lo que se sale es siempre lo
    // mismo: un nombre largo o la dirección de verificación.
    const linea = (svg: string, texto: string): string =>
      new RegExp(`<text[^>]*>${texto.slice(0, 12)}`).exec(svg)?.[0] ?? '';

    const corto = svgCredencial({ ...datos, kind: 'UNION_MEMBER', displayName: 'Ana Ruiz' });
    expect(linea(corto, 'Ana Ruiz')).not.toContain('lengthAdjust');

    const nombreLargo = 'María de los Ángeles Concepción Hernández Villaseñor';
    const largo = svgCredencial({ ...datos, kind: 'UNION_MEMBER', displayName: nombreLargo });
    expect(linea(largo, nombreLargo)).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it('todo el texto cae dentro de la tarjeta, y nada pisa el QR', () => {
    const svg = svgCredencial({
      ...datos,
      kind: 'UNION_MEMBER',
      displayName: 'María de los Ángeles Concepción Hernández Villaseñor',
      territoryLabel: 'Delegación Metropolitana del Valle de México · Sección 14 · Zona Norte',
    });

    // El recuadro del QR ocupa los últimos 232 puntos por la derecha, **de la
    // mitad inferior para abajo** (y ≥ 308). Ningún texto de esa zona puede
    // empezar dentro de él.
    const RECUADRO_X = 856 - 232;
    const RECUADRO_Y = 540 - 232;
    for (const match of svg.matchAll(/<text ([^>]*)>/g)) {
      const atributos = match[1] ?? '';
      if (/text-anchor="end"/.test(atributos)) {
        // Anclado al borde derecho: lo que no puede es salirse de la tarjeta.
        expect(Number(/x="(\d+)"/.exec(atributos)?.[1] ?? 0)).toBeLessThanOrEqual(856);
        continue;
      }
      const x = Number(/x="(\d+)"/.exec(atributos)?.[1] ?? 0);
      const y = Number(/y="(\d+)"/.exec(atributos)?.[1] ?? 0);
      if (y >= RECUADRO_Y) expect(x, `un texto bajo el QR empieza en x=${x}`).toBeLessThan(RECUADRO_X);
      else expect(x, `un texto empieza en x=${x}`).toBeLessThan(856);
    }
  });

  it('la dirección de verificación cabe en la columna de texto', () => {
    const svg = svgCredencial({ ...datos, kind: 'UNION_MEMBER' });
    // Centrada bajo el QR se salía por el borde: ahora va a la izquierda.
    expect(svg).toContain('Verifica en https://ejemplo.invalid/verificar');
    const linea = /<text x="(\d+)"[^>]*>Verifica en/.exec(svg);
    expect(linea).not.toBeNull();
    expect(Number(linea![1])).toBeLessThan(856 - 232);
  });

  it('una credencial sin fecha de término lo dice, en vez de callarlo', () => {
    const svg = svgCredencial({ ...datos, kind: 'AUTHORIZED_PROFESSIONAL', expiresAt: null });
    expect(svg).toContain('Sin fecha de término');
  });
});
