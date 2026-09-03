import { z } from 'zod';

/**
 * Validación central de variables de entorno (PRD §21, docs/ENVIRONMENT.md).
 *
 * Ningún otro módulo lee `process.env`: el linter lo impide. La ausencia de una
 * variable obligatoria detiene el arranque con un mensaje que dice QUÉ falta y
 * PARA QUÉ sirve, **sin revelar el valor esperado**.
 */

/** Fase activa del producto. Determina qué variables son obligatorias. */
const ACTIVE_PHASE = 1;

/** 32 bytes en base64url producen 43 caracteres. Se exige ese mínimo. */
const secret = (purpose: string) =>
  z
    .string({ error: () => `falta y sirve para ${purpose}` })
    .min(43, { error: () => `es demasiado corta: se esperan al menos 32 bytes aleatorios en base64url. Sirve para ${purpose}` });

const optionalSecret = () => z.string().optional().default('');

const urlWithoutTrailingSlash = z
  .string()
  .url({ error: () => 'debe ser una URL absoluta, por ejemplo https://fuerzaindigo.lat' })
  .refine((value) => !value.endsWith('/'), { error: () => 'no debe terminar en barra' });

const postgresUrl = (purpose: string) =>
  z
    .string({ error: () => `falta y sirve para ${purpose}` })
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      error: () => `debe ser una cadena de conexión PostgreSQL. Sirve para ${purpose}`,
    });

/**
 * Llavero de firma de códigos verificables (ADR-0029).
 * Formato: `identificador:clave` separados por comas; la primera es la activa.
 */
const signingKeyring = z
  .string({ error: () => 'falta y sirve para firmar los códigos QR de credenciales y distintivos' })
  .transform((value, ctx) => {
    const entries = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const separator = part.indexOf(':');
        return separator === -1
          ? null
          : { keyId: part.slice(0, separator).trim(), secret: part.slice(separator + 1).trim() };
      });

    if (entries.length === 0 || entries.some((entry) => entry === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'debe ser una lista de entradas "identificador:clave" separadas por comas; la primera es la activa',
      });
      return z.NEVER;
    }
    const keys = entries as { keyId: string; secret: string }[];
    const ids = new Set(keys.map((k) => k.keyId));
    if (ids.size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'contiene identificadores de clave repetidos' });
      return z.NEVER;
    }
    return { active: keys[0]!, all: keys };
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_URL: urlWithoutTrailingSlash,
  AUTH_SECRET: secret('firmar sesiones y enlaces de corta duración'),

  SUPERADMIN_EMAIL: z.email({ error: () => 'debe ser un correo electrónico válido' }),
  SUPERADMIN_PASSWORD_HASH: z
    .string()
    .refine((value) => value.startsWith('$argon2id$'), {
      error: () => 'debe ser un hash Argon2id. Genérelo con: npm run auth:hash-password',
    }),
  SUPERADMIN_SESSION_VERSION: z.coerce.number().int().positive(),

  DATABASE_URL: postgresUrl('la conexión agrupada que usa la aplicación'),
  DIRECT_URL: postgresUrl('la conexión directa que usan las migraciones'),

  BLOB_READ_WRITE_TOKEN: z.string().min(1, { error: () => 'falta y sirve para acceder al almacén privado de archivos' }),
  FILE_URL_SIGNING_SECRET: secret('firmar las URL temporales de descarga'),

  EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'console']),
  EMAIL_FROM: z.string().min(1, { error: () => 'falta y sirve para identificar al remitente institucional' }),
  EMAIL_API_KEY: optionalSecret(),

  CRON_SECRET: secret('autenticar las invocaciones de los trabajos programados'),
  QR_SIGNING_SECRET: signingKeyring,

  // Fases posteriores. Se declaran desde ahora para que el arranque valide el
  // conjunto completo, pero no son obligatorias hasta su fase (ENVIRONMENT.md §11).
  STRIPE_FUERZA_SECRET_KEY: optionalSecret(),
  STRIPE_FUERZA_WEBHOOK_SECRET: optionalSecret(),
  NEXT_PUBLIC_STRIPE_FUERZA_PUBLISHABLE_KEY: optionalSecret(),
  STRIPE_ALIANZA_SECRET_KEY: optionalSecret(),
  STRIPE_ALIANZA_WEBHOOK_SECRET: optionalSecret(),
  NEXT_PUBLIC_STRIPE_ALIANZA_PUBLISHABLE_KEY: optionalSecret(),
  GEMINI_API_KEY: optionalSecret(),
  GEMINI_DEFAULT_MODEL: optionalSecret(),
});

export type Env = z.infer<typeof schema>;

/** Variables cuyo valor pasa a ser obligatorio en cada fase (ENVIRONMENT.md §11). */
const REQUIRED_BY_PHASE: Record<number, (keyof Env)[]> = {
  1: [],
  3: [
    'STRIPE_FUERZA_SECRET_KEY',
    'STRIPE_FUERZA_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_FUERZA_PUBLISHABLE_KEY',
    'STRIPE_ALIANZA_SECRET_KEY',
    'STRIPE_ALIANZA_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_ALIANZA_PUBLISHABLE_KEY',
  ],
  10: ['GEMINI_API_KEY', 'GEMINI_DEFAULT_MODEL'],
};

export class EnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(
      [
        'No se puede iniciar la aplicación: faltan variables de entorno o su formato no es válido.',
        '',
        ...problems.map((problem) => `  · ${problem}`),
        '',
        'Consulte docs/ENVIRONMENT.md. Copie .env.example a .env.local y complete los valores.',
        'Por seguridad, este mensaje nunca muestra el valor esperado ni el valor recibido.',
      ].join('\n'),
    );
    this.name = 'EnvironmentError';
  }
}

/**
 * Valida el entorno. Nunca incluye valores recibidos en el mensaje de error:
 * un mensaje que muestra lo que llegó es un mensaje que filtra secretos.
 */
export function parseEnv(source: Record<string, string | undefined>, phase: number = ACTIVE_PHASE): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(desconocida)';
      return `${name} ${issue.message}`;
    });
    throw new EnvironmentError(problems);
  }

  const phaseProblems: string[] = [];
  for (const [phaseKey, variables] of Object.entries(REQUIRED_BY_PHASE)) {
    if (Number(phaseKey) > phase) continue;
    for (const variable of variables) {
      if (result.data[variable] === '') {
        phaseProblems.push(`${variable} es obligatoria desde la Fase ${phaseKey} y llegó vacía`);
      }
    }
  }
  if (phaseProblems.length > 0) throw new EnvironmentError(phaseProblems);

  return result.data;
}

let cached: Env | null = null;

/** Configuración validada. Se resuelve una sola vez por proceso. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Solo para pruebas: descarta la configuración memorizada. */
export function resetEnvCache(): void {
  cached = null;
}
