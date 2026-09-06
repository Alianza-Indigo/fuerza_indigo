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
  USER_REENABLED: 'identity.user.reenabled',
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
  TERRITORIAL_UNIT_DISSOLVED: 'institution.territorial_unit.dissolved',
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
  /** Confirmación humana de la canalización propuesta (PRD §10.1, Fase 6). */
  SUPPORT_ROUTING_CONFIRMED: 'support.routing.confirmed',

  // Defensa, casos y atención social — Fase 6. El expediente lleva su propia
  // bitácora legible (`CaseEvent`), que no sustituye a esta: aquella cuenta el
  // asunto a quien lo lleva, esta registra el acto para quien audita.
  CASE_OPENED: 'cases.case.opened',
  CASE_ASSESSED: 'cases.case.assessed',
  CASE_ASSIGNED: 'cases.case.assigned',
  CASE_UNASSIGNED: 'cases.case.unassigned',
  CASE_STATUS_CHANGED: 'cases.case.status_changed',
  CASE_CLOSED: 'cases.case.closed',
  CASE_REOPENED: 'cases.case.reopened',
  CASE_READ: 'cases.case.read',

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

  // Afiliación, padrones, directorios y credenciales — Fase 4. Todo cambio de
  // estado deja motivo, actor y fecha (PRD §3.6).
  MEMBERSHIP_TYPE_CREATED: 'membership.type.created',
  MEMBERSHIP_TYPE_UPDATED: 'membership.type.updated',
  APPLICATION_STARTED: 'membership.application.started',
  APPLICATION_SUBMITTED: 'membership.application.submitted',
  APPLICATION_WITHDRAWN: 'membership.application.withdrawn',
  APPLICATION_ASSIGNED: 'membership.application.assigned',
  APPLICATION_CLARIFICATION_REQUESTED: 'membership.application.clarification_requested',
  APPLICATION_CLARIFIED: 'membership.application.clarified',
  APPLICATION_DOCUMENT_ADDED: 'membership.application.document_added',
  APPLICATION_DOCUMENT_REVIEWED: 'membership.application.document_reviewed',
  APPLICATION_APPROVED: 'membership.application.approved',
  APPLICATION_REJECTED: 'membership.application.rejected',
  MEMBERSHIP_ACTIVATED: 'membership.record.activated',
  MEMBERSHIP_SUSPENDED: 'membership.record.suspended',
  MEMBERSHIP_REINSTATED: 'membership.record.reinstated',
  MEMBERSHIP_EXPIRED: 'membership.record.expired',
  MEMBERSHIP_TERMINATED: 'membership.record.terminated',
  MEMBERSHIP_RENEWED: 'membership.record.renewed',
  BENEFICIARY_REGISTERED: 'membership.beneficiary.registered',
  BENEFICIARY_UPDATED: 'membership.beneficiary.updated',
  BENEFICIARY_CLOSED: 'membership.beneficiary.closed',
  /**
   * Abrir el expediente de una atención con privacidad reforzada.
   *
   * Se registra la lectura, no solo la escritura: eso es lo que «controles
   * reforzados de privacidad» (PRD §3.4) significa en concreto. Quien contó algo
   * de su vida tiene derecho a saber quién lo ha leído; sin este asiento, esa
   * pregunta no tiene respuesta.
   */
  BENEFICIARY_FILE_READ: 'membership.beneficiary.file_read',
  CARE_RELATIONSHIP_REGISTERED: 'membership.relationship.registered',
  CARE_RELATIONSHIP_REVOKED: 'membership.relationship.revoked',
  ROSTER_READ: 'membership.roster.read',
  ROSTER_EXPORTED: 'membership.roster.exported',
  /** Nació la obligación de informar un alta o una baja (PRD §8.1 paso 14). */
  AUTHORITY_FILING_OPENED: 'membership.authority_filing.opened',
  /** Avanzó el trámite ante la autoridad laboral: preparado, presentado, acusado. */
  AUTHORITY_FILING_ADVANCED: 'membership.authority_filing.advanced',
  DIRECTORY_READ: 'directory.internal.read',
  DIRECTORY_EXPORTED: 'directory.internal.exported',
  DIRECTORY_PREFERENCE_GRANTED: 'directory.preference.granted',
  DIRECTORY_PREFERENCE_REVOKED: 'directory.preference.revoked',
  DIRECTORY_PUBLISHED: 'directory.publication.published',
  DIRECTORY_WITHDRAWN: 'directory.publication.withdrawn',
  CREDENTIAL_ISSUED: 'credentialing.credential.issued',
  CREDENTIAL_REVOKED: 'credentialing.credential.revoked',
  CREDENTIAL_REPLACED: 'credentialing.credential.replaced',
  CREDENTIAL_DOWNLOADED: 'credentialing.credential.downloaded',
  CONSENT_VERSION_DRAFTED: 'consent.version.drafted',
  CONSENT_VERSION_PUBLISHED: 'consent.version.published',
  CONSENT_VERSION_RETIRED: 'consent.version.retired',

  // Vida institucional — Fase 5
  UNION_BODY_CREATED: 'governance.body.created',
  UNION_BODY_UPDATED: 'governance.body.updated',
  OFFICE_DEFINED: 'governance.office.defined',
  OFFICE_APPOINTED: 'governance.office.appointed',
  OFFICE_ENDED: 'governance.office.ended',
  OFFICE_EXPIRED: 'governance.office.expired',
  POWER_GRANTED: 'governance.power.granted',
  POWER_REVOKED: 'governance.power.revoked',
  NORMATIVE_RULES_DRAFTED: 'governance.rules.drafted',

  ASSEMBLY_CONVENED: 'assembly.assembly.convened',
  ASSEMBLY_SECOND_CALL: 'assembly.assembly.second_call',
  ASSEMBLY_CANCELLED: 'assembly.assembly.cancelled',
  AGENDA_ITEM_ADDED: 'assembly.agenda.item_added',
  AGENDA_ITEM_UPDATED: 'assembly.agenda.item_updated',
  ROSTER_FROZEN: 'assembly.roster.frozen',
  ATTENDANCE_REGISTERED: 'assembly.attendance.registered',
  QUORUM_DECLARED: 'assembly.quorum.declared',
  ASSEMBLY_CLOSED: 'assembly.assembly.closed',
  RESOLUTION_RECORDED: 'assembly.resolution.recorded',
  RESOLUTION_FOLLOW_UP_UPDATED: 'assembly.resolution.follow_up_updated',
  MINUTES_PUBLISHED: 'assembly.minutes.published',

  VOTE_PROCESS_SCHEDULED: 'voting.process.scheduled',
  VOTE_PROCESS_OPENED: 'voting.process.opened',
  VOTE_PROCESS_CLOSED: 'voting.process.closed',
  VOTE_CREDENTIAL_ISSUED: 'voting.credential.issued',
  VOTE_TALLIED: 'voting.tally.run',
  VOTE_CERTIFIED: 'voting.tally.certified',
  VOTE_ANNULLED: 'voting.process.annulled',

  ELECTION_CREATED: 'election.election.created',
  ELECTION_ADVANCED: 'election.election.advanced',
  ELECTION_COMMISSION_ASSIGNED: 'election.commission.assigned',
  ELECTION_CALL_ISSUED: 'election.election.call_issued',
  ELECTORAL_ROSTER_PUBLISHED: 'election.roster.published',
  SLATE_REGISTERED: 'election.slate.registered',
  SLATE_VALIDATED: 'election.slate.validated',
  SLATE_REJECTED: 'election.slate.rejected',
  ELECTION_INCIDENT_OPENED: 'election.incident.opened',
  ELECTION_INCIDENT_RESOLVED: 'election.incident.resolved',
  ELECTION_EVIDENCE_EXPORTED: 'election.evidence.exported',

  BARGAINING_FILE_OPENED: 'bargaining.file.opened',
  BARGAINING_FILE_ADVANCED: 'bargaining.file.advanced',
  BARGAINING_PROPOSAL_ADDED: 'bargaining.proposal.added',
  BARGAINING_COMMISSION_ASSIGNED: 'bargaining.commission.assigned',
  BARGAINING_CONSULTATION_OPENED: 'bargaining.consultation.opened',
  STRIKE_PROCEDURE_OPENED: 'bargaining.strike.opened',

  DISCIPLINARY_CASE_OPENED: 'discipline.case.opened',
  DISCIPLINARY_NOTIFIED: 'discipline.case.notified',
  DISCIPLINARY_HEARING_SCHEDULED: 'discipline.case.hearing_scheduled',
  DISCIPLINARY_HEARING_HELD: 'discipline.case.hearing_held',
  DISCIPLINARY_EVIDENCE_OFFERED: 'discipline.evidence.offered',
  DISCIPLINARY_EVIDENCE_ASSESSED: 'discipline.evidence.assessed',
  DISCIPLINARY_DECIDED: 'discipline.decision.issued',
  DISCIPLINARY_APPEAL_FILED: 'discipline.appeal.filed',
  DISCIPLINARY_APPEAL_RESOLVED: 'discipline.appeal.resolved',
  DISCIPLINARY_RIGHTS_RESTORED: 'discipline.rights.restored',

  OBLIGATION_OPENED: 'compliance.obligation.opened',
  OBLIGATION_ADVANCED: 'compliance.obligation.advanced',

  DOCUMENT_TEMPLATE_DRAFTED: 'documents.template.drafted',
  DOCUMENT_TEMPLATE_PUBLISHED: 'documents.template.published',
  DOCUMENT_TEMPLATE_RETIRED: 'documents.template.retired',
  DOCUMENT_ISSUED: 'documents.document.issued',
  DOCUMENT_CANCELLED: 'documents.document.cancelled',
  DOCUMENT_SIGNED: 'documents.document.signed',

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
