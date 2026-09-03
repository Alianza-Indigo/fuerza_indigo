import type { Compartment, RoleCode } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import type { ActorContext, RoleAssignmentSnapshot } from '@/platform/kernel/actor-context';
import { publicContext } from '@/platform/kernel/actor-context';
import { resolveSession } from '@/platform/auth/session';
import { rootActorId } from '@/platform/auth/superadmin';

/**
 * Construye el contexto del actor a partir de la sesión (docs/ARCHITECTURE.md §6).
 *
 * Se resuelve una sola vez por petición. Solo se cargan **nombramientos
 * vigentes**: un cargo vencido deja de conceder acceso sin que nadie tenga que
 * ejecutar nada (PRD §4.3).
 */

export interface ResolveActorInput {
  readonly sessionToken: string | null;
  readonly rootSessionToken: string | null;
  readonly correlationId: string;
  readonly ipHash: string | null;
  readonly userAgentSummary: string | null;
}

/**
 * Compartimentos que concede cada rol.
 *
 * El actor raíz no aparece: su conjunto es vacío, y esa es la salvaguarda que
 * impide que una lectura de soporte alcance información clínica o disciplinaria
 * (docs/PERMISSIONS.md §5.1).
 */
const ROLE_COMPARTMENTS: Partial<Record<RoleCode, Compartment[]>> = {
  EXECUTIVE_SECRETARY: ['UNION', 'SOCIAL', 'DISCIPLINARY'],
  OVERSIGHT_COMMISSION: ['UNION', 'DISCIPLINARY'],
  TERRITORIAL_DELEGATE: ['UNION'],
  SOCIAL_STAFF: ['SOCIAL'],
  CIAN_PROFESSIONAL: ['CLINICAL'],
  CIAN_COORDINATION: ['CLINICAL'],
  UNION_MEMBER: ['UNION'],
};

export async function resolveActor(input: ResolveActorInput): Promise<ActorContext> {
  const base = publicContext(input.correlationId);

  // 1. Sesión del Superadmin raíz. Es independiente de la sesión ordinaria y
  //    tiene su propia cookie, su propia vigencia y su propio ciclo de vida.
  if (input.rootSessionToken !== null) {
    const rootSession = await resolveSession(input.rootSessionToken);
    if (rootSession !== null && rootSession.actorKind === 'ROOT_SUPERADMIN') {
      return {
        ...base,
        actorId: await rootActorId(),
        actorKind: 'ROOT_SUPERADMIN',
        sessionId: rootSession.sessionId,
        // Conjunto vacío a propósito.
        compartments: new Set<Compartment>(),
        ipHash: input.ipHash,
        userAgentSummary: input.userAgentSummary,
      };
    }
  }

  // 2. Sesión ordinaria.
  if (input.sessionToken === null) return base;
  const session = await resolveSession(input.sessionToken);
  if (session === null || session.userId === null) return base;

  const user = await db().user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      personId: true,
      actor: { select: { id: true } },
      person: { select: { locale: true, timeZone: true } },
    },
  });
  if (user === null || user.actor === null) return base;

  const now = new Date();
  const assignments = await db().roleAssignment.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: {
      id: true,
      legalEntityId: true,
      organizationId: true,
      startsAt: true,
      endsAt: true,
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
      territorialScopes: {
        select: {
          territorialUnitId: true,
          includesDescendants: true,
          territorialUnit: { select: { path: true } },
        },
      },
    },
  });

  const roles: RoleAssignmentSnapshot[] = assignments.map((assignment) => ({
    assignmentId: assignment.id,
    role: assignment.role.code,
    permissions: new Set(assignment.role.permissions.map((link) => link.permission.code)),
    legalEntityId: assignment.legalEntityId,
    organizationId: assignment.organizationId,
    territories: assignment.territorialScopes.map((scope) => ({
      territorialUnitId: scope.territorialUnitId,
      path: scope.territorialUnit.path,
      includesDescendants: scope.includesDescendants,
    })),
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  }));

  const compartments = new Set<Compartment>();
  for (const assignment of roles) {
    for (const compartment of ROLE_COMPARTMENTS[assignment.role] ?? []) compartments.add(compartment);
  }

  const legalEntityScope = [
    ...new Set(roles.map((role) => role.legalEntityId).filter((id): id is string => id !== null)),
  ];

  return {
    ...base,
    actorId: user.actor.id,
    actorKind: 'PERSON',
    userId: user.id,
    personId: user.personId,
    sessionId: session.sessionId,
    roles,
    legalEntityScope,
    compartments,
    ipHash: input.ipHash,
    userAgentSummary: input.userAgentSummary,
    locale: user.person.locale,
    timeZone: user.person.timeZone,
  };
}
