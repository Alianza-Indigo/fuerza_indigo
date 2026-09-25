import { env } from '@/platform/config/env';
import { db } from '@/platform/db/client';
import { newPublicId, safeEquals } from '@/platform/kernel/ids';
import { transaction } from '@/platform/db/unit-of-work';

/**
 * Superadmin raíz definido por variables de entorno (PRD §4.4, docs/SECURITY.md §3).
 *
 * No existe como registro editable: su correo y su contraseña viven en el
 * entorno, de modo que nadie puede crearlo, alterarlo ni escalar hacia él desde
 * la aplicación. La única fila que le corresponde en la base es su `Actor`, que
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
 * Compara correo y contraseña en tiempo constante. La contraseña vive en texto
 * plano en el entorno (ADR-0175): la comparación es directa, sin hash. Ambas
 * comprobaciones se ejecutan siempre para no revelar por el tiempo de respuesta
 * cuál de las dos falló.
 */
export function verifyRootCredentials(email: string, password: string): RootCredentialsCheck {
  const config = env();
  const emailMatches = safeEquals(email.trim().toLowerCase(), config.SUPERADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = safeEquals(password, config.SUPERADMIN_PASSWORD);

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
 * Cuenta institucional con la que la raíz firma actos que exigen `User`.
 *
 * La semilla la crea normalmente, pero una instalación antigua puede no tenerla.
 * Resolver una sesión raíz válida no puede dejar `userId = null`: se asegura
 * aquí, sin credencial y sin abrir una segunda vía de autenticación.
 */
export async function rootInstitutionalUserId(): Promise<string> {
  const email = env().SUPERADMIN_EMAIL.trim().toLowerCase();
  const existing = await db().user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) return existing.id;

  const actorId = await rootActorId();

  return transaction(async (tx) => {
    // Dos peticiones raíz simultáneas sobre una instalación antigua no deben
    // crear dos personas ni competir por el correo único de User.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`root-institutional-user:${email}`})::bigint)`;

    const afterLock = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (afterLock !== null) return afterLock.id;

    const person = await tx.person.findFirst({
      where: {
        primaryEmail: email,
        user: { is: null },
        archivedAt: null,
        mergedIntoPersonId: null,
      },
      select: { id: true },
    });

    const personId =
      person?.id ??
      (
        await tx.person.create({
          data: {
            publicId: newPublicId(),
            givenName: 'Administración',
            familyName: 'Fuerza Índigo',
            primaryEmail: email,
            createdByActorId: actorId,
            updatedByActorId: actorId,
          },
          select: { id: true },
        })
      ).id;

    const created = await tx.user.create({
      data: {
        personId,
        email,
        status: 'ACTIVE',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    return created.id;
  });
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
