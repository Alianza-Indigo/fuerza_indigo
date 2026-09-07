'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  configureProvider,
  createPrompt,
  labRun,
  publishVersion,
  retirePrompt,
  retrieveForVersion,
  revertToVersion,
  saveDraftVersion,
  setVersionSources,
  type LabRunOutcome,
  type RetrievalResult,
} from '@/modules/ai';
import { currentActor } from '@/platform/http/request-context';
import { checkboxField, textField } from '@/platform/http/form-fields';

/**
 * Acciones del panel de prompts.
 *
 * Cada una traduce el formulario al caso de uso y devuelve el error tal como
 * llega. Quién puede publicar, si quien redacta se está firmando a sí mismo o si
 * el modelo está permitido lo decide el módulo, que es donde está probado.
 */

export interface PromptFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

function fallo(error: { message: string; details?: Record<string, string[]> | undefined }): PromptFormState {
  return {
    status: 'error',
    message: error.message,
    ...(error.details === undefined ? {} : { fieldErrors: error.details }),
  };
}

/** Convierte un JSON de un área de texto en objeto, o deja un error en su campo. */
function parseJsonField(
  formData: FormData,
  name: string,
  errores: Record<string, string[]>,
): Record<string, unknown> {
  const bruto = textField(formData, name).trim();
  if (bruto === '') return {};
  try {
    const valor: unknown = JSON.parse(bruto);
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      (errores[name] ??= []).push('Tiene que ser un objeto JSON, por ejemplo {}.');
      return {};
    }
    return valor as Record<string, unknown>;
  } catch {
    (errores[name] ??= []).push('No es JSON válido. Revisa las comillas y las llaves.');
    return {};
  }
}

/** Lista de variables separadas por comas o saltos de línea. */
function parseVariables(formData: FormData): string[] {
  return textField(formData, 'allowedVariables')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

function contenidoDeVersion(formData: FormData): {
  contenido: {
    systemText: string;
    allowedVariables: string[];
    model: string;
    parameters: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    limits: Record<string, unknown>;
  };
  errores: Record<string, string[]>;
} {
  const errores: Record<string, string[]> = {};
  const contenido = {
    systemText: textField(formData, 'systemText'),
    allowedVariables: parseVariables(formData),
    model: textField(formData, 'model'),
    parameters: parseJsonField(formData, 'parameters', errores),
    outputSchema: parseJsonField(formData, 'outputSchema', errores),
    limits: parseJsonField(formData, 'limits', errores),
  };
  return { contenido, errores };
}

export async function createPromptAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const { contenido, errores } = contenidoDeVersion(formData);
  if (Object.keys(errores).length > 0) return { status: 'error', message: 'Revisa los datos marcados.', fieldErrors: errores };

  const resultado = await createPrompt(actor, {
    code: textField(formData, 'code'),
    purpose: textField(formData, 'purpose'),
    module: textField(formData, 'module'),
    criticality: (textField(formData, 'criticality') || 'STANDARD') as 'STANDARD' | 'CRITICAL',
    ...contenido,
  });

  if (!resultado.ok) return fallo(resultado.error);
  redirect(`/gestion/ia/${resultado.data.promptId}`);
}

export async function saveDraftAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const { contenido, errores } = contenidoDeVersion(formData);
  if (Object.keys(errores).length > 0) return { status: 'error', message: 'Revisa los datos marcados.', fieldErrors: errores };

  const resultado = await saveDraftVersion(actor, { promptId, ...contenido });
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', message: `Guardado como versión ${resultado.data.version}, en borrador. Pruébala y pídela publicar.` };
}

export async function publishAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const resultado = await publishVersion(actor, {
    versionId: textField(formData, 'versionId'),
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', message: `Publicada la versión ${resultado.data.version}. Es la que se ejecuta a partir de ahora.` };
}

export async function retireAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const resultado = await retirePrompt(actor, { promptId, reason: textField(formData, 'reason') });
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', message: 'Retirado. El prompt deja de ejecutarse y sus flujos caen al camino humano.' };
}

export async function revertAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const resultado = await revertToVersion(actor, {
    promptId,
    versionId: textField(formData, 'versionId'),
    reason: textField(formData, 'reason'),
  });
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', message: `Se creó la versión ${resultado.data.version} con el contenido anterior, en borrador. Publícala cuando quieras.` };
}

export async function setSourcesAction(_previo: PromptFormState, formData: FormData): Promise<PromptFormState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const sourceIds = formData.getAll('sourceIds').filter((v): v is string => typeof v === 'string');
  const resultado = await setVersionSources(actor, { promptVersionId: textField(formData, 'promptVersionId'), sourceIds });
  if (!resultado.ok) return fallo(resultado.error);
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', message: `La versión consultará ${resultado.data.count} fuente(s).` };
}

export interface RetrievalState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly result?: RetrievalResult;
}

export async function retrievalTestAction(_previo: RetrievalState, formData: FormData): Promise<RetrievalState> {
  const actor = await currentActor();
  const resultado = await retrieveForVersion(actor, {
    promptVersionId: textField(formData, 'promptVersionId'),
    queryText: textField(formData, 'queryText'),
    limit: 8,
  });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  return { status: 'ok', result: resultado.data };
}

export interface LabState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly outcome?: LabRunOutcome;
}

export async function labRunAction(_previo: LabState, formData: FormData): Promise<LabState> {
  const actor = await currentActor();
  const promptId = textField(formData, 'promptId');
  const resultado = await labRun(actor, {
    promptVersionId: textField(formData, 'promptVersionId'),
    purpose: textField(formData, 'purpose') as never,
    userText: textField(formData, 'userText'),
  });
  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }
  revalidatePath(`/gestion/ia/${promptId}`);
  return { status: 'ok', outcome: resultado.data };
}

/* -------------------------------------------------------------------------- */
/* Gobernanza del proveedor (bloque G)                                        */
/* -------------------------------------------------------------------------- */

export interface ProviderFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/** Convierte pesos con hasta dos decimales a centavos. `null` si no es un importe. */
function pesosACentavos(bruto: string): bigint | null {
  const t = bruto.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [entera = '0', decimal = ''] = t.split('.');
  return BigInt(entera) * 100n + BigInt((decimal + '00').slice(0, 2));
}

/** Un entero positivo de un campo de texto, o `null`. */
function enteroPositivo(bruto: string): number | null {
  const t = bruto.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/**
 * Configura el proveedor de IA: modelos, límites, techo de gasto y encendido.
 *
 * Los importes se escriben en pesos y se guardan en centavos; los límites, en
 * enteros. Quién puede, y que el modelo por omisión esté entre los permitidos,
 * lo decide el módulo. La clave no se toca aquí: su nombre de variable es de
 * despliegue.
 */
export async function configureProviderAction(
  _previo: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const actor = await currentActor();

  const errores: Record<string, string[]> = {};
  const modelos = textField(formData, 'allowedModels')
    .split(/[\n,]/)
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  const techo = pesosACentavos(textField(formData, 'maxMonthlyCost'));
  const tokens = enteroPositivo(textField(formData, 'maxTokensPerRequest'));
  const porDia = enteroPositivo(textField(formData, 'maxRequestsPerUserPerDay'));

  if (techo === null) (errores['maxMonthlyCost'] ??= []).push('Escribe el techo mensual en pesos, con hasta dos decimales.');
  if (tokens === null) (errores['maxTokensPerRequest'] ??= []).push('Escribe un número entero de tokens mayor que cero.');
  if (porDia === null) (errores['maxRequestsPerUserPerDay'] ??= []).push('Escribe un número entero de peticiones mayor que cero.');
  if (Object.keys(errores).length > 0) return { status: 'error', message: 'Revisa los datos marcados.', fieldErrors: errores };

  const resultado = await configureProvider(actor, {
    reason: textField(formData, 'reason'),
    allowedModels: modelos,
    defaultModel: textField(formData, 'defaultModel'),
    maxTokensPerRequest: tokens!,
    maxRequestsPerUserPerDay: porDia!,
    maxMonthlyCostMinor: techo!,
    currency: textField(formData, 'currency') || 'MXN',
    trainingOptOut: checkboxField(formData, 'trainingOptOut'),
    isEnabled: checkboxField(formData, 'isEnabled'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/gestion/ia/proveedor');
  return {
    status: 'ok',
    message: resultado.data.isEnabled
      ? 'Guardado. La IA queda encendida con estos límites.'
      : 'Guardado. La IA queda apagada: los flujos asistidos operan por el camino humano.',
  };
}
