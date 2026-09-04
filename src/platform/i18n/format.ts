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

/**
 * Cantidad de dinero, recibida en la unidad **menor**.
 *
 * El dinero nunca circula como número con decimales en este sistema: se guarda
 * en centavos como entero, porque la aritmética de punto flotante convierte una
 * cuota de 150.10 en 150.09999999999999 y una conciliación en un problema.
 */
export function formatMoney(
  minorUnits: number | bigint,
  currency = 'MXN',
  context: FormatContext = defaultFormatContext,
): string {
  const centavos = typeof minorUnits === 'bigint' ? Number(minorUnits) : minorUnits;
  return new Intl.NumberFormat(context.locale, {
    style: 'currency',
    currency,
  }).format(centavos / 100);
}

/** Lista en lenguaje natural: «Jalisco, Nayarit y Colima». */
export function formatList(items: readonly string[], context: FormatContext = defaultFormatContext): string {
  return new Intl.ListFormat(context.locale, { style: 'long', type: 'conjunction' }).format([...items]);
}
