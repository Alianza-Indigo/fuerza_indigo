/** Interfaz pública del módulo de defensa, casos y atención social (PRD §10). */
export { openCase, openCaseSchema, type OpenCaseInput } from './application/cases';
export { assessCase, assessCaseSchema, type AssessCaseInput } from './application/assessment';
export {
  caseList,
  caseDetail,
  type CaseRow,
  type CaseDetail,
} from './application/reading';
