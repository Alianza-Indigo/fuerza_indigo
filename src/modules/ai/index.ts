/** Interfaz pública de la administración de IA (PRD §15.3, Fase 8). */
export {
  createPrompt,
  saveDraftVersion,
  publishVersion,
  retirePrompt,
  revertToVersion,
  createPromptSchema,
  saveDraftSchema,
  publishVersionSchema,
  retirePromptSchema,
  revertSchema,
  type CreatePromptInput,
} from './application/prompts';
export { labRun, labRunSchema, type LabRunOutcome } from './application/lab';
export {
  registerSource,
  registerSourceSchema,
  indexSourceNow,
  disableSource,
  setVersionSources,
  setVersionSourcesSchema,
  retrieveForVersion,
  listSources,
  permissionOptions,
  type SourceListItem,
  type RetrievalResult,
} from './application/knowledge';
export {
  listPrompts,
  readPrompt,
  promptModels,
  type PromptListItem,
  type PromptDetail,
  type PromptVersionDetail,
} from './application/queries';
