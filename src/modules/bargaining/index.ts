/** Interfaz pública del módulo de negociación colectiva y cumplimiento (PRD §9.7). */
export {
  openBargainingFile,
  assignBargainingCommissionMember,
  addProposal,
  openConsultation,
  advanceBargainingFile,
  bargainingFileList,
  proposalList,
  openBargainingFileSchema,
  assignBargainingCommissionSchema,
  addProposalSchema,
  openConsultationSchema,
  advanceBargainingSchema,
  type OpenBargainingFileInput,
  type AddProposalInput,
  type OpenConsultationInput,
  type BargainingFileRow,
  type ProposalRow,
} from './application/files';

export {
  openObligation,
  advanceObligation,
  obligationList,
  openObligationSchema,
  advanceObligationSchema,
  type OpenObligationInput,
  type AdvanceObligationInput,
  type ObligationEvidence,
  type ObligationRow,
} from './application/compliance';
