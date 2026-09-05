/** Interfaz pública del módulo de asambleas (PRD §9.4, §9.5). */
export {
  conveneAssembly,
  issueCall,
  addAgendaItem,
  attachAgendaDocument,
  assemblyList,
  agendaItems,
  conveneAssemblySchema,
  issueCallSchema,
  addAgendaItemSchema,
  attachAgendaDocumentSchema,
  type ConveneAssemblyInput,
  type IssueCallInput,
  type AddAgendaItemInput,
  type AssemblyRow,
  type AgendaItemRow,
} from './application/assemblies';

export {
  freezeRoster,
  rosterPreview,
  frozenRoster,
  huellaDePadron,
  freezeRosterSchema,
  type FrozenRoster,
  type RosterPreview,
  type RosterView,
  type RosterEntryShape,
  type RosterCriteria,
} from './application/roster';

export {
  registerAttendance,
  computeQuorum,
  declareQuorum,
  attendanceList,
  registerAttendanceSchema,
  declareQuorumSchema,
  type RegisterAttendanceInput,
  type AttendanceResult,
  type AttendanceRow,
  type QuorumComputation,
  type QuorumDeclaration,
} from './application/attendance';

export {
  recordResolution,
  publishMinutes,
  updateFollowUp,
  resolutionList,
  recordResolutionSchema,
  publishMinutesSchema,
  updateFollowUpSchema,
  type RecordResolutionInput,
  type RecordedResolution,
  type PublishMinutesInput,
  type UpdateFollowUpInput,
  type ResolutionRow,
} from './application/resolutions';
