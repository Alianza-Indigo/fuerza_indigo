/** Interfaz pública del módulo de defensa, casos y atención social (PRD §10). */
export { openCase, openCaseSchema, type OpenCaseInput } from './application/cases';
export { assessCase, assessCaseSchema, type AssessCaseInput } from './application/assessment';
export {
  addParticipant,
  removeParticipant,
  addParticipantSchema,
  removeParticipantSchema,
  type AddParticipantInput,
  type RemoveParticipantInput,
} from './application/participants';
export {
  assignCase,
  unassignCase,
  assignableUsers,
  assignCaseSchema,
  unassignCaseSchema,
  type AssignCaseInput,
  type UnassignCaseInput,
  type Candidatura,
} from './application/assign';
export {
  createTask,
  advanceTask,
  assignTask,
  createTaskSchema,
  advanceTaskSchema,
  assignTaskSchema,
  type CreateTaskInput,
  type AdvanceTaskInput,
  type AssignTaskInput,
} from './application/tasks';
export {
  sendMessage,
  editMessage,
  sendMessageSchema,
  editMessageSchema,
  type SendMessageInput,
  type EditMessageInput,
} from './application/messages';
export { peopleForCase, type Opcion } from './application/options';
export {
  caseList,
  caseDetail,
  type CaseRow,
  type CaseDetail,
} from './application/reading';
