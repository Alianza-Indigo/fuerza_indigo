import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Consultas de prompts para la administración (PRD §15.3).
 *
 * Leer los prompts y su historial es `ai.prompt.read`. No devuelve nada de lo
 * que la gente le escribió a un modelo: eso es `ai.generation.read`, y separarlo
 * es lo que permite que quien administra los textos no lea las conversaciones.
 */

const RECURSO = { kind: 'AiPrompt' as const, legalEntityId: null };

/** Modelos que el proveedor permite hoy, para que el formulario ofrezca solo esos. */
export async function promptModels(actor: ActorContext): Promise<UseCaseResult<{ models: string[]; defaultModel: string | null }>> {
  const decision = can(actor, 'ai.prompt.read', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const config = await db().aiProviderConfiguration.findUnique({
    where: { provider: 'GEMINI' },
    select: { allowedModels: true, defaultModel: true },
  });
  return ok({ models: config?.allowedModels ?? [], defaultModel: config?.defaultModel ?? null });
}

export interface PromptListItem {
  readonly id: string;
  readonly code: string;
  readonly module: string;
  readonly criticality: 'STANDARD' | 'CRITICAL';
  readonly isActive: boolean;
  /** Estado de lo que hoy se ejecuta: la versión vigente, o ninguna. */
  readonly published: boolean;
  readonly latestVersion: number;
  /** Si hay una versión en borrador o en prueba posterior a la publicada. */
  readonly hasPendingDraft: boolean;
  readonly updatedAt: Date;
}

export async function listPrompts(actor: ActorContext): Promise<UseCaseResult<PromptListItem[]>> {
  const decision = can(actor, 'ai.prompt.read', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const prompts = await db().aiPrompt.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      code: true,
      module: true,
      criticality: true,
      isActive: true,
      currentVersionId: true,
      updatedAt: true,
      versions: { select: { version: true, status: true }, orderBy: { version: 'desc' } },
    },
  });

  return ok(
    prompts.map((p) => {
      const latest = p.versions[0];
      const pendiente = p.versions.some((v) => v.status === 'DRAFT' || v.status === 'TESTING');
      return {
        id: p.id,
        code: p.code,
        module: p.module,
        criticality: p.criticality,
        isActive: p.isActive,
        published: p.currentVersionId !== null,
        latestVersion: latest?.version ?? 0,
        hasPendingDraft: pendiente,
        updatedAt: p.updatedAt,
      };
    }),
  );
}

export interface PromptVersionDetail {
  readonly id: string;
  readonly version: number;
  readonly status: 'DRAFT' | 'TESTING' | 'PUBLISHED' | 'RETIRED';
  readonly systemText: string;
  readonly allowedVariables: string[];
  readonly model: string;
  readonly parameters: unknown;
  readonly outputSchema: unknown;
  readonly limits: unknown;
  readonly authorName: string;
  readonly reviewerName: string | null;
  readonly reviewedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly retiredAt: Date | null;
  readonly revertedFromVersion: number | null;
  readonly isCurrent: boolean;
  readonly createdAt: Date;
}

export interface PromptDetail {
  readonly id: string;
  readonly code: string;
  readonly purpose: string;
  readonly module: string;
  readonly criticality: 'STANDARD' | 'CRITICAL';
  readonly isActive: boolean;
  readonly currentVersionId: string | null;
  readonly versions: PromptVersionDetail[];
}

export async function readPrompt(actor: ActorContext, promptId: string): Promise<UseCaseResult<PromptDetail>> {
  const decision = can(actor, 'ai.prompt.read', { ...RECURSO, id: promptId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const prompt = await db().aiPrompt.findUnique({
    where: { id: promptId },
    select: {
      id: true,
      code: true,
      purpose: true,
      module: true,
      criticality: true,
      isActive: true,
      currentVersionId: true,
      versions: {
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          status: true,
          systemText: true,
          allowedVariables: true,
          model: true,
          parameters: true,
          outputSchema: true,
          limits: true,
          reviewedAt: true,
          publishedAt: true,
          retiredAt: true,
          createdAt: true,
          author: { select: { person: { select: { givenName: true, familyName: true } } } },
          reviewer: { select: { person: { select: { givenName: true, familyName: true } } } },
          revertedFromVersion: { select: { version: true } },
        },
      },
    },
  });
  if (prompt === null) return fail(errors.notFound('el prompt no existe'));

  return ok({
    id: prompt.id,
    code: prompt.code,
    purpose: prompt.purpose,
    module: prompt.module,
    criticality: prompt.criticality,
    isActive: prompt.isActive,
    currentVersionId: prompt.currentVersionId,
    versions: prompt.versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      systemText: v.systemText,
      allowedVariables: v.allowedVariables,
      model: v.model,
      parameters: v.parameters,
      outputSchema: v.outputSchema,
      limits: v.limits,
      authorName: `${v.author.person.givenName} ${v.author.person.familyName}`,
      reviewerName: v.reviewer === null ? null : `${v.reviewer.person.givenName} ${v.reviewer.person.familyName}`,
      reviewedAt: v.reviewedAt,
      publishedAt: v.publishedAt,
      retiredAt: v.retiredAt,
      revertedFromVersion: v.revertedFromVersion?.version ?? null,
      isCurrent: v.id === prompt.currentVersionId,
      createdAt: v.createdAt,
    })),
  });
}
