import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseOklch, toHex } from './color';

/**
 * Lectura de tokens de color fuera de la hoja de estilos.
 *
 * Hay tres sitios donde una variable CSS no llega: el manifiesto de la
 * aplicación instalable, el color de la barra del sistema y los archivos que se
 * rasterizan fuera del navegador. En los tres hace falta un hexadecimal.
 *
 * Escribirlo a mano lo separa de la paleta en cuanto alguien la ajusta, y son
 * justo los sitios donde nadie lo nota: la barra del sistema se queda con el
 * índigo de hace tres meses y no hay pantalla donde se vea al lado del nuevo.
 * Aquí se lee del mismo archivo que usa la interfaz.
 *
 * La lectura es síncrona y del disco a propósito. Ocurre al construir el
 * manifiesto y al renderizar el marco del documento, no por petición de datos,
 * y el archivo lo cachea el sistema operativo.
 */

const CACHE = new Map<string, string>();

export function colorToken(nombre: string): string {
  const guardado = CACHE.get(nombre);
  if (guardado !== undefined) return guardado;

  const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
  const encontrado = new RegExp(`${nombre}:\\s*(oklch\\([^)]*\\))`).exec(css);
  if (encontrado?.[1] === undefined) {
    throw new Error(`No existe el token de color ${nombre} en app/globals.css.`);
  }

  const color = parseOklch(encontrado[1]);
  if (color === null) throw new Error(`El token ${nombre} no tiene forma oklch(): ${encontrado[1]}`);

  const hex = toHex(color);
  CACHE.set(nombre, hex);
  return hex;
}
