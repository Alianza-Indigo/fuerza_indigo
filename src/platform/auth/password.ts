import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id` es un enum ambiente constante y no puede importarse con
 * `verbatimModuleSyntax`. Su valor forma parte del formato del hash y no cambia:
 * se declara aquí con el nombre a la vista para que nadie tenga que adivinarlo.
 */
const ARGON2ID = 2;

/**
 * Hash de contraseñas con Argon2id (ADR-0003, PRD §20.1).
 *
 * Los parámetros se guardan **junto al hash** para poder elevarlos más adelante
 * sin invalidar las credenciales existentes: al iniciar sesión con parámetros
 * antiguos, la contraseña se vuelve a cifrar con los vigentes de forma
 * transparente para la persona.
 */

export interface Argon2Params {
  readonly algorithm: 'argon2id';
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
  readonly outputLen: number;
  /** Se persiste como JSON junto al hash: necesita ser un objeto indexable. */
  readonly [key: string]: string | number;
}

/** Parámetros vigentes. Recomendación OWASP para Argon2id. */
export const CURRENT_PARAMS: Argon2Params = {
  algorithm: 'argon2id',
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(password: string): Promise<{ hash: string; params: Argon2Params }> {
  const value = await argonHash(password, {
    algorithm: ARGON2ID,
    memoryCost: CURRENT_PARAMS.memoryCost,
    timeCost: CURRENT_PARAMS.timeCost,
    parallelism: CURRENT_PARAMS.parallelism,
    outputLen: CURRENT_PARAMS.outputLen,
  });
  return { hash: value, params: CURRENT_PARAMS };
}

/**
 * Verifica la contraseña. Devuelve `false` ante cualquier error de formato en
 * lugar de lanzar: un hash corrupto no debe distinguirse de una contraseña
 * incorrecta desde fuera.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, password);
  } catch {
    return false;
  }
}

/** ¿El hash se generó con parámetros anteriores a los vigentes? */
export function needsRehash(params: Partial<Argon2Params> | null | undefined): boolean {
  if (params === null || params === undefined) return true;
  return (
    params.memoryCost !== CURRENT_PARAMS.memoryCost ||
    params.timeCost !== CURRENT_PARAMS.timeCost ||
    params.parallelism !== CURRENT_PARAMS.parallelism
  );
}

/* -------------------------------------------------------------------------- */
/* Política de contraseñas (PRD §20.1)                                        */
/* -------------------------------------------------------------------------- */

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Contraseñas notoriamente comprometidas o triviales en español y en inglés.
 *
 * No sustituye a una verificación contra un servicio de filtraciones, que se
 * incorpora en la Fase 12; corta desde ahora los casos más frecuentes sin
 * imponer reglas de composición, que empeoran la usabilidad sin mejorar la
 * seguridad.
 */
const COMMON_PASSWORDS = new Set([
  'contrasena123',
  'contraseña123',
  'password1234',
  'qwertyuiop12',
  '123456789012',
  'administrador',
  'fuerzaindigo',
  'sindicato123',
  'iloveyou1234',
  'abcdefghijkl',
]);

export interface PasswordPolicyResult {
  readonly ok: boolean;
  readonly problems: string[];
}

export function checkPasswordPolicy(password: string, context: { email?: string; givenName?: string } = {}): PasswordPolicyResult {
  const problems: string[] = [];
  const normalized = password.trim().toLowerCase();

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres. Una frase que recuerdes es más segura que una palabra corta con símbolos.`);
  }
  if (COMMON_PASSWORDS.has(normalized)) {
    problems.push('Esta contraseña aparece en listas públicas de contraseñas filtradas. Elige otra.');
  }
  if (context.email !== undefined && context.email !== '') {
    const local = context.email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && normalized.includes(local)) {
      problems.push('No incluyas tu correo dentro de la contraseña.');
    }
  }
  if (context.givenName !== undefined && context.givenName.length >= 4 && normalized.includes(context.givenName.toLowerCase())) {
    problems.push('No incluyas tu nombre dentro de la contraseña.');
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('No uses un solo carácter repetido.');
  }

  return { ok: problems.length === 0, problems };
}
