/**
 * Formatos de fecha, número y moneda (PRD §24 Fase 2, F2-ARQ-001).
 *
 * Centralizados por una razón concreta: la zona horaria. Un `toLocaleString`
 * suelto en un componente usa la del servidor, que en Vercel es UTC, de modo
 * que una asamblea convocada a las 19:00 en Ciudad de México aparecería como la
 * 01:00 del día siguiente. Aquí la zona es un argumento obligatorio y viaja en
 * el contexto de la persona.
 *
 * El idioma inicial es el español de México y la arquitectura queda
 * internacionalizable: las funciones aceptan configuración regional, y los
 * textos viven en un catálogo aparte.
 */

export const DEFAULT_LOCALE = 'es-MX';
export const DEFAULT_TIME_ZONE = 'America/Mexico_City';

export interface FormatContext {
  readonly locale: string;
  readonly timeZone: string;
}

export const defaultFormatContext: FormatContext = {
  locale: DEFAULT_LOCALE,
  timeZone: DEFAULT_TIME_ZONE,
};

/** Fecha sola: «15 de junio de 2026». */
export function formatDate(value: Date, context: FormatContext = defaultFormatContext): string {
  return new Intl.DateTimeFormat(context.locale, {
    dateStyle: 'long',
    timeZone: context.timeZone,
  }).format(value);
}

/** Fecha corta para tablas: «15 jun 2026». */
export function formatDateShort(value: Date, context: FormatContext = defaultFormatContext): string {
  return new Intl.DateTimeFormat(context.locale, {
    dateStyle: 'medium',
    timeZone: context.timeZone,
  }).format(value);
}

/** Fecha y hora: lo que se usa para convocatorias y asambleas. */
export function formatDateTime(value: Date, context: FormatContext = defaultFormatContext): string {
  return new Intl.DateTimeFormat(context.locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: context.timeZone,
  }).format(value);
}

/**
 * Tiempo relativo: «hace 3 días».
 *
 * Se usa **junto** a la fecha absoluta, nunca en su lugar. «Hace 3 días» es
 * cómodo para orientarse y pésimo para citar: un acuerdo de asamblea se
 * referencia por su fecha.
 */
export function formatRelative(value: Date, now: Date = new Date(), context: FormatContext = defaultFormatContext): string {
  const segundos = Math.round((value.getTime() - now.getTime()) / 1000);
  const formateador = new Intl.RelativeTimeFormat(context.locale, { numeric: 'auto' });

  const escalas: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unidad, tamaño] of escalas) {
    if (Math.abs(segundos) >= tamaño) return formateador.format(Math.round(segundos / tamaño), unidad);
  }
  return formateador.format(Math.round(segundos), 'second');
}

/** Número con separadores de miles. */
export function formatNumber(value: number, context: FormatContext = defaultFormatContext): string {
  return new Intl.NumberFormat(context.locale).format(value);
}

/** Cuántos decimales tiene cada moneda que la plataforma cobra. */
const EXPONENTE: Record<string, number> = { MXN: 2, USD: 2 };

export function exponentOf(currency: string): number {
  return EXPONENTE[currency] ?? 2;
}

export type ParsedAmount = { readonly ok: true; readonly minor: bigint } | { readonly ok: false; readonly reason: string };

/**
 * Convierte lo que alguien escribió en un formulario a unidades menores.
 *
 * **El punto es siempre el separador decimal.** Es la convención de México, que
 * es donde se captura. Leerlo alguna vez como separador de millares —al estilo
 * europeo— haría que «150.005» valiera ciento cincuenta mil cinco pesos en vez
 * de un importe con un decimal de más: un error de mil veces, silencioso, en un
 * cobro que sale de verdad.
 *
 * La coma se acepta como millares —un grupo de millares tiene exactamente tres
 * dígitos y no se confunde con nada— y como decimal cuando no puede ser lo
 * primero, que es como se escribe en media América. Lo que no encaja se rechaza
 * en vez de adivinarse: un importe mal interpretado se cobra de verdad.
 */
export function parseAmountToMinor(raw: string, currency: string): ParsedAmount {
  const exponente = exponentOf(currency);
  const limpio = raw.trim().replace(/^\$/, '').replace(/\s| /g, '');

  if (limpio === '') return { ok: false, reason: 'Escribe la cantidad que se cobra.' };

  // La coma sí puede ser separador de millares, porque un grupo de millares
  // tiene exactamente tres dígitos y eso no se confunde con un decimal. El
  // punto no: leerlo como millares haría que «150.005» valiera ciento
  // cincuenta mil cinco pesos.
  const sinMillares = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(limpio)
    ? limpio.replace(/,/g, '')
    : limpio.replace(',', '.');

  const partes = /^(\d+)(?:\.(\d+))?$/.exec(sinMillares);
  if (partes === null) {
    return { ok: false, reason: 'La cantidad lleva solo números y, si hace falta, un punto decimal. Por ejemplo: 150.00.' };
  }

  const entera = partes[1] ?? '0';
  const decimal = partes[2] ?? '';

  if (decimal.length > exponente) {
    return {
      ok: false,
      reason:
        exponente === 0
          ? 'Esta moneda no tiene centavos: escribe una cantidad entera.'
          : `Como mucho ${String(exponente)} decimales: no existe media fracción de centavo y redondearla sería inventar dinero.`,
    };
  }

  const minor = BigInt(entera) * 10n ** BigInt(exponente) + BigInt((decimal + '0'.repeat(exponente)).slice(0, exponente) || '0');
  return { ok: true, minor };
}

/**
 * Cantidad de dinero, recibida en la unidad **menor**.
 *
 * El dinero nunca circula como número con decimales en este sistema: se guarda
 * en centavos como entero, porque la aritmética de punto flotante convierte una
 * cuota de 150.10 en 150.09999999999999 y una conciliación en un problema.
 *
 * Se formatea la cadena decimal, no un `number`: `Intl.NumberFormat` acepta
 * cadenas desde ECMA-402 v3, y así un importe mayor que `Number.MAX_SAFE_INTEGER`
 * se presenta exacto en vez de redondeado. Dividir entre cien, que es como
 * estaba antes, daba lo contrario: perdía precisión justo en los importes
 * grandes, que son los que nadie quiere ver mal.
 */
export function formatMoney(
  minorUnits: number | bigint,
  currency = 'MXN',
  context: FormatContext = defaultFormatContext,
): string {
  const exponente = exponentOf(currency);
  const minor = typeof minorUnits === 'bigint' ? minorUnits : BigInt(Math.trunc(minorUnits));
  const negativo = minor < 0n;
  const absoluto = negativo ? -minor : minor;
  const divisor = 10n ** BigInt(exponente);
  const entera = absoluto / divisor;
  const resto = (absoluto % divisor).toString().padStart(exponente, '0');

  const decimal = `${negativo ? '-' : ''}${entera.toString()}${exponente === 0 ? '' : `.${resto}`}`;

  // El tipo de `format` solo admite literales numéricos que TypeScript pueda
  // comprobar en tiempo de compilación; esta cadena se construye aquí mismo a
  // partir de dígitos, así que la afirmación no oculta nada que pueda variar.
  return new Intl.NumberFormat(context.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponente,
    maximumFractionDigits: exponente,
  }).format(decimal as `${number}`);
}

/**
 * El instante en que empieza un día del calendario en una zona horaria.
 *
 * Un campo de fecha entrega «2026-01-01», que es un día del calendario y no un
 * instante. Convertirlo con `new Date('2026-01-01T00:00:00Z')` lo fija a la
 * medianoche de Londres: en México eso son las seis de la tarde del 31 de
 * diciembre, y un precio que la organización acordó para enero empieza a regir
 * en diciembre y además se presenta con la fecha del día anterior.
 *
 * Se resuelve el desfase consultando la zona en ese mismo instante, y se repite
 * una vez porque el desfase puede cambiar entre la primera estimación y el
 * resultado: es lo que pasa en el día en que entra o sale el horario de verano.
 */
export function startOfDayInZone(calendarDate: string, timeZone: string = DEFAULT_TIME_ZONE): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate.trim());
  if (partes === null) return null;

  const [año, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const aproximado = Date.UTC(año, mes - 1, dia, 0, 0, 0, 0);

  const lector = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const comoUtc = (ms: number): number => {
    const campos: Record<string, number> = {};
    for (const parte of lector.formatToParts(new Date(ms))) {
      if (parte.type !== 'literal') campos[parte.type] = Number(parte.value);
    }
    return Date.UTC(
      campos['year'] ?? 0,
      (campos['month'] ?? 1) - 1,
      campos['day'] ?? 1,
      campos['hour'] ?? 0,
      campos['minute'] ?? 0,
      campos['second'] ?? 0,
    );
  };

  let resultado = aproximado - (comoUtc(aproximado) - aproximado);
  resultado = aproximado - (comoUtc(resultado) - resultado);
  return new Date(resultado);
}

/** El día del calendario que se está viviendo en una zona horaria. */
export function todayInZone(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return partes;
}

/** Lista en lenguaje natural: «Jalisco, Nayarit y Colima». */
export function formatList(items: readonly string[], context: FormatContext = defaultFormatContext): string {
  return new Intl.ListFormat(context.locale, { style: 'long', type: 'conjunction' }).format([...items]);
}
