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
export {
  assist,
  ASSISTED_USE_CASES,
  type AssistedUseCase,
  type AssistedUseCaseKey,
  type AssistInput,
  type AssistOutcome,
  type AssistResult,
  type AssistDegradation,
} from './application/assist';
export {
  reviewGeneration,
  reviewGenerationSchema,
  isGenerationAccepted,
  type ReviewGenerationInput,
  type GenerationReviewState,
} from './application/review';
