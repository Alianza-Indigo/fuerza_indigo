import type { PrismaClient } from '@prisma-client/client';
import type { Compartment, RoleCode } from '@prisma-client/enums';
import { hashPassword } from '@/platform/auth/password';
import type { ActorContext, RoleAssignmentSnapshot } from '@/platform/kernel/actor-context';
import { newCorrelationId, newPublicId } from '@/platform/kernel/ids';
import { ROLE_COMPARTMENTS } from '@/platform/auth/actor-resolver';

/**
 * Datos de prueba para las pruebas de integración.
 *
 * Todos los nombres, correos y territorios son ficticios y evidentemente
 * ficticios: el PRD §0.3 prohíbe sembrar datos reales, y un dato de prueba que
 * parece real acaba en una captura de pantalla o en un informe.
 */

export const PASSWORD = 'una frase larga de prueba';

let secuencia = 0;
function unico(prefijo: string): string {
  secuencia += 1;
  return `${prefijo}-${secuencia}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface PersonaDePrueba {
  readonly actorId: string;
  readonly userId: string;
  readonly personId: string;
  readonly email: string;
}

/** Actor de atribución para lo que crean las propias pruebas. */
export async function actorDeMigracion(prisma: PrismaClient): Promise<string> {
  const existente = await prisma.actor.findFirst({ where: { kind: 'MIGRATION' }, select: { id: true } });
  if (existente !== null) return existente.id;
  const creado = await prisma.actor.create({
    data: { kind: 'MIGRATION', label: 'Semilla y migraciones' },
    select: { id: true },
  });
  return creado.id;
}

export async function crearPersonaConCuenta(
  prisma: PrismaClient,
  opciones: {
    givenName?: string;
    familyName?: string;
    email?: string;
    password?: string;
    status?: 'INVITED' | 'ACTIVE' | 'DISABLED';
    territorialUnitId?: string | null;
  } = {},
): Promise<PersonaDePrueba> {
  const autor = await actorDeMigracion(prisma);
  const email = opciones.email ?? `${unico('cuenta')}@ejemplo.invalid`;

  const person = await prisma.person.create({
    data: {
      publicId: newPublicId(),
      givenName: opciones.givenName ?? 'Persona',
      familyName: opciones.familyName ?? 'De Prueba',
      primaryEmail: email,
      territorialUnitId: opciones.territorialUnitId ?? null,
      createdByActorId: autor,
      updatedByActorId: autor,
    },
    select: { id: true },
  });

  const user = await prisma.user.create({
    data: {
      personId: person.id,
      email,
      status: opciones.status ?? 'ACTIVE',
      emailVerifiedAt: new Date(),
      createdByActorId: autor,
      updatedByActorId: autor,
    },
    select: { id: true },
  });

  const { hash, params } = await hashPassword(opciones.password ?? PASSWORD);
  await prisma.credential.create({
    data: { userId: user.id, type: 'PASSWORD', secretHash: hash, algorithmParams: { ...params } },
  });

  const actor = await prisma.actor.create({
    data: {
      kind: 'PERSON',
      userId: user.id,
      label: `${opciones.givenName ?? 'Persona'} ${opciones.familyName ?? 'De Prueba'}`,
    },
    select: { id: true },
  });

  return { actorId: actor.id, userId: user.id, personId: person.id, email };
}

/** Nombramiento vivo, con los permisos que el catálogo asigna al rol. */
export async function nombrar(
  prisma: PrismaClient,
  input: {
    userId: string;
    roleCode: RoleCode;
    grantedById: string;
    legalEntityId?: string | null;
    territorialUnitIds?: string[];
    includesDescendants?: boolean;
    endsAt?: Date | null;
  },
): Promise<string> {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: input.roleCode }, select: { id: true } });
  const asignacion = await prisma.roleAssignment.create({
    data: {
      userId: input.userId,
      roleId: role.id,
      grantedById: input.grantedById,
      grantReason: 'nombramiento creado por una prueba de integración',
      legalEntityId: input.legalEntityId ?? null,
      endsAt: input.endsAt ?? null,
      territorialScopes: {
        create: (input.territorialUnitIds ?? []).map((territorialUnitId) => ({
          territorialUnitId,
          includesDescendants: input.includesDescendants ?? true,
        })),
      },
    },
    select: { id: true },
  });
  return asignacion.id;
}

/**
 * Contexto del actor tal como lo construiría el resolvedor a partir de la base.
 *
 * Se lee de la base y no se arma a mano: de ese modo, un permiso que la semilla
 * no otorgue al rol tampoco aparece aquí, y la prueba mide el sistema real y no
 * la idea que quien la escribe tiene de él.
 */
export async function contextoDe(
  prisma: PrismaClient,
  persona: PersonaDePrueba,
  extras: Partial<ActorContext> = {},
): Promise<ActorContext> {
  const ahora = new Date();
  const asignaciones = await prisma.roleAssignment.findMany({
    where: {
      userId: persona.userId,
      revokedAt: null,
      startsAt: { lte: ahora },
      OR: [{ endsAt: null }, { endsAt: { gt: ahora } }],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      legalEntityId: true,
      organizationId: true,
      role: { select: { code: true, permissions: { select: { permission: { select: { code: true } } } } } },
      territorialScopes: {
        select: {
          territorialUnitId: true,
          includesDescendants: true,
          territorialUnit: { select: { path: true } },
        },
      },
    },
  });

  const roles: RoleAssignmentSnapshot[] = asignaciones.map((asignacion) => ({
    assignmentId: asignacion.id,
    role: asignacion.role.code,
    permissions: new Set(asignacion.role.permissions.map((link) => link.permission.code)),
    legalEntityId: asignacion.legalEntityId,
    organizationId: asignacion.organizationId,
    territories: asignacion.territorialScopes.map((scope) => ({
      territorialUnitId: scope.territorialUnitId,
      path: scope.territorialUnit.path,
      includesDescendants: scope.includesDescendants,
    })),
    startsAt: asignacion.startsAt,
    endsAt: asignacion.endsAt,
  }));

  return {
    actorId: persona.actorId,
    actorKind: 'PERSON',
    userId: persona.userId,
    personId: persona.personId,
    jobType: null,
    sessionId: null,
    roles,
    legalEntityScope: roles.map((rol) => rol.legalEntityId).filter((id): id is string => id !== null),
    // Se derivan del MISMO mapa que usa el resolvedor real. Fijarlos a mano en
    // las pruebas dejaría que el código y las pruebas se separaran sin que nada
    // lo advirtiera, y son justo estas pruebas las que deben detectarlo.
    compartments: new Set<Compartment>(
      roles.flatMap((rol) => [...(ROLE_COMPARTMENTS[rol.role] ?? [])]),
    ),
    reason: null,
    correlationId: newCorrelationId(),
    ipHash: null,
    userAgentSummary: null,
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
    ...extras,
  };
}
