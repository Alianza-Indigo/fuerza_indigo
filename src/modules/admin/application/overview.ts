import { db } from '@/platform/db/client';

/**
 * Conteos agregados del sistema.
 *
 * Deliberadamente sin datos personales: son cifras de configuración y de
 * operación, que es lo único que la administración técnica necesita ver
 * (PRD §4.4).
 */
export interface SystemOverview {
  readonly legalEntities: number;
  readonly territorialUnits: number;
  readonly roles: number;
  readonly permissions: number;
  readonly activeUsers: number;
  readonly invitedUsers: number;
  readonly liveRoleAssignments: number;
  readonly auditEvents: number;
}

export async function systemOverview(): Promise<SystemOverview> {
  const now = new Date();
  const [legalEntities, territorialUnits, roles, permissions, activeUsers, invitedUsers, liveRoleAssignments, auditEvents] =
    await Promise.all([
      db().legalEntity.count(),
      db().territorialUnit.count(),
      db().role.count(),
      db().permission.count(),
      db().user.count({ where: { status: 'ACTIVE' } }),
      db().user.count({ where: { status: 'INVITED' } }),
      db().roleAssignment.count({
        where: { revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      }),
      db().auditEvent.count(),
    ]);

  return {
    legalEntities,
    territorialUnits,
    roles,
    permissions,
    activeUsers,
    invitedUsers,
    liveRoleAssignments,
    auditEvents,
  };
}
