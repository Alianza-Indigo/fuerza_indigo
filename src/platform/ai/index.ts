/** Interfaz pública de la IA gobernada (PRD §15, Fase 8). */
export {
  runGeneration,
  runLabGeneration,
  aiCapability,
  type RunGenerationInput,
  type RunGenerationResult,
  type DegradationReason,
  type LimitReason,
  type AiCapability,
} from './ai-service';
export {
  aiProvider,
  setAiProviderForTests,
  AiProviderTimeoutError,
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
  type AiProviderPort,
  type AiGenerateInput,
  type AiGenerateOutput,
  type AiEmbedInput,
} from './provider-port';
export { validateAgainstSchema, unsupportedKeywords, type SchemaValidation } from './output-schema';
export { priceGenerationMinor, AI_PRICE_CURRENCY } from './pricing';
export {
  chunkMarkdown,
  indexSource,
  retrieveChunks,
  markStaleIfChanged,
  type Chunk,
  type IndexOutcome,
  type RetrievedChunk,
  type RetrieveOutcome,
} from './knowledge';
