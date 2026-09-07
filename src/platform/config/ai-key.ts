/**
 * Resolución de la clave del proveedor de IA por el **nombre** de la variable de
 * entorno que la contiene (ADR-0132, ADR-0136).
 *
 * Este es el **único** sitio del sistema donde ese nombre se convierte en una
 * clave. La fila `AiProviderConfiguration` guarda `apiKeyEnvVarName` —el nombre,
 * nunca el secreto— y de aquí sale su valor. Que el nombre sea administrable y no
 * una constante es lo que permite rotar la variable, o apuntar a una cuenta
 * distinta, sin desplegar; y que la resolución viva en un solo lugar es lo que
 * permite auditar quién puede leer una clave con solo mirar quién importa esto.
 *
 * Vive en `src/platform/config/` porque es el único árbol donde el linter admite
 * leer `process.env`: fuera de aquí, la configuración se lee validada (PRD §21).
 */

/**
 * Forma que un nombre de variable de entorno tiene que tener, idéntica a la
 * restricción `ai_provider_solo_el_nombre_de_la_variable` de la base. Se repite
 * a propósito y se comprueba de nuevo aquí: la base defiende su fila, y este
 * módulo defiende el `process.env` de que alguien le pase, por otro camino, una
 * clave disfrazada de nombre —una prueba que fija el entorno a mano, un valor
 * pegado en un panel— y termine leyendo `process.env['AIza…']`, que devuelve
 * indefinido en silencio y haría parecer «sin clave» a un proveedor que sí la
 * tiene.
 */
const NOMBRE_DE_VARIABLE = /^[A-Z][A-Z0-9_]{2,79}$/;

/**
 * Devuelve la clave que guarda la variable llamada `varName`, o la cadena vacía
 * si no está definida. **La cadena vacía es la señal de degradación**: quien
 * llama cae al camino humano en lugar de mandar una petición sin credencial.
 *
 * Nunca lanza por una clave ausente —eso es un estado de operación normal, no un
 * error— pero sí rechaza un `varName` que no parezca un nombre de variable, que
 * solo puede llegar por un uso indebido y nunca por una fila válida.
 */
export function resolveAiApiKey(varName: string): string {
  if (!NOMBRE_DE_VARIABLE.test(varName)) {
    throw new Error(
      'El nombre de la variable de entorno de la clave de IA no tiene forma de nombre de variable. ' +
        'La clave se guarda en el entorno y la fila del proveedor guarda solo el nombre (ADR-0132).',
    );
  }
  // Este árbol (`src/platform/config/`) es el único que el linter autoriza a
  // leer `process.env` (PRD §21); resolver aquí el nombre es el punto de ADR-0136.
  return process.env[varName] ?? '';
}
