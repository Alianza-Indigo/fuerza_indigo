/**
 * Interfaz pública del módulo de identidad.
 *
 * Ningún otro módulo importa los archivos internos: el linter lo impide
 * (ADR-0006). Lo que no se exporta aquí, no existe fuera del módulo.
 */
export { login, loginSchema, type LoginInput, type LoginContext } from './application/login';
export {
  requestPasswordReset,
  completePasswordReset,
  requestResetSchema,
  completeResetSchema,
} from './application/password-reset';
export {
  inviteUser,
  activateAccount,
  inviteSchema,
  activateSchema,
  type InviteInput,
  type InviteResult,
} from './application/invitations';
export {
  myActiveSessions,
  closeOwnSession,
  closeOtherSessions,
  logout,
} from './application/sessions';
export {
  registerPerson,
  updatePerson,
  mergePeople,
  findDuplicates,
  personRecord,
  searchPeople,
  registerPersonSchema,
  updatePersonSchema,
  mergePeopleSchema,
  type RegisterPersonInput,
  type UpdatePersonInput,
  type MergePeopleInput,
  type RegisteredPerson,
  type DuplicateCandidate,
  type MergeResult,
  type PersonRecord,
  type PersonSummary,
} from './application/person-registry';
export {
  disableAccount,
  reenableAccount,
  disableAccountSchema,
  reenableAccountSchema,
  type DisableAccountInput,
  type ReenableAccountInput,
  type AccountChange,
} from './application/account-lifecycle';
