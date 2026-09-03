import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, effectiveGrantedPermissions, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { maskEmail } from '@/platform/audit/audit-service';

/**
 * Consultas del catálogo de roles y de los nombramientos vigentes.
 *
 * La pantalla de nombramientos necesita saber **qué roles puede otorgar quien
 * la está mirando**, no la lista entera. Mostrar roles que la regla de no
 * elevación va a rechazar sería ofrecer un botón que no funciona, que es lo que
 * el PRD §0.3 prohíbe. El cálculo es el mismo que aplica `assignRole`, de modo
 * que la pantalla y la decisión no pueden discrepar.
 */

export interface RoleOption {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly scopeKind: string;
  readonly requiresOfficeTerm: boolean;
  readonly permissionCount: number;
}

export async function assignableRoles(actor: ActorContext): Promise<UseCaseResult<RoleOption[]>> {
  // El sondeo lleva un motivo propio: en la pantalla todavía no hay motivo
  // escrito, y sin él la decisión respondería `MOTIVO_REQUERIDO` aunque la
  // persona sí tenga la facultad. El motivo del acto se exige al otorgar, que es
  // cuando hay algo que motivar.
  const sondeo = can({ ...actor, reason: 'consulta del catálogo de roles otorgables' }, 'access.role.assign', {
    kind: 'RoleAssignment',
  });
  if (!sondeo.allowed) return fail(errors.forbidden(explain(sondeo.reason!)));

  const mios = effectiveGrantedPermissions(actor);

  const roles = await db().role.findMany({
    orderBy: { code: 'asc' },
    select: {
      code: true,
      name: true,
      description: true,
      scopeKind: true,
      requiresOfficeTerm: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
  });

  const otorgables = roles
    .filter((rol) => rol.permissions.every((enlace) => mios.has(enlace.permission.code)))
    .map((rol) => ({
      code: rol.code,
      name: rol.name,
      description: rol.description,
      scopeKind: rol.scopeKind,
      requiresOfficeTerm: rol.requiresOfficeTerm,
      permissionCount: rol.permissions.length,
    }));

  return ok(otorgables);
}

export interface AssignmentView {
  readonly id: string;
  readonly personName: string;
  readonly maskedEmail: string;
  readonly userId: string;
  readonly roleCode: string;
  readonly roleName: string;
  readonly legalEntity: string | null;
  readonly territories: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly grantedBy: string | null;
  readonly grantReason: string;
}

/** Nombramientos vigentes que el actor alcanza. */
export async function liveAssignments(actor: ActorContext): Promise<UseCaseResult<AssignmentView[]>> {
  const decision = can(actor, 'access.permission.read', { kind: 'RoleAssignment' });
  const alterno = can({ ...actor, reason: 'consulta de nombramientos vigentes' }, 'access.role.assign', {
    kind: 'RoleAssignment',
  });
  if (!decision.allowed && !alterno.allowed) {
    return fail(errors.forbidden(explain(decision.reason ?? 'SIN_PERMISO')));
  }

  const ahora = new Date();
  const filas = await db().roleAssignment.findMany({
    where: { revokedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: ahora } }] },
    orderBy: [{ startsAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      grantReason: true,
      role: { select: { code: true, name: true } },
      legalEntity: { select: { shortName: true } },
      territorialScopes: { select: { territorialUnit: { select: { name: true } } } },
      user: {
        select: {
          id: true,
          email: true,
          person: { select: { givenName: true, familyName: true, secondFamilyName: true } },
        },
      },
      grantedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      userId: fila.user.id,
      personName: [fila.user.person.givenName, fila.user.person.familyName, fila.user.person.secondFamilyName]
        .filter((parte) => parte !== null && parte !== '')
        .join(' '),
      maskedEmail: maskEmail(fila.user.email),
      roleCode: fila.role.code,
      roleName: fila.role.name,
      legalEntity: fila.legalEntity?.shortName ?? null,
      territories: fila.territorialScopes.map((alcance) => alcance.territorialUnit.name),
      startsAt: fila.startsAt,
      endsAt: fila.endsAt,
      grantedBy:
        fila.grantedBy === null
          ? null
          : `${fila.grantedBy.person.givenName} ${fila.grantedBy.person.familyName}`,
      grantReason: fila.grantReason,
    })),
  );
}

export interface TerritoryOption {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly depth: number;
}

/** Unidades territoriales para acotar un nombramiento. */
export async function territoryOptions(actor: ActorContext): Promise<UseCaseResult<TerritoryOption[]>> {
  const decision = can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().territorialUnit.findMany({
    where: { dissolvedOn: null },
    orderBy: { path: 'asc' },
    select: { id: true, name: true, path: true, depth: true },
  });
  return ok(filas);
}

export interface AdministrableAccount {
  readonly userId: string;
  readonly personName: string;
  readonly maskedEmail: string;
  readonly status: string;
}

/** Cuentas a las que se puede otorgar un nombramiento. */
export async function accountsForAppointment(actor: ActorContext): Promise<UseCaseResult<AdministrableAccount[]>> {
  const sondeo = can({ ...actor, reason: 'consulta de cuentas nombrables' }, 'access.role.assign', {
    kind: 'RoleAssignment',
  });
  if (!sondeo.allowed) return fail(errors.forbidden(explain(sondeo.reason!)));

  const filas = await db().user.findMany({
    where: { status: { in: ['ACTIVE', 'INVITED'] } },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true,
      email: true,
      status: true,
      person: { select: { givenName: true, familyName: true, secondFamilyName: true } },
    },
  });

  return ok(
    filas
      // Nadie se nombra a sí mismo: la cuenta propia no aparece siquiera como
      // opción, para que la denegación no llegue después de escribir el motivo.
      .filter((fila) => fila.id !== actor.userId)
      .map((fila) => ({
        userId: fila.id,
        personName: [fila.person.givenName, fila.person.familyName, fila.person.secondFamilyName]
          .filter((parte) => parte !== null && parte !== '')
          .join(' '),
        maskedEmail: maskEmail(fila.email),
        status: fila.status,
      })),
  );
}
