/** Interfaz pública del módulo de control de acceso. */
export {
  assignRole,
  revokeRole,
  expireDueRoleAssignments,
  assignRoleSchema,
  revokeRoleSchema,
  type AssignRoleInput,
} from './application/role-assignment';
export {
  assignableRoles,
  liveAssignments,
  territoryOptions,
  accountsForAppointment,
  type RoleOption,
  type AssignmentView,
  type TerritoryOption,
  type AdministrableAccount,
} from './application/role-catalog';
