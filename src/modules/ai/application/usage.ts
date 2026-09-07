import { z } from 'zod';
import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { AiGenerationStatus } from '@prisma-client/enums';

/**
 * Consulta de consumo, costo y errores de la IA por módulo (PRD §24 Fase 8,
 * criterio 6; ADR-0152).
 *
 * «Los costos y errores pueden consultarse por módulo **sin exponer contenido
 * sensible**» es el criterio, y su fuerza está en el «sin». Por eso esta consulta
 * vive detrás de `ai.usage.read` —un permiso propio, separado de
 * `ai.generation.read`— y **no selecciona ninguna columna de contenido**: ni el
 * resumen de la salida, ni la huella de lo enviado, ni el texto de nada. Suma
 * peticiones, tokens, costo y estados, agrupados por el módulo del prompt. Quien
 * vigila el gasto no lee, de paso, lo que alguien le escribió a un modelo.
 *
 * Que no exponga contenido no es una promesa de la interfaz: es una propiedad de
 * la consulta. La lista de columnas que agrega son todas números y estados; para
 * que se colara contenido habría que nombrar una columna de texto en este
 * archivo, y el control `C-F8-04` lo rechaza —ni siquiera en un comentario—.
 * Probado nombrándola y viéndolo fallar.
 */

export const usageByModuleSchema = z.object({
  /** Desde cuándo se cuenta. Por omisión, los últimos 30 días. */
  from: z.date().optional(),
  to: z.date().optional(),
});

export type UsageByModuleInput = z.input<typeof usageByModuleSchema>;

export interface ModuleUsage {
  readonly module: string;
  readonly requests: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costMinor: bigint;
  /** Ejecuciones que no fueron `SUCCEEDED`, por estado: errores, tiempos, rechazos. */
  readonly byStatus: Readonly<Record<AiGenerationStatus, number>>;
  readonly errors: number;
}

export interface UsageReport {
  readonly from: Date;
  readonly to: Date;
  readonly currency: string;
  readonly modules: readonly ModuleUsage[];
  readonly totals: {
    readonly requests: number;
    readonly costMinor: bigint;
    readonly errors: number;
  };
  /** Techo mensual de gasto configurado, para leer el consumo contra él. */
  readonly monthlyCapMinor: bigint | null;
}

const ESTADOS: readonly AiGenerationStatus[] = [
  'SUCCEEDED',
  'SCHEMA_REJECTED',
  'BLOCKED_BY_POLICY',
  'PROVIDER_ERROR',
  'TIMEOUT',
];

/** Un estado que no sea éxito cuenta como algo que hay que mirar. */
function esError(status: AiGenerationStatus): boolean {
  return status !== 'SUCCEEDED';
}

/**
 * Consumo por módulo en un periodo. `ai.usage.read`, y ni un carácter de lo que
 * se generó: la consulta agrega números y estados, agrupados por el módulo del
 * prompt que produjo cada ejecución.
 */
export async function usageByModule(
  actor: ActorContext,
  input: UsageByModuleInput = {},
): Promise<UseCaseResult<UsageReport>> {
  const parsed = usageByModuleSchema.safeParse(input);
  if (!parsed.success) {
    const detalles: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (detalles[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(detalles));
  }

  const decision = can(actor, 'ai.usage.read', { kind: 'AiGeneration', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const to = parsed.data.to ?? new Date();
  const from = parsed.data.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  // La lista de columnas es toda de agregados numéricos y de estado. No hay
  // ninguna de contenido, y esa ausencia es la garantía del criterio 6.
  const filas = await db().$queryRaw<
    {
      module: string;
      status: AiGenerationStatus;
      requests: number;
      prompt_tokens: bigint;
      completion_tokens: bigint;
      cost_minor: bigint;
    }[]
  >`
    SELECT p.module AS module,
           g.status AS status,
           COUNT(*)::int AS requests,
           COALESCE(SUM(g."promptTokens"), 0)::bigint AS prompt_tokens,
           COALESCE(SUM(g."completionTokens"), 0)::bigint AS completion_tokens,
           COALESCE(SUM(g."costMinor"), 0)::bigint AS cost_minor
      FROM ai_generation g
      JOIN ai_prompt_version v ON v.id = g."promptVersionId"
      JOIN ai_prompt p ON p.id = v."promptId"
     WHERE g."occurredAt" >= ${from}
       AND g."occurredAt" < ${to}
     GROUP BY p.module, g.status
     ORDER BY p.module
  `;

  interface Acc {
    module: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    costMinor: bigint;
    errors: number;
    byStatus: Record<AiGenerationStatus, number>;
  }

  const porModulo = new Map<string, Acc>();
  for (const fila of filas) {
    let m = porModulo.get(fila.module);
    if (m === undefined) {
      m = {
        module: fila.module,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        costMinor: 0n,
        errors: 0,
        byStatus: { SUCCEEDED: 0, SCHEMA_REJECTED: 0, BLOCKED_BY_POLICY: 0, PROVIDER_ERROR: 0, TIMEOUT: 0 },
      };
      porModulo.set(fila.module, m);
    }
    m.requests += fila.requests;
    m.promptTokens += Number(fila.prompt_tokens);
    m.completionTokens += Number(fila.completion_tokens);
    m.costMinor += fila.cost_minor;
    m.byStatus[fila.status] += fila.requests;
    if (esError(fila.status)) m.errors += fila.requests;
  }

  const modules: ModuleUsage[] = [...porModulo.values()].map((m) => ({
    module: m.module,
    requests: m.requests,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    costMinor: m.costMinor,
    errors: m.errors,
    byStatus: Object.fromEntries(ESTADOS.map((s) => [s, m.byStatus[s]])) as Record<AiGenerationStatus, number>,
  }));

  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { currency: true, maxMonthlyCostMinor: true },
  });

  return ok({
    from,
    to,
    currency: config?.currency ?? 'MXN',
    modules,
    totals: {
      requests: modules.reduce((n, m) => n + m.requests, 0),
      costMinor: modules.reduce((n, m) => n + m.costMinor, 0n),
      errors: modules.reduce((n, m) => n + m.errors, 0),
    },
    monthlyCapMinor: config?.maxMonthlyCostMinor ?? null,
  });
}
