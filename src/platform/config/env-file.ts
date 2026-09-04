/**
 * Escritura de líneas para archivos de entorno locales.
 *
 * Hay dos maneras de leer un `.env` y **no coinciden**:
 *
 *  · El cargador de Next (`@next/env`) expande variables: `$argon2id` dentro de
 *    un valor se sustituye por el contenido de la variable `argon2id`, que no
 *    existe, y el valor queda mutilado. Las comillas no lo evitan; lo único que
 *    lo evita es escribir `\$`.
 *  · El cargador nativo de Node (`process.loadEnvFile`) no expande nada.
 *
 * Un hash Argon2id empieza por `$` y lleva otros tres. Es decir: el valor más
 * sensible del archivo es justo el que se estropea, sin ningún error a la
 * vista. Por eso hay una sola función que escribe la línea, todo lo que genera
 * entorno pasa por ella, y una sola forma de leer el archivo
 * (`local-env.ts`), que es la del servidor.
 *
 * El analizador que usa Next desescapa **únicamente** `\$`. Las contrabarras,
 * las comillas y los acentos graves llegan tal cual, y en un valor entre
 * comillas dobles convierte además `\n` y `\r` en salto de línea y retorno. De
 * ahí las dos decisiones de abajo: comillas simples, y error en lugar de
 * apaño para lo que el formato no sabe representar.
 */

/**
 * Devuelve la línea `NOMBRE='valor'` lista para pegar en un archivo de entorno.
 *
 * Lanza si el valor no se puede representar sin pérdida. Es deliberado: una
 * línea que se lee distinta de como se escribió es peor que no tener línea,
 * porque el fallo aparece lejos y sin relación aparente con su causa. En el
 * panel de Vercel no hace falta nada de esto: ahí el valor se pega crudo
 * porque no hay archivo ni expansión de por medio.
 */
export function envFileLine(name: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(`Nombre de variable de entorno no válido: ${JSON.stringify(name)}.`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`El valor de ${name} tiene saltos de línea y un archivo de entorno no puede llevarlos.`);
  }
  if (value.includes("'")) {
    throw new Error(
      `El valor de ${name} lleva una comilla simple. El analizador de entorno no la desescapa: ` +
        'defina esa variable en el panel del proveedor, no en un archivo.',
    );
  }
  if (value.endsWith('\\')) {
    throw new Error(
      `El valor de ${name} termina en contrabarra y se comería la comilla de cierre. ` +
        'Defina esa variable en el panel del proveedor, no en un archivo.',
    );
  }

  return `${name}='${value.replaceAll('$', '\\$')}'`;
}
