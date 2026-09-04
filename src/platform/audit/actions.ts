/**
 * Catálogo cerrado de acciones auditables (PRD §20.4, docs/SECURITY.md §6).
 *
 * Es cerrado a propósito: una acción que no está aquí no puede auditarse, y una
 * acción crítica que no puede auditarse no debe existir. Cada fase añade las
 * suyas al habilitar su módulo.
 */
export const AUDIT_ACTIONS = {
  // Identidad y acceso — Fase 1
  PERSON_CREATED: 'identity.person.created',
  PERSON_UPDATED: 'identity.person.updated',
  PERSON_MERGED: 'identity.person.merged',
  USER_INVITED: 'identity.user.invited',
  USER_ACTIVATED: 'identity.user.activated',
  USER_DISABLED: 'identity.user.disabled',
  PASSWORD_CHANGED: 'identity.user.password_changed',
  SESSION_REVOKED: 'identity.session.revoked',
  ALL_SESSIONS_REVOKED: 'identity.session.revoked_all',

  ROLE_GRANTED: 'access.role.granted',
  ROLE_REVOKED: 'access.role.revoked',
  ROLE_EXPIRED: 'access.role.expired',

  LEGAL_ENTITY_CREATED: 'institution.legal_entity.created',
  LEGAL_ENTITY_UPDATED: 'institution.legal_entity.updated',
  TERRITORIAL_UNIT_CREATED: 'institution.territorial_unit.created',
  TERRITORIAL_UNIT_UPDATED: 'institution.territorial_unit.updated',
  NORMATIVE_RULES_PUBLISHED: 'institution.normative_rules.published',

  CONSENT_GRANTED: 'consent.granted',
  CONSENT_REVOKED: 'consent.revoked',

  FILE_UPLOADED: 'files.file.uploaded',
  FILE_DOWNLOAD_AUTHORIZED: 'files.file.download_authorized',
  FILE_DELETED: 'files.file.deleted',
  RETENTION_APPLIED: 'files.retention.applied',
  LEGAL_HOLD_PLACED: 'files.legal_hold.placed',
  LEGAL_HOLD_RELEASED: 'files.legal_hold.released',

  CONTENT_DRAFTED: 'content.page.drafted',
  CONTENT_SUBMITTED: 'content.page.submitted_for_review',
  CONTENT_RETURNED: 'content.page.returned_to_author',
  CONTENT_APPROVED: 'content.page.approved',
  CONTENT_SCHEDULED: 'content.page.scheduled',
  CONTENT_PUBLISHED: 'content.page.published',
  CONTENT_ARCHIVED: 'content.page.archived',
  CONTENT_REVERTED: 'content.page.reverted',
  CONTENT_REDIRECT_CREATED: 'content.redirect.created',
  CONTENT_REDIRECT_DELETED: 'content.redirect.deleted',

  AUDIT_EXPORTED: 'audit.exported',
  SUPERADMIN_ACTION: 'system.superadmin.action',
  MODULE_CONFIGURED: 'system.module.configured',
  JOB_MANAGED: 'system.job.managed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const KNOWN = new Set<string>(Object.values(AUDIT_ACTIONS));

export function isKnownAuditAction(value: string): value is AuditAction {
  return KNOWN.has(value);
}
