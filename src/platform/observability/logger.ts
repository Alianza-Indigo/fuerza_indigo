/**
 * Registro estructurado con saneamiento obligatorio (PRD §20.3).
 *
 * Está prohibido registrar contraseñas, testigos, diagnósticos, contenido
 * documental o datos de personas menores. El saneador aplica una lista de
 * campos vetados y **trunca lo desconocido**: si un campo no se reconoce, se
 * recorta en lugar de confiar en que sea inocuo.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Campos que nunca se escriben, sea cual sea su valor. */
const FORBIDDEN_KEYS = new Set(
  [
    'password',
    'passwordhash',
    'secret',
    'token',
    'tokenhash',
    'authorization',
    'cookie',
    'setcookie',
    'apikey',
    'secrethash',
    'credential',
    'sessiontoken',
    'diagnosis',
    'clinicalnote',
    'notes',
    'body',
    'bodytemplate',
    'evidence',
    'birthdate',
    'curp',
    'rfc',
    'taxid',
    'email',
    'primaryemail',
    'phone',
    'primaryphone',
    'addressline',
  ].map((key) => key.toLowerCase()),
);

const MAX_STRING = 200;
const MAX_DEPTH = 4;

export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[profundidad excedida]';

  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: sanitize(value.message, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = FORBIDDEN_KEYS.has(key.toLowerCase()) ? '[omitido]' : sanitize(item, depth + 1);
    }
    return out;
  }
  return '[no serializable]';
}

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly module?: string;
  readonly useCase?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
  readonly outcome?: 'success' | 'denied' | 'failed';
  readonly context?: Record<string, unknown>;
}

/** Destino del registro. Se inyecta para poder capturarlo en pruebas. */
export type LogSink = (line: string) => void;

let sink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(entry: LogEntry): void {
  const payload = {
    ts: new Date().toISOString(),
    level: entry.level,
    msg: entry.message,
    ...(entry.module === undefined ? {} : { module: entry.module }),
    ...(entry.useCase === undefined ? {} : { useCase: entry.useCase }),
    ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
    ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
    ...(entry.outcome === undefined ? {} : { outcome: entry.outcome }),
    ...(entry.context === undefined ? {} : { context: sanitize(entry.context) }),
  };
  sink(JSON.stringify(payload));
}

export const logger = {
  debug: (message: string, context?: Omit<LogEntry, 'level' | 'message'>) => log({ level: 'debug', message, ...context }),
  info: (message: string, context?: Omit<LogEntry, 'level' | 'message'>) => log({ level: 'info', message, ...context }),
  warn: (message: string, context?: Omit<LogEntry, 'level' | 'message'>) => log({ level: 'warn', message, ...context }),
  error: (message: string, context?: Omit<LogEntry, 'level' | 'message'>) => log({ level: 'error', message, ...context }),
} as const;
