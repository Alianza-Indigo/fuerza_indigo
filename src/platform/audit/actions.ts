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

  // Entrada única de ayuda — Fase 2. El envío no se audita: quien escribe no
  // ejecuta un acto institucional, y la fila con su fecha ya es el registro. Lo
  // que sí es acto de la organización es leer lo que alguien contó y hacerse
  // cargo de ello.
  SUPPORT_REQUEST_READ: 'support.request.read',
  SUPPORT_REQUEST_HANDLED: 'support.request.handled',
  SUPPORT_REQUEST_DISCARDED: 'support.request.discarded',

  // Finanzas — Fase 3. Todo lo que mueve dinero o el libro deja rastro.
  CATALOG_PRODUCT_CREATED: 'billing.catalog.product_created',
  CATALOG_PRODUCT_UPDATED: 'billing.catalog.product_updated',
  CATALOG_PRICE_CREATED: 'billing.catalog.price_created',
  CHECKOUT_STARTED: 'billing.checkout.started',
  PAYMENT_SUCCEEDED: 'billing.payment.succeeded',
  PAYMENT_FAILED: 'billing.payment.failed',
  PAYMENT_DISPUTED: 'billing.payment.disputed',
  MANUAL_PAYMENT_REGISTERED: 'billing.payment.manual_registered',
  MANUAL_PAYMENT_APPROVED: 'billing.payment.manual_approved',
  MANUAL_PAYMENT_REJECTED: 'billing.payment.manual_rejected',
  REFUND_REQUESTED: 'billing.refund.requested',
  REFUND_APPROVED: 'billing.refund.approved',
  REFUND_REJECTED: 'billing.refund.rejected',
  REFUND_SUCCEEDED: 'billing.refund.succeeded',
  DISCOUNT_GRANTED: 'billing.discount.granted',
  DISCOUNT_REVOKED: 'billing.discount.revoked',
  SCHOLARSHIP_APPROVED: 'billing.scholarship.approved',
  SCHOLARSHIP_REVOKED: 'billing.scholarship.revoked',
  LEDGER_ENTRY_POSTED: 'billing.ledger.entry_posted',
  LEDGER_ADJUSTMENT_POSTED: 'billing.ledger.adjustment_posted',
  LEDGER_ENTRY_REVERSED: 'billing.ledger.entry_reversed',
  RECONCILIATION_OPENED: 'billing.reconciliation.opened',
  RECONCILIATION_CLOSED: 'billing.reconciliation.closed',
  ASSET_REGISTERED: 'billing.asset.registered',
  ASSET_MOVED: 'billing.asset.moved',
  FINANCIAL_REPORT_EXPORTED: 'billing.report.exported',
  SUBSCRIPTION_ACTIVATED: 'billing.subscription.activated',
  SUBSCRIPTION_CANCELED: 'billing.subscription.canceled',

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
