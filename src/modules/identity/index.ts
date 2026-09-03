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
