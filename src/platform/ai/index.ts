/** Interfaz pública de la IA gobernada (PRD §15, Fase 8). */
export {
  runGeneration,
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
  type AiProviderPort,
  type AiGenerateInput,
  type AiGenerateOutput,
} from './provider-port';
export { validateAgainstSchema, unsupportedKeywords, type SchemaValidation } from './output-schema';
export { priceGenerationMinor, AI_PRICE_CURRENCY } from './pricing';
