/** Interfaz pública del módulo de control de acceso. */
export {
  assignRole,
  revokeRole,
  expireDueRoleAssignments,
  assignRoleSchema,
  revokeRoleSchema,
  type AssignRoleInput,
} from './application/role-assignment';
