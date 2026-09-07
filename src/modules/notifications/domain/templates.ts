/**
 * Plantillas de aviso: la parte pura.
 *
 * Un aviso parte de una plantilla versionada, nunca de texto incrustado en el
 * código (ADR-0016). Que las variables usadas y las declaradas coincidan es una
 * afirmación que se comprueba sin base de datos: un aviso con un `{{hueco}}` que
 * nadie declaró sale con el hueco a la vista, y una variable declarada que el
 * texto no usa hace creer que un dato viaja cuando se descarta.
 */

/** Código de plantilla: mayúsculas, números y guiones bajos. */
export const CODIGO_DE_PLANTILLA = /^[A-Z][A-Z0-9_]{2,79}$/;
/** Nombre admisible de variable. */
export const NOMBRE_DE_VARIABLE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
/** Marca de sustitución: `{{nombre}}`. La misma que sustituye el puerto de correo. */
export const MARCA_DE_VARIABLE = /\{\{(\w+)\}\}/g;

/** Variables que el asunto y el cuerpo de una plantilla usan, sin repetir. */
export function variablesUsadas(...textos: Array<string | null>): readonly string[] {
  const encontradas = new Set<string>();
  for (const texto of textos) {
    if (texto === null) continue;
    for (const coincidencia of texto.matchAll(MARCA_DE_VARIABLE)) {
      const nombre = coincidencia[1];
      if (nombre !== undefined) encontradas.add(nombre);
    }
  }
  return [...encontradas];
}

/** Variables declaradas de una plantilla, leídas de su columna `variables`. */
export function variablesDeclaradas(variables: unknown): readonly string[] {
  if (!Array.isArray(variables)) return [];
  return variables.filter((valor): valor is string => typeof valor === 'string' && NOMBRE_DE_VARIABLE.test(valor));
}
