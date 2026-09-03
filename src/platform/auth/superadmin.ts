import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { verifyPassword } from '@/platform/auth/password';
import { safeEquals } from '@/platform/kernel/ids';

/**
 * Superadmin raíz definido por variables de entorno (PRD §4.4, docs/SECURITY.md §3).
 *
 * No existe como registro editable: su correo y su hash viven en el entorno, de
 * modo que nadie puede crearlo, alterarlo ni escalar hacia él desde la
 * aplicación. La única fila que le corresponde en la base es su `Actor`, que
 * sirve para **atribuir** sus actos y que no concede ni retiene acceso alguno
 * (ADR-0026).
 */

/** Identificador estable del actor raíz. Lo crea la semilla. */
export const ROOT_ACTOR_LABEL = 'Superadmin raíz';

export interface RootCredentialsCheck {
  readonly ok: boolean;
  readonly sessionVersion: number;
}

/**
 * Comprueba las credenciales del actor raíz.
 *
 * Compara el correo en tiempo constante y **siempre** ejecuta la verificación
 * del hash, incluso cuando el correo no coincide: si se cortocircuitara, el
 * tiempo de respuesta revelaría si el correo es el correcto.
 */
export async function verifyRootCredentials(email: string, password: string): Promise<RootCredentialsCheck> {
  const config = env();
  const emailMatches = safeEquals(email.trim().toLowerCase(), config.SUPERADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = await verifyPassword(config.SUPERADMIN_PASSWORD_HASH, password);

  return {
    ok: emailMatches && passwordMatches,
    sessionVersion: config.SUPERADMIN_SESSION_VERSION,
  };
}

/** La versión declarada en el entorno invalida de inmediato las sesiones raíz. */
export function currentRootSessionVersion(): number {
  return env().SUPERADMIN_SESSION_VERSION;
}

/**
 * Actor de atribución del Superadmin raíz.
 *
 * Si no existe, se crea: es un asidero de atribución, no un sujeto de
 * autorización, y su ausencia no debe impedir registrar lo que hizo.
 */
export async function rootActorId(): Promise<string> {
  const existing = await db().actor.findFirst({ where: { kind: 'ROOT_SUPERADMIN' }, select: { id: true } });
  if (existing !== null) return existing.id;

  const created = await db().actor.create({
    data: { kind: 'ROOT_SUPERADMIN', label: ROOT_ACTOR_LABEL },
    select: { id: true },
  });
  return created.id;
}

/**
 * Actor de un trabajo programado. Se crea al primer uso de cada tipo.
 */
export async function systemActorId(jobType: string): Promise<string> {
  const label = `Trabajo programado: ${jobType}`;
  const existing = await db().actor.findFirst({
    where: { kind: 'SYSTEM_JOB', label },
    select: { id: true },
  });
  if (existing !== null) return existing.id;

  const created = await db().actor.create({
    data: { kind: 'SYSTEM_JOB', label },
    select: { id: true },
  });
  return created.id;
}
