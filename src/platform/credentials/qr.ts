import qrcode from 'qrcode-generator';

/**
 * Dibujo del código QR (PRD §7.4).
 *
 * **La codificación no se escribe a mano.** Un QR es un estándar con corrección
 * de errores Reed-Solomon, enmascarado y patrones de alineación; una
 * implementación propia que se equivoque produce códigos que ningún lector
 * acepta, y eso no lo descubre una prueba unitaria sino una persona plantada en
 * una oficina con el teléfono en la mano. Se usa `qrcode-generator`: sin
 * dependencias, MIT, con tipos propios (ADR-0090).
 *
 * **El dibujo sí es nuestro.** La biblioteca calcula qué módulos son oscuros;
 * el SVG lo componemos aquí para que tenga `title`, `desc`, zona tranquila
 * correcta y colores del sistema de diseño. Así el QR es accesible y encaja con
 * el resto de la interfaz en vez de ser una imagen ajena pegada encima.
 */

/**
 * Corrección de errores media: recupera hasta un 15% del código dañado. Es lo
 * adecuado para algo que va a vivir dentro de una cartera y a fotocopiarse.
 */
const CORRECCION = 'M' as const;

/** Zona tranquila obligatoria del estándar: cuatro módulos por lado. */
const ZONA_TRANQUILA = 4;

export interface MatrizQr {
  /** Módulos por lado, sin contar la zona tranquila. */
  readonly modulos: number;
  /** `true` donde el módulo es oscuro. Fila mayor. */
  readonly oscuro: readonly (readonly boolean[])[];
}

/** Calcula la matriz de módulos del código. */
export function matrizQr(contenido: string): MatrizQr {
  // Versión 0 = «la más pequeña que quepa». Un código de credencial ocupa muy
  // poco, y fijar una versión mayor solo haría los módulos más finos.
  const codigo = qrcode(0, CORRECCION);
  codigo.addData(contenido);
  codigo.make();

  const modulos = codigo.getModuleCount();
  const oscuro: boolean[][] = [];
  for (let fila = 0; fila < modulos; fila += 1) {
    const linea: boolean[] = [];
    for (let columna = 0; columna < modulos; columna += 1) linea.push(codigo.isDark(fila, columna));
    oscuro.push(linea);
  }
  return { modulos, oscuro };
}

/**
 * Trazado SVG de la matriz, en un solo `path`.
 *
 * Un rectángulo por módulo produciría cientos de nodos y un archivo que pesa
 * más que la página que lo lleva. Un `path` con un subtrazo por módulo dibuja lo
 * mismo con un elemento.
 */
export function trazoQr(matriz: MatrizQr): string {
  const partes: string[] = [];
  for (let fila = 0; fila < matriz.modulos; fila += 1) {
    for (let columna = 0; columna < matriz.modulos; columna += 1) {
      if (matriz.oscuro[fila]?.[columna] === true) {
        partes.push(`M${columna + ZONA_TRANQUILA} ${fila + ZONA_TRANQUILA}h1v1h-1z`);
      }
    }
  }
  return partes.join('');
}

export interface OpcionesDeQr {
  /** Qué es este código, para quien lo lee con un lector de pantalla. */
  readonly titulo: string;
  /** Color de los módulos. Por omisión, tinta del sistema de diseño. */
  readonly tinta?: string;
  /** Color del fondo. La zona tranquila **tiene** que ser clara y opaca. */
  readonly fondo?: string;
}

/**
 * SVG completo y autónomo del código.
 *
 * Sin ancho ni alto fijos: lo dimensiona quien lo coloca. `shape-rendering` en
 * `crispEdges` evita que el suavizado emborrone los módulos al imprimir, que es
 * la causa más común de un QR impreso que no se deja leer.
 */
export function svgQr(contenido: string, opciones: OpcionesDeQr): string {
  const matriz = matrizQr(contenido);
  const lado = matriz.modulos + ZONA_TRANQUILA * 2;
  const tinta = opciones.tinta ?? '#111111';
  const fondo = opciones.fondo ?? '#ffffff';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" role="img" aria-label="${escaparXml(opciones.titulo)}">`,
    `<title>${escaparXml(opciones.titulo)}</title>`,
    `<rect width="${lado}" height="${lado}" fill="${fondo}"/>`,
    `<path d="${trazoQr(matriz)}" fill="${tinta}" shape-rendering="crispEdges"/>`,
    '</svg>',
  ].join('');
}

/** Escapado mínimo para texto dentro de un atributo o un nodo XML. */
export function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
