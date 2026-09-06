/** Interfaz pública del módulo disciplinario (PRD §9.8). */
export {
  openDisciplinaryCase,
  notifyDisciplinaryCase,
  recordHearing,
  offerEvidence,
  assessEvidence,
  evidenceList,
  openDisciplinaryCaseSchema,
  notifyCaseSchema,
  recordHearingSchema,
  offerEvidenceSchema,
  assessEvidenceSchema,
  conflictCheckSchema,
  type OpenDisciplinaryCaseInput,
  type OfferEvidenceInput,
  type EvidenceFile,
  type ConflictCheck,
  type EvidenceRow,
} from './application/cases';

export {
  issueDisciplinaryDecision,
  fileAppeal,
  resolveAppeal,
  disciplinaryCaseList,
  issueDecisionSchema,
  fileAppealSchema,
  resolveAppealSchema,
  type IssueDecisionInput,
  type DisciplinaryCaseRow,
} from './application/decisions';
