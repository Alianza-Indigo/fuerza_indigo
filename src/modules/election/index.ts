/** Interfaz pública del módulo electoral (PRD §9.6). */
export {
  createElection,
  assignCommissionMember,
  issueElectionCall,
  advanceElection,
  electionList,
  electionDetail,
  createElectionSchema,
  assignCommissionSchema,
  issueElectionCallSchema,
  advanceElectionSchema,
  etapaSchema,
  NOMBRE_DE_ETAPA,
  type CreateElectionInput,
  type AssignCommissionInput,
  type EtapaElectoral,
  type ElectionRow,
  type ElectionDetail,
} from './application/elections';

export {
  registerSlate,
  decideSlate,
  slateList,
  registerSlateSchema,
  decideSlateSchema,
  slateMemberSchema,
  type RegisterSlateInput,
  type DecideSlateInput,
  type RegisteredSlate,
  type SlateRow,
} from './application/slates';

export {
  openIncident,
  resolveIncident,
  incidentList,
  openIncidentSchema,
  resolveIncidentSchema,
  type OpenIncidentInput,
  type IncidentEvidence,
  type IncidentRow,
} from './application/incidents';

export {
  publishElectoralRoll,
  exportElectionEvidence,
  publishElectoralRollSchema,
  exportElectionEvidenceSchema,
  type ElectionEvidence,
} from './application/evidence';
