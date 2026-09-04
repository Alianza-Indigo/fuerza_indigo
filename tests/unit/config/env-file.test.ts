import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { envFileLine } from '@/platform/config/env-file';

/**
 * Ida y vuelta de un valor por un archivo de entorno.
 *
 * No basta con comprobar que la función pone contrabarras: lo que importa es
 * que el valor que sale del cargador **real** sea idéntico al que entró. Un
 * hash Argon2id lleva cuatro `$` y el cargador de Next los expande como nombres
 * de variable, dejando un hash mutilado sin ningún error a la vista.
 *
 * La carga ocurre en un proceso aparte por dos razones: el cargador memoriza el
 * resultado de la primera llamada, de modo que dentro de un mismo proceso solo
 * se podría probar un archivo; y escribe en `process.env`, así que probar aquí
 * pisaría la configuración de las demás pruebas del mismo trabajador. Un
 * proceso nuevo es además lo que hace un servidor al arrancar.
 */

const CARGADOR = `
const { loadEnvConfig } = require('@next/env');
const { combinedEnv } = loadEnvConfig(process.argv[1], false, { info() {}, error() {} });
const nombres = JSON.parse(process.argv[2]);
const salida = {};
for (const nombre of nombres) salida[nombre] = combinedEnv[nombre] ?? null;
process.stdout.write(JSON.stringify(salida));
`;

function cargarEnProcesoNuevo(directorio: string, nombres: readonly string[]): Record<string, string | null> {
  const salida = execFileSync(
    process.execPath,
    ['-e', CARGADOR, directorio, JSON.stringify(nombres)],
    // `NODE_ENV` se fija en «production» a propósito: es el modo en el que
    // corre el servidor desplegado, y es su lectura la que hay que reproducir.
    { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } },
  );
  return JSON.parse(salida) as Record<string, string | null>;
}

function idaYVuelta(valores: Readonly<Record<string, string>>): Record<string, string | null> {
  const directorio = mkdtempSync(path.join(tmpdir(), 'fi-env-'));
  try {
    const lineas = Object.entries(valores).map(([nombre, valor]) => envFileLine(nombre, valor));
    writeFileSync(path.join(directorio, '.env.local'), `${lineas.join('\n')}\n`);
    return cargarEnProcesoNuevo(directorio, Object.keys(valores));
  } finally {
    rmSync(directorio, { recursive: true, force: true });
  }
}

const HASH_ARGON2ID =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$Zm9vYmFyYmF6cXV4ZnJvYm5pY2F0ZWRoYXNo';

describe('envFileLine', () => {
  it('devuelve intacto un hash Argon2id tras pasar por el cargador de entorno', () => {
    expect(idaYVuelta({ SUPERADMIN_PASSWORD_HASH: HASH_ARGON2ID })).toEqual({
      SUPERADMIN_PASSWORD_HASH: HASH_ARGON2ID,
    });
  });

  it('demuestra que el mismo hash sin escapar llega mutilado', () => {
    const directorio = mkdtempSync(path.join(tmpdir(), 'fi-env-'));
    try {
      writeFileSync(path.join(directorio, '.env.local'), `SIN_ESCAPAR='${HASH_ARGON2ID}'\n`);
      const cargado = cargarEnProcesoNuevo(directorio, ['SIN_ESCAPAR']);
      expect(cargado['SIN_ESCAPAR']).not.toBe(HASH_ARGON2ID);
    } finally {
      rmSync(directorio, { recursive: true, force: true });
    }
  });

  it('conserva comillas dobles, contrabarras, acentos graves y almohadillas', () => {
    const valores = {
      CON_COMILLAS: 'valor con "comillas" dentro',
      CON_CONTRABARRA: 'C:\\ruta\\de\\windows',
      CON_ACENTO_GRAVE: 'orden `peligrosa` entre acentos',
      CON_ALMOHADILLA: 'valor # que no es un comentario',
      CON_TODO: '$a\\b"c`d$e',
    };
    expect(idaYVuelta(valores)).toEqual(valores);
  });

  it('conserva la secuencia \\n literal en vez de convertirla en salto de línea', () => {
    const valores = { CON_ENE: 'primera\\nsegunda' };
    expect(idaYVuelta(valores)).toEqual(valores);
  });

  it('se niega a escribir lo que el formato no sabe representar', () => {
    expect(() => envFileLine('CON_SALTO', 'a\nb')).toThrow(/saltos de línea/);
    expect(() => envFileLine('CON_COMILLA_SIMPLE', "a'b")).toThrow(/comilla simple/);
    expect(() => envFileLine('TERMINA_EN_CONTRABARRA', 'a\\')).toThrow(/contrabarra/);
    expect(() => envFileLine('minusculas', 'a')).toThrow(/no válido/);
  });

  it('conserva una cadena de conexión con contraseña que lleva signos de dólar', () => {
    const valores = { CONEXION_DE_PRUEBA: 'postgresql://app:p$a$$w0rd@localhost:5432/fuerza?sslmode=require' };
    expect(idaYVuelta(valores)).toEqual(valores);
  });

  it('no deja que el valor de una variable se cuele en el de otra', () => {
    const valores = { PRIMERA_DE_PRUEBA: 'secreto', SEGUNDA_DE_PRUEBA: '$PRIMERA_DE_PRUEBA' };
    expect(idaYVuelta(valores)).toEqual(valores);
  });
});
