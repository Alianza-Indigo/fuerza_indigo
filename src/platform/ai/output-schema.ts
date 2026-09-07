/**
 * Validación de la forma de una salida contra el esquema declarado en la versión
 * del prompt (PRD §24 Fase 8: «lo que no encaje se rechaza en vez de enseñarse»).
 *
 * **No es un validador de JSON Schema completo, y lo dice.** Cubre el subconjunto
 * que los esquemas de este sistema usan de verdad —`type`, `required`,
 * `properties`, `items`, `enum`— y sobre ese subconjunto valida por completo: no
 * es un esbozo que aprueba lo que no entiende. Una palabra clave fuera del
 * subconjunto se ignora **a propósito y a la vista** (`unsupportedKeywords`), en
 * lugar de fingir que se comprobó: un validador que da por válido lo que no mira
 * es peor que ninguno, porque tranquiliza. Ampliar el subconjunto es añadir un
 * caso aquí y su prueba, no reescribir esto.
 *
 * La salida del modelo llega como texto. Aquí se parte de que ya es un valor
 * (objeto, arreglo, cadena…): quien llama la parsea antes y trata el JSON
 * malformado como «no encaja», que es lo que es.
 */

export interface SchemaValidation {
  readonly valid: boolean;
  readonly problems: readonly string[];
}

type JsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
};

const CLAVES_SOPORTADAS = new Set(['type', 'required', 'properties', 'items', 'enum']);

/** Palabras clave que un esquema trae y este validador no comprueba. */
export function unsupportedKeywords(schema: unknown): string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [];
  return Object.keys(schema).filter((clave) => !CLAVES_SOPORTADAS.has(clave));
}

function tipoDe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value; // 'object' | 'string' | 'number' | 'boolean'
}

/** ¿El valor es del tipo que pide el esquema? `integer` acepta enteros; `number`, cualquiera. */
function encajaEnTipo(esperado: string, value: unknown): boolean {
  const real = tipoDe(value);
  if (esperado === 'number') return real === 'number' || real === 'integer';
  if (esperado === 'integer') return real === 'integer';
  return real === esperado;
}

function validar(schema: JsonSchema, value: unknown, ruta: string, problems: string[]): void {
  if (schema.type !== undefined) {
    const tipos = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!tipos.some((t) => encajaEnTipo(t, value))) {
      problems.push(`${ruta || 'la raíz'} debía ser ${tipos.join(' o ')} y es ${tipoDe(value)}`);
      // Si el tipo base no encaja, comprobar propiedades o elementos daría errores
      // en cascada que esconden la causa. Se para aquí para este nodo.
      return;
    }
  }

  if (schema.enum !== undefined) {
    const permitido = schema.enum.some((opcion) => Object.is(opcion, value) || opcion === value);
    if (!permitido) {
      problems.push(`${ruta || 'la raíz'} no es uno de los valores permitidos`);
    }
  }

  if (schema.properties !== undefined && tipoDe(value) === 'object') {
    const objeto = value as Record<string, unknown>;
    for (const [clave, subEsquema] of Object.entries(schema.properties)) {
      if (Object.prototype.hasOwnProperty.call(objeto, clave)) {
        validar(subEsquema, objeto[clave], ruta === '' ? clave : `${ruta}.${clave}`, problems);
      }
    }
  }

  if (schema.required !== undefined && tipoDe(value) === 'object') {
    const objeto = value as Record<string, unknown>;
    for (const clave of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(objeto, clave)) {
        problems.push(`${ruta || 'la raíz'} no trae la clave obligatoria «${clave}»`);
      }
    }
  }

  if (schema.items !== undefined && tipoDe(value) === 'array') {
    const items = schema.items;
    (value as unknown[]).forEach((elemento, i) => {
      validar(items, elemento, `${ruta}[${i}]`, problems);
    });
  }
}

/**
 * Comprueba `value` contra `schema`. Un esquema que no sea un objeto no restringe
 * nada, y se toma como tal: es lo que hay que hacer con `true` de JSON Schema y
 * con un esquema vacío, y evita tratar un descuido como un rechazo.
 */
export function validateAgainstSchema(schema: unknown, value: unknown): SchemaValidation {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { valid: true, problems: [] };
  }
  const problems: string[] = [];
  validar(schema, value, '', problems);
  return { valid: problems.length === 0, problems };
}
