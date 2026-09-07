/**
 * Minimización antes de enviar al modelo (PRD §15.5; ADR-0145).
 *
 * Lo que se manda al proveedor se reduce primero: se sustituyen los datos
 * personales que se reconocen —correo, CURP, RFC, teléfono, secuencias largas de
 * dígitos— por un marcador. No es cifrado ni una promesa de exhaustividad: es la
 * primera línea, la que quita lo evidente antes de que salga del servidor. El
 * segundo muro es que **la fila de la bitácora nunca guarda lo enviado en claro**,
 * solo su huella (bloque B), de modo que ni lo redactado ni lo que se escapara al
 * redactor queda en una tabla de telemetría.
 */

export interface RedactionResult {
  /** El texto con los datos reconocidos sustituidos por marcadores. */
  readonly text: string;
  /** Si se sustituyó algo. Es lo que se registra como `redactionApplied`. */
  readonly applied: boolean;
  /** Qué clases de dato se encontraron, para el registro (nunca el valor). */
  readonly categories: readonly string[];
}

/**
 * El orden importa: CURP y RFC contienen dígitos, así que se reconocen antes de
 * que la regla de secuencias largas los confunda con un número suelto.
 */
const PATRONES: readonly { readonly re: RegExp; readonly marca: string; readonly categoria: string }[] = [
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi, marca: '[correo]', categoria: 'correo' },
  // CURP: 4 letras, 6 dígitos, H/M, 5 letras, alfanumérico y dígito.
  { re: /\b[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, marca: '[curp]', categoria: 'curp' },
  // RFC de persona física (13) o moral (12).
  { re: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, marca: '[rfc]', categoria: 'rfc' },
  // Teléfono de diez dígitos, con o sin lada +52 y con separadores.
  { re: /\b(?:\+?52[\s.-]?)?(?:\d[\s.-]?){9}\d\b/g, marca: '[teléfono]', categoria: 'telefono' },
  // Cualquier otra tira de once o más dígitos: folios largos, cuentas, tarjetas.
  { re: /\b\d{11,}\b/g, marca: '[número]', categoria: 'numero' },
];

/**
 * Redacta el texto. Devuelve el texto redactado, si se aplicó algo y qué clases
 * de dato se reconocieron —nunca los valores, que es justo lo que no debe salir—.
 */
export function redact(texto: string): RedactionResult {
  let resultado = texto;
  const categorias = new Set<string>();

  for (const { re, marca, categoria } of PATRONES) {
    resultado = resultado.replace(re, () => {
      categorias.add(categoria);
      return marca;
    });
  }

  return { text: resultado, applied: categorias.size > 0, categories: [...categorias] };
}

/**
 * Sospecha de instrucciones incrustadas en un texto (PRD §15.5; ADR-0146).
 *
 * No borra ni bloquea: **marca**. Un fragmento consultado que trae «ignora las
 * instrucciones anteriores» no es un error del que lo pregunta, y quien revise la
 * salida necesita saber que el material intentaba secuestrar al modelo. Por eso
 * `injectionSuspected` es una marca de la fila, no un rechazo: el rechazo, cuando
 * toca, lo hace la revisión humana de cada salida (bloque F).
 */
const INYECCION: readonly RegExp[] = [
  /ignora(?:\s+(?:las|todas|todas las|estas|mis|anteriores|previas))*\s+(?:instrucciones|indicaciones|reglas)/i,
  /olvida(?:te de)?\s+(?:todo|lo anterior|las instrucciones|tus instrucciones)/i,
  /haz caso omiso/i,
  /no sigas\s+(?:las|tus)\s+instrucciones/i,
  /act[úu]a como (?:si fueras|un|una)/i,
  /a partir de ahora eres/i,
  /nuevas?\s+instrucciones\s*:/i,
  /revela\s+(?:tu|el)\s+(?:prompt|sistema|configuraci[óo]n)/i,
  /\b(?:system|assistant|usuario|system prompt)\s*:/i,
  // Inglés, que es como llega la mayoría de las inyecciones copiadas.
  /ignore\s+(?:(?:all|the|previous|prior|any)\s+)*(?:instructions|prompts|rules)/i,
  /disregard\s+(?:all\s+|the\s+|previous\s+)?/i,
  /you are now\b/i,
  /forget\s+(?:everything|all|previous|the above)/i,
];

/** ¿El texto trae señales de instrucciones incrustadas? */
export function detectInjection(texto: string): boolean {
  return INYECCION.some((re) => re.test(texto));
}
