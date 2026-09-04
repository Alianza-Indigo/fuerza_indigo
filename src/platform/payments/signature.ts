import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma de un webhook de Stripe (PRD §11.4).
 *
 * Se implementa aquí en vez de delegarla en la biblioteca del proveedor, y la
 * razón no es evitar una dependencia: es que **esta comprobación es la que
 * separa un cobro real de uno inventado por cualquiera que conozca la
 * dirección**. Implementada aquí se puede probar con cargas construidas a mano
 * —firma correcta, firma de otro secreto, marca de tiempo vieja, encabezado
 * malformado—, y esas pruebas dicen algo. Con una llamada a `constructEvent` la
 * prueba solo diría que la biblioteca sigue instalada.
 *
 * El esquema de Stripe: el encabezado `Stripe-Signature` trae `t=<marca>` y una
 * o más `v1=<firma>`. La firma es HMAC-SHA256 de `<marca>.<cuerpo crudo>` con el
 * secreto del webhook de **esa cuenta**.
 */

/**
 * Tolerancia por omisión, en segundos.
 *
 * Cinco minutos es lo que recomienda Stripe. Sirve contra la repetición: quien
 * capture una petición legítima no puede reenviarla mañana. No sustituye a la
 * idempotencia por identificador de evento, que es lo que protege del reenvío
 * legítimo del propio Stripe dentro de la ventana.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureFailure =
  | 'ENCABEZADO_AUSENTE'
  | 'ENCABEZADO_MALFORMADO'
  | 'MARCA_DE_TIEMPO_FUERA_DE_TOLERANCIA'
  | 'FIRMA_NO_COINCIDE'
  | 'SECRETO_NO_CONFIGURADO';

export type SignatureResult = { valid: true } | { valid: false; reason: SignatureFailure };

/** Descompone `t=1,v1=abc,v1=def` sin suponer orden ni número de firmas. */
function parseHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const parte of header.split(',')) {
    const separador = parte.indexOf('=');
    if (separador === -1) continue;

    const clave = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();

    if (clave === 't') {
      const numero = Number(valor);
      if (Number.isFinite(numero)) timestamp = numero;
    } else if (clave === 'v1') {
      signatures.push(valor);
    }
  }

  return { timestamp, signatures };
}

/**
 * Compara en tiempo constante.
 *
 * Una comparación con `===` filtra por cuánto tarda en fallar, y con suficientes
 * intentos eso permite adivinar la firma carácter a carácter. `timingSafeEqual`
 * exige longitudes iguales, así que la diferencia de longitud se resuelve antes
 * y sin mirar el contenido.
 */
function equalInConstantTime(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyStripeSignature(input: {
  /** El cuerpo **crudo**, byte a byte. Un JSON reserializado ya no coincide. */
  readonly rawBody: string;
  readonly header: string | null;
  readonly secret: string;
  readonly toleranceSeconds?: number;
  /** Inyectable para poder probar la tolerancia sin esperar cinco minutos. */
  readonly now?: Date;
}): SignatureResult {
  if (input.secret === '') return { valid: false, reason: 'SECRETO_NO_CONFIGURADO' };
  if (input.header === null || input.header.trim() === '') return { valid: false, reason: 'ENCABEZADO_AUSENTE' };

  const { timestamp, signatures } = parseHeader(input.header);
  if (timestamp === null || signatures.length === 0) return { valid: false, reason: 'ENCABEZADO_MALFORMADO' };

  const ahora = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerancia = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  // El valor absoluto cubre las dos direcciones: una marca del futuro es tan
  // sospechosa como una del pasado, y suele significar un reloj mal puesto.
  if (Math.abs(ahora - timestamp) > tolerancia) {
    return { valid: false, reason: 'MARCA_DE_TIEMPO_FUERA_DE_TOLERANCIA' };
  }

  const esperada = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody}`, 'utf8')
    .digest('hex');

  // Se admiten varias firmas porque Stripe las manda durante una rotación de
  // secreto: la vieja y la nueva viajan juntas hasta que la rotación termina.
  const coincide = signatures.some((firma) => equalInConstantTime(firma, esperada));
  return coincide ? { valid: true } : { valid: false, reason: 'FIRMA_NO_COINCIDE' };
}

/** Compone un encabezado válido. Lo usan las pruebas y el guion de desarrollo. */
export function signStripePayload(input: { rawBody: string; secret: string; now?: Date }): string {
  const marca = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const firma = createHmac('sha256', input.secret).update(`${marca}.${input.rawBody}`, 'utf8').digest('hex');
  return `t=${marca},v1=${firma}`;
}
