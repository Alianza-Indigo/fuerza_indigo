import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { aiCapability, type AiCapability } from '@/platform/ai';

/**
 * Gobernanza del proveedor de IA (PRD §15.1, §24 Fase 8; ADR-0153).
 *
 * Los límites y el encendido viven en la fila del proveedor, no en el código,
 * «porque quien paga la factura tiene que poder bajarlos un martes sin esperar un
 * despliegue» (bloque A). Esta es la pantalla desde la que se bajan. La clave
 * **no** está aquí ni se toca aquí: la fila guarda el *nombre* de la variable de
 * entorno, y apuntar a otra es una decisión de despliegue, no de esta pantalla
 * (por eso `apiKeyEnvVarName` no es de las columnas actualizables).
 *
 * Apagar la IA es una decisión de la organización, no una avería: con el
 * proveedor apagado la aplicación sigue en pie y todo cae al camino humano
 * (criterio 5). La salud lo dice tal cual —`DEGRADED` y no `failed`—, y esta
 * pantalla la enseña para que el estado de operación se lea sin adivinarlo.
 */

export interface ProviderConfigView {
  readonly defaultModel: string;
  readonly allowedModels: readonly string[];
  readonly maxTokensPerRequest: number;
  readonly maxRequestsPerUserPerDay: number;
  readonly maxMonthlyCostMinor: bigint;
  readonly currency: string;
  readonly trainingOptOut: boolean;
  readonly isEnabled: boolean;
  /** El nombre de la variable de entorno de la clave, para saber cuál se usa. Nunca la clave. */
  readonly apiKeyEnvVarName: string;
  /** Salud efectiva: operativa, o degradada con su motivo. */
  readonly health: { readonly capability: AiCapability; readonly detail: string };
}

const RECURSO = { kind: 'AiProviderConfiguration' as const, legalEntityId: null };

export async function readProviderConfig(actor: ActorContext): Promise<UseCaseResult<ProviderConfigView>> {
  const decision = can({ ...actor, reason: 'consulta de la configuración del proveedor de IA' }, 'ai.provider.configure', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: {
      defaultModel: true,
      allowedModels: true,
      maxTokensPerRequest: true,
      maxRequestsPerUserPerDay: true,
      maxMonthlyCostMinor: true,
      currency: true,
      trainingOptOut: true,
      isEnabled: true,
      apiKeyEnvVarName: true,
    },
  });
  if (config === null) return fail(errors.notFound('No hay configuración del proveedor de IA. La crea la semilla.'));

  const health = await aiCapability();
  return ok({ ...config, health });
}

export const configureProviderSchema = z.object({
  /** Motivo obligatorio: `ai.provider.configure` lo exige (permiso crítico). */
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué cambias la configuración: es un permiso crítico y queda en la bitácora.' }).max(600),
  allowedModels: z
    .array(z.string().trim().min(1).max(80))
    .min(1, { error: () => 'Deja al menos un modelo permitido: sin ninguno, no se puede publicar ni ejecutar nada.' })
    .max(20),
  defaultModel: z.string().trim().min(1).max(80),
  maxTokensPerRequest: z.number().int().positive().max(1_000_000),
  maxRequestsPerUserPerDay: z.number().int().positive().max(100_000),
  maxMonthlyCostMinor: z
    .bigint()
    .positive({ error: () => 'El techo mensual tiene que ser mayor que cero: un límite de cero apaga la comprobación sin apagar la IA.' }),
  currency: z.string().trim().length(3),
  trainingOptOut: z.boolean(),
  isEnabled: z.boolean(),
});

export type ConfigureProviderInput = z.input<typeof configureProviderSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Configura el proveedor: modelos, límites, techo de gasto y encendido. No toca
 * la clave —su nombre de variable es de despliegue— y exige un motivo, porque es
 * un permiso crítico. El modelo por omisión tiene que estar entre los permitidos:
 * un modelo por omisión que no se permite dejaría el sistema apuntando a algo que
 * no puede usar.
 */
export async function configureProvider(
  actor: ActorContext,
  input: ConfigureProviderInput,
): Promise<UseCaseResult<{ isEnabled: boolean }>> {
  const parsed = configureProviderSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'ai.provider.configure', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const modelosUnicos = [...new Set(data.allowedModels)];
  if (!modelosUnicos.includes(data.defaultModel)) {
    return fail(
      errors.ruleViolation(
        'El modelo por omisión tiene que estar entre los permitidos.',
        `defaultModel ${data.defaultModel} fuera de allowedModels`,
      ),
    );
  }

  const existe = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { id: true },
  });
  if (existe === null) return fail(errors.notFound('No hay configuración del proveedor de IA. La crea la semilla.'));

  await transaction(async (tx) => {
    await tx.aiProviderConfiguration.update({
      where: { provider: 'GEMINI' },
      data: {
        allowedModels: modelosUnicos,
        defaultModel: data.defaultModel,
        maxTokensPerRequest: data.maxTokensPerRequest,
        maxRequestsPerUserPerDay: data.maxRequestsPerUserPerDay,
        maxMonthlyCostMinor: data.maxMonthlyCostMinor,
        currency: data.currency,
        trainingOptOut: data.trainingOptOut,
        isEnabled: data.isEnabled,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.AI_PROVIDER_CONFIGURED,
      objectKind: 'AiProviderConfiguration',
      objectId: existe.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      reason: data.reason,
      metadata: {
        isEnabled: data.isEnabled,
        maxTokensPerRequest: data.maxTokensPerRequest,
        maxRequestsPerUserPerDay: data.maxRequestsPerUserPerDay,
        maxMonthlyCostMinor: data.maxMonthlyCostMinor.toString(),
        currency: data.currency,
        modelos: modelosUnicos.length,
      },
    });
  });

  return ok({ isEnabled: data.isEnabled });
}
