import { describe, expect, it } from 'vitest';
import { matrizQr, svgQr, trazoQr } from '@/platform/credentials/qr';

/**
 * Codificación y dibujo del QR (PRD §7.4).
 *
 * Lo que se prueba aquí **no** es que la biblioteca implemente bien el estándar
 * —eso es su trabajo y lo hace desde hace quince años—, sino que nosotros la
 * usamos bien: que el contenido que se pide es el que se codifica, que la zona
 * tranquila existe, y que el SVG sale con lo que un lector de pantalla y una
 * impresora necesitan.
 *
 * Hay una prueba que sí mira el estándar de frente: la matriz de un código
 * conocido comparada contra los patrones de búsqueda, que están en posiciones
 * fijas y son la firma inconfundible de un QR bien formado.
 */

describe('la matriz del código', () => {
  it('tiene un tamaño de versión válido', () => {
    const matriz = matrizQr('FI-CREDENCIAL-DE-PRUEBA');
    // Las versiones van de 21×21 (v1) a 177×177 (v40), de cuatro en cuatro.
    expect(matriz.modulos).toBeGreaterThanOrEqual(21);
    expect((matriz.modulos - 21) % 4).toBe(0);
    expect(matriz.oscuro).toHaveLength(matriz.modulos);
    expect(matriz.oscuro[0]).toHaveLength(matriz.modulos);
  });

  it('lleva los tres patrones de búsqueda en sus esquinas', () => {
    // El patrón es un 7×7: borde oscuro, anillo claro, centro 3×3 oscuro. Está
    // en tres esquinas y es lo que permite a un lector encontrar y orientar el
    // código. Si esto no estuviera, no sería un QR.
    const matriz = matrizQr('A1B2C3D4E5F6G7H8J9K0');
    const n = matriz.modulos;
    const esOscuro = (f: number, c: number) => matriz.oscuro[f]?.[c] === true;

    const patron = (df: number, dc: number) => {
      // Esquina exterior oscura y anillo claro alrededor del centro.
      expect(esOscuro(df, dc)).toBe(true);
      expect(esOscuro(df + 1, dc + 1)).toBe(false);
      expect(esOscuro(df + 3, dc + 3)).toBe(true);
      expect(esOscuro(df + 6, dc + 6)).toBe(true);
    };

    patron(0, 0);
    patron(0, n - 7);
    patron(n - 7, 0);
  });

  it('un contenido distinto produce una matriz distinta', () => {
    const uno = trazoQr(matrizQr('CODIGO-UNO'));
    const otro = trazoQr(matrizQr('CODIGO-DOS'));
    expect(uno).not.toBe(otro);
  });

  it('el mismo contenido produce siempre el mismo dibujo', () => {
    // Importa: la credencial se vuelve a dibujar cada vez que se descarga, y
    // dos descargas de la misma credencial tienen que dar el mismo documento.
    expect(trazoQr(matrizQr('ESTABLE'))).toBe(trazoQr(matrizQr('ESTABLE')));
  });
});

describe('el SVG del código', () => {
  const svg = svgQr('FI-PRUEBA', { titulo: 'Código de verificación de prueba' });

  it('deja la zona tranquila de cuatro módulos que exige el estándar', () => {
    const matriz = matrizQr('FI-PRUEBA');
    const lado = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
    expect(lado).toBe(matriz.modulos + 8);
  });

  it('se anuncia como imagen con un texto que dice qué es', () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>Código de verificación de prueba</title>');
    expect(svg).toContain('aria-label="Código de verificación de prueba"');
  });

  it('pinta un fondo opaco y evita el suavizado', () => {
    // Sin fondo opaco, la zona tranquila desaparece sobre papel de color y el
    // lector deja de encontrar el código. El suavizado emborrona los módulos
    // al imprimir, que es la causa más común de un QR impreso ilegible.
    expect(svg).toContain('<rect width=');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('escapa lo que va en el título', () => {
    const conComillas = svgQr('X', { titulo: 'Credencial "de prueba" & otra' });
    expect(conComillas).toContain('&quot;de prueba&quot; &amp; otra');
    expect(conComillas).not.toContain('"de prueba"');
  });
});
