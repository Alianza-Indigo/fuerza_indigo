import { createHash } from 'node:crypto';
import type { AiPurpose } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { resolveAiApiKey } from '@/platform/config/ai-key';
import { DEFAULT_TIME_ZONE, startOfDayInZone, todayInZone } from '@/platform/i18n';
import { logger } from '@/platform/observability/logger';
import { aiProvider, AiProviderTimeoutError } from './provider-port';
import { priceGenerationMinor } from './pricing';
import { validateAgainstSchema } from './output-schema';

/**
 * Servicio central de ejecución de la IA (PRD §15, §24 Fase 8; ADR-0137, ADR-0139).
 *
 * Es el **único** que invoca el puerto del proveedor, y por eso es el único sitio
 * donde caben las tres garantías del bloque:
 *
 *  1. **Degradación.** Con la IA apagada, sin clave, o con el proveedor caído, la
 *     aplicación sigue operando y el flujo cae al camino humano. No se prueba
 *     simulando una caída —eso mide el entorno, no la regla (ADR-0130)— sino
 *     contando llamadas: con la IA apagada, el puerto no se llama ninguna vez.
 *  2. **Límites antes de llamar.** Tokens por petición, peticiones por persona y
 *     día y costo mensual máximo. Los tres viven en la fila del proveedor —para
 *     bajarlos sin desplegar— y los tres niegan de verdad: cuando uno se alcanza,
 *     no se llama al proveedor.
 *  3. **Bitácora.** Cada llamada al proveedor deja una fila inmutable en
 *     `ai_generation`: la **huella** de lo enviado y nunca el texto, el modelo,
 *     los tokens, el costo, la latencia y el estado. La degradación y el corte por
 *     límite no dejan fila: no hubo ejecución que registrar, y una fila sin
 *     llamada ensuciaría los contadores que esas mismas filas alimentan.
 *
 * Lo que **no** vive aquí: la minimización y la redacción de lo que se envía
 * (bloque E), la resolución del prompt vigente y los casos de uso (bloques C y F).
 * Este servicio recibe el texto ya preparado y la versión de prompt ya elegida.
 */

export interface RunGenerationInput {
  /** Versión de prompt a ejecutar. Debe estar publicada (lo comprueba el servicio). */
  readonly promptVersionId: string;
  readonly purpose: AiPurpose;
  /** El texto a enviar, ya minimizado o redactado por quien llama (bloque E). */
  readonly userText: string;
  /** Si quien llama minimizó o redactó antes de enviar. Se registra tal cual. */
  readonly redactionApplied: boolean;
  /** Usuario que pide, para el límite por persona y para la atribución. Nulo en la orientación anónima. */
  readonly requestedById: string | null;
  /** Actor de auditoría que queda como autor de la fila. */
  readonly actorId: string;
  readonly conversationId?: string | null;
  /** Zona para las ventanas «por día» y «por mes». Por omisión, la de la organización. */
  readonly timeZone?: string;
}

export type DegradationReason = 'PROVIDER_DISABLED' | 'NO_API_KEY';
export type LimitReason = 'TOKENS_PER_REQUEST' | 'REQUESTS_PER_DAY' | 'MONTHLY_COST';

export type RunGenerationResult =
  | {
      readonly status: 'SUCCEEDED';
      readonly generationId: string;
      readonly output: string;
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly costMinor: bigint;
    }
  /** La IA no está disponible a propósito o por configuración: se toma el camino humano. */
  | { readonly status: 'DEGRADED'; readonly reason: DegradationReason }
  /** Un límite se alcanzó antes de llamar: no se llamó al proveedor. */
  | { readonly status: 'LIMIT_EXCEEDED'; readonly reason: LimitReason }
  /** Se llamó, la salida no encaja en el esquema y no se enseña. Queda registrada. */
  | { readonly status: 'SCHEMA_REJECTED'; readonly generationId: string }
  | { readonly status: 'PROVIDER_ERROR'; readonly generationId: string }
  | { readonly status: 'TIMEOUT'; readonly generationId: string };

/** Corte de espera por omisión. Una petición que tarda más cae al camino humano. */
const TIMEOUT_MS = 20_000;

/** Estimación de tokens de entrada por longitud, para el límite previo a la llamada.
 * No pretende ser exacta —el conteo real lo da el proveedor después— sino un techo
 * razonable: cuatro caracteres por token es la regla de dedo del proveedor. */
function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

/** Huella de lo enviado: sha256 en hexadecimal minúsculo, como exige la restricción de la base. */
function huella(model: string, systemText: string, userText: string): string {
  return createHash('sha256').update(`${model}\n\n${systemText}\n\n${userText}`).digest('hex');
}

function inicioDelDia(zona: string): Date {
  return startOfDayInZone(todayInZone(zona), zona) ?? new Date(0);
}

function inicioDelMes(zona: string): Date {
  const hoy = todayInZone(zona); // YYYY-MM-DD
  const primero = `${hoy.slice(0, 7)}-01`;
  return startOfDayInZone(primero, zona) ?? new Date(0);
}

/**
 * Ejecuta una generación con todas las defensas del bloque B.
 *
 * Nunca lanza por un estado de operación —IA apagada, sin clave, límite alcanzado,
 * proveedor caído—: devuelve un resultado que quien llama traduce al camino
 * humano. Lanza solo por un incumplimiento de precondición del propio programa:
 * una versión de prompt inexistente o sin publicar, que es un defecto de quien
 * llama y no una circunstancia de operación.
 */
export async function runGeneration(input: RunGenerationInput): Promise<RunGenerationResult> {
  const zona = input.timeZone ?? DEFAULT_TIME_ZONE;
  const cliente = db();

  const config = await cliente.aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: {
      isEnabled: true,
      apiKeyEnvVarName: true,
      maxTokensPerRequest: true,
      maxRequestsPerUserPerDay: true,
      maxMonthlyCostMinor: true,
      currency: true,
    },
  });

  // Sin fila de proveedor, o apagada: la IA no está. Es el estado por omisión de
  // una instalación nueva, no una avería.
  if (config === null || !config.isEnabled) {
    return { status: 'DEGRADED', reason: 'PROVIDER_DISABLED' };
  }

  const apiKey = resolveAiApiKey(config.apiKeyEnvVarName);
  if (apiKey === '') {
    return { status: 'DEGRADED', reason: 'NO_API_KEY' };
  }

  // La versión tiene que existir y estar publicada. Ejecutar un borrador o una
  // versión retirada es un defecto de quien llama, no una circunstancia: se
  // detiene en voz alta.
  const version = await cliente.aiPromptVersion.findUnique({
    where: { id: input.promptVersionId },
    select: {
      model: true,
      systemText: true,
      parameters: true,
      outputSchema: true,
      limits: true,
      status: true,
      prompt: { select: { isActive: true } },
    },
  });
  if (version === null || version.status !== 'PUBLISHED' || !version.prompt.isActive) {
    throw new Error(
      `No se puede ejecutar la versión de prompt ${input.promptVersionId}: no existe, no está publicada o su prompt está inactivo.`,
    );
  }

  const parametros = (version.parameters ?? {}) as { temperature?: number };
  const limitesVersion = (version.limits ?? {}) as { maxOutputTokens?: number };
  const temperature = typeof parametros.temperature === 'number' ? parametros.temperature : 0.2;
  const maxOutputTokens =
    typeof limitesVersion.maxOutputTokens === 'number' && limitesVersion.maxOutputTokens > 0
      ? limitesVersion.maxOutputTokens
      : 1024;

  /* ---------------------------------------------------------------------- */
  /* Límites, antes de llamar. Los tres niegan de verdad.                    */
  /* ---------------------------------------------------------------------- */

  // 1. Tokens por petición. Se estima la entrada y se suma el techo de salida:
  //    una petición que no cabría se rechaza antes de gastarla.
  const tokensEstimados = estimarTokens(version.systemText) + estimarTokens(input.userText) + maxOutputTokens;
  if (tokensEstimados > config.maxTokensPerRequest) {
    logger.warn('Generación de IA negada: excede el máximo de tokens por petición', {
      module: 'ai',
      context: { estimados: tokensEstimados, maximo: config.maxTokensPerRequest, purpose: input.purpose },
    });
    return { status: 'LIMIT_EXCEEDED', reason: 'TOKENS_PER_REQUEST' };
  }

  // 2. Peticiones por persona y día. Solo aplica cuando hay persona: la
  //    orientación anónima no tiene a quién contarle, y queda acotada por el
  //    costo mensual.
  if (input.requestedById !== null) {
    const delDia = await cliente.aiGeneration.count({
      where: { requestedById: input.requestedById, occurredAt: { gte: inicioDelDia(zona) } },
    });
    if (delDia >= config.maxRequestsPerUserPerDay) {
      logger.warn('Generación de IA negada: excede las peticiones por persona y día', {
        module: 'ai',
        context: { delDia, maximo: config.maxRequestsPerUserPerDay },
      });
      return { status: 'LIMIT_EXCEEDED', reason: 'REQUESTS_PER_DAY' };
    }
  }

  // 3. Costo mensual máximo. Se suma lo gastado en el mes y, si ya alcanzó el
  //    techo, no se empieza otra llamada. Puede rebasar por una llamada la línea
  //    —el costo real solo se conoce después—, y ese margen es el correcto: se
  //    corta al alcanzarlo, no al superarlo por mucho.
  const gastoDelMes = await cliente.aiGeneration.aggregate({
    _sum: { costMinor: true },
    where: { occurredAt: { gte: inicioDelMes(zona) } },
  });
  const gastado = gastoDelMes._sum.costMinor ?? 0n;
  if (gastado >= config.maxMonthlyCostMinor) {
    logger.warn('Generación de IA negada: alcanzado el costo mensual máximo', {
      module: 'ai',
      context: { gastado: gastado.toString(), techo: config.maxMonthlyCostMinor.toString() },
    });
    return { status: 'LIMIT_EXCEEDED', reason: 'MONTHLY_COST' };
  }

  /* ---------------------------------------------------------------------- */
  /* Llamada al proveedor, con su latencia y su bitácora.                    */
  /* ---------------------------------------------------------------------- */

  const digest = huella(version.model, version.systemText, input.userText);
  const comun = {
    conversationId: input.conversationId ?? null,
    promptVersionId: input.promptVersionId,
    model: version.model,
    requestedById: input.requestedById,
    purpose: input.purpose,
    inputDigest: digest,
    redactionApplied: input.redactionApplied,
    currency: config.currency,
    createdByActorId: input.actorId,
  };

  const inicio = Date.now();
  let salida: { text: string; promptTokens: number; completionTokens: number };
  try {
    salida = await aiProvider().generate({
      apiKey,
      model: version.model,
      systemText: version.systemText,
      userText: input.userText,
      temperature,
      maxOutputTokens,
      timeoutMs: TIMEOUT_MS,
    });
  } catch (error) {
    const latencyMs = Date.now() - inicio;
    const esTimeout = error instanceof AiProviderTimeoutError;
    // Una llamada que se intentó y falló sí es una ejecución: deja fila, con
    // costo cero y sin texto, porque el criterio de la fase pide poder consultar
    // los errores por módulo. Después se cae al camino humano.
    const fila = await cliente.aiGeneration.create({
      data: {
        ...comun,
        outputSummary: '',
        outputSchemaValid: false,
        promptTokens: 0,
        completionTokens: 0,
        costMinor: 0n,
        latencyMs,
        status: esTimeout ? 'TIMEOUT' : 'PROVIDER_ERROR',
      },
      select: { id: true },
    });
    logger.error('El proveedor de IA no completó la generación', {
      module: 'ai',
      outcome: 'failed',
      context: { motivo: esTimeout ? 'timeout' : 'error', latencyMs, purpose: input.purpose },
    });
    return esTimeout
      ? { status: 'TIMEOUT', generationId: fila.id }
      : { status: 'PROVIDER_ERROR', generationId: fila.id };
  }
  const latencyMs = Date.now() - inicio;

  // La forma se valida contra el esquema de la versión. Un JSON malformado es,
  // para este propósito, «no encaja»: no se enseña.
  let valorSalida: unknown = null;
  let jsonValido = true;
  try {
    valorSalida = JSON.parse(salida.text);
  } catch {
    jsonValido = false;
  }
  const validacion = jsonValido ? validateAgainstSchema(version.outputSchema, valorSalida) : { valid: false };
  const esquemaValido = validacion.valid;

  const costMinor = priceGenerationMinor({
    model: version.model,
    promptTokens: salida.promptTokens,
    completionTokens: salida.completionTokens,
    currency: config.currency,
  });

  const fila = await cliente.aiGeneration.create({
    data: {
      ...comun,
      // La salida se guarda solo si encaja: lo que se rechaza no se enseña ni se
      // conserva como si fuera un resultado.
      outputSummary: esquemaValido ? salida.text : '',
      outputSchemaValid: esquemaValido,
      promptTokens: salida.promptTokens,
      completionTokens: salida.completionTokens,
      costMinor,
      latencyMs,
      status: esquemaValido ? 'SUCCEEDED' : 'SCHEMA_REJECTED',
    },
    select: { id: true },
  });

  if (!esquemaValido) {
    logger.warn('La salida de la IA no encaja en el esquema de la versión: se rechaza', {
      module: 'ai',
      context: { purpose: input.purpose, generationId: fila.id },
    });
    return { status: 'SCHEMA_REJECTED', generationId: fila.id };
  }

  return {
    status: 'SUCCEEDED',
    generationId: fila.id,
    output: salida.text,
    promptTokens: salida.promptTokens,
    completionTokens: salida.completionTokens,
    costMinor,
  };
}

/* -------------------------------------------------------------------------- */
/* Salud                                                                      */
/* -------------------------------------------------------------------------- */

export type AiCapability = 'OPERATIONAL' | 'DEGRADED';

/**
 * Qué puede hacer la IA de verdad, para la verificación de salud. Como el correo
 * y el cobro: lo dice el estado real —encendida, con clave— y no una lista aparte
 * que se queda vieja.
 */
export async function aiCapability(): Promise<{ capability: AiCapability; detail: string }> {
  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { isEnabled: true, apiKeyEnvVarName: true, defaultModel: true },
  });

  if (config === null || !config.isEnabled) {
    return {
      capability: 'DEGRADED',
      detail: 'IA apagada: los flujos asistidos operan por el camino humano',
    };
  }
  if (resolveAiApiKey(config.apiKeyEnvVarName) === '') {
    return {
      capability: 'DEGRADED',
      detail: 'IA encendida sin clave configurada: opera por el camino humano hasta configurarla',
    };
  }
  return { capability: 'OPERATIONAL', detail: `IA operativa con Gemini (${config.defaultModel})` };
}
