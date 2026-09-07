import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, effectiveGrantedPermissions } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { indexSource, retrieveChunks, type IndexOutcome, type RetrievedChunk } from '@/platform/ai';

/**
 * Base documental de la IA (PRD §15.2, §24 Fase 8).
 *
 * Una fuente es una página del gestor de contenidos que la IA puede consultar,
 * con el **permiso que exige** para leerla. La recuperación (en `@/platform/ai`)
 * filtra por ese permiso en la misma consulta, de modo que un fragmento no
 * alcanza a quien no puede leer su origen. Aquí se administran las fuentes y se
 * declara qué fuentes puede consultar cada versión de prompt.
 */

const RECURSO = { kind: 'KnowledgeSource' as const, legalEntityId: null };

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** El texto indexable de una página: título, resumen y cuerpo de su versión vigente
 * (o, si no hay publicada, del borrador). Sin versión, no hay nada que indexar. */
async function textoDeLaPagina(contentPageId: string): Promise<{ text: string } | null> {
  const page = await db().contentPage.findUnique({
    where: { id: contentPageId },
    select: {
      currentVersion: { select: { title: true, summary: true, bodyMarkdown: true } },
      draftVersion: { select: { title: true, summary: true, bodyMarkdown: true } },
    },
  });
  const v = page?.currentVersion ?? page?.draftVersion ?? null;
  if (v === null) return null;
  return { text: `# ${v.title}\n\n${v.summary}\n\n${v.bodyMarkdown}` };
}

async function permisoExiste(code: string): Promise<boolean> {
  const p = await db().permission.findUnique({ where: { code }, select: { code: true } });
  return p !== null;
}

/* -------------------------------------------------------------------------- */
/* Registrar una fuente                                                       */
/* -------------------------------------------------------------------------- */

export const registerSourceSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, { error: () => 'Código: minúsculas, números y . _ -.' }),
  name: z.string().trim().min(3).max(200),
  sourceKind: z.enum(['STATUTE', 'POLICY', 'PUBLIC_CONTENT', 'PROCEDURE_GUIDE']),
  contentPageId: z.uuid(),
  legalEntityId: z.uuid().optional(),
  /** Nulo significa **pública**, no «sin restricción por descuido»: hay que elegirlo. */
  requiredPermissionCode: z.string().trim().min(1).max(80).optional(),
});

export async function registerSource(
  actor: ActorContext,
  input: z.infer<typeof registerSourceSchema>,
): Promise<UseCaseResult<{ sourceId: string }>> {
  const parsed = registerSourceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'ai.knowledge.manage', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (data.requiredPermissionCode !== undefined && !(await permisoExiste(data.requiredPermissionCode))) {
    return fail(errors.ruleViolation('Ese permiso no existe. La fuente exige un permiso real o ninguno (pública).', 'permiso inexistente'));
  }

  const existente = await db().knowledgeSource.findUnique({ where: { code: data.code }, select: { id: true } });
  if (existente !== null) return fail(errors.conflict('Ya existe una fuente con ese código.', 'código ocupado'));

  const contenido = await textoDeLaPagina(data.contentPageId);
  if (contenido === null) {
    return fail(errors.ruleViolation('Esa página no tiene contenido que indexar todavía.', 'página sin versión'));
  }
  const contentHash = createHash('sha256').update(contenido.text).digest('hex');

  const resultado = await transaction(async (tx) => {
    const fuente = await tx.knowledgeSource.create({
      data: {
        code: data.code,
        name: data.name,
        sourceKind: data.sourceKind,
        contentPageId: data.contentPageId,
        legalEntityId: data.legalEntityId ?? null,
        requiredPermissionCode: data.requiredPermissionCode ?? null,
        contentHash,
        status: 'PENDING',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_KNOWLEDGE_SOURCE_REGISTERED,
      objectKind: 'KnowledgeSource',
      objectId: fuente.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId ?? null,
      metadata: { code: data.code, requiredPermissionCode: data.requiredPermissionCode ?? null },
    });
    return { sourceId: fuente.id };
  });

  return ok(resultado);
}

/* -------------------------------------------------------------------------- */
/* Indexar una fuente ahora                                                   */
/* -------------------------------------------------------------------------- */

export async function indexSourceNow(actor: ActorContext, sourceId: string): Promise<UseCaseResult<IndexOutcome>> {
  const decision = can(actor, 'ai.knowledge.manage', { ...RECURSO, id: sourceId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fuente = await db().knowledgeSource.findUnique({
    where: { id: sourceId },
    select: { id: true, code: true, contentPageId: true, requiredPermissionCode: true, status: true },
  });
  if (fuente === null) return fail(errors.notFound('la fuente no existe'));
  if (fuente.status === 'DISABLED') return fail(errors.ruleViolation('La fuente está deshabilitada. Habilítala antes de indexar.', 'fuente deshabilitada'));
  if (fuente.contentPageId === null) return fail(errors.ruleViolation('Esta fuente no viene de una página.', 'sin página'));

  const contenido = await textoDeLaPagina(fuente.contentPageId);
  if (contenido === null) return fail(errors.ruleViolation('La página ya no tiene contenido que indexar.', 'página sin versión'));

  const resultado = await indexSource({
    sourceId: fuente.id,
    text: contenido.text,
    requiredPermissionCode: fuente.requiredPermissionCode,
    actorId: actor.actorId,
  });

  if (resultado.status === 'INDEXED') {
    await transaction(async (tx) => {
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.AI_KNOWLEDGE_SOURCE_INDEXED,
        objectKind: 'KnowledgeSource',
        objectId: fuente.id,
        outcome: 'SUCCESS',
        legalEntityId: null,
        metadata: { code: fuente.code, chunkCount: resultado.chunkCount },
      });
    });
  }

  return ok(resultado);
}

/* -------------------------------------------------------------------------- */
/* Deshabilitar una fuente                                                    */
/* -------------------------------------------------------------------------- */

export async function disableSource(actor: ActorContext, sourceId: string): Promise<UseCaseResult<{ disabled: boolean }>> {
  const decision = can(actor, 'ai.knowledge.manage', { ...RECURSO, id: sourceId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fuente = await db().knowledgeSource.findUnique({ where: { id: sourceId }, select: { id: true, code: true, status: true } });
  if (fuente === null) return fail(errors.notFound('la fuente no existe'));
  if (fuente.status === 'DISABLED') return ok({ disabled: true });

  await transaction(async (tx) => {
    // Deshabilitar borra sus fragmentos: una fuente deshabilitada no se consulta,
    // y dejar sus vectores sería dejar una puerta que la consulta cree cerrada.
    await tx.$executeRaw`DELETE FROM knowledge_chunk WHERE "knowledgeSourceId" = ${sourceId}::uuid`;
    await tx.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'DISABLED', chunkCount: 0, updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_KNOWLEDGE_SOURCE_DISABLED,
      objectKind: 'KnowledgeSource',
      objectId: sourceId,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: fuente.code },
    });
  });

  return ok({ disabled: true });
}

/* -------------------------------------------------------------------------- */
/* Qué fuentes puede consultar una versión de prompt                          */
/* -------------------------------------------------------------------------- */

export const setVersionSourcesSchema = z.object({
  promptVersionId: z.uuid(),
  sourceIds: z.array(z.uuid()).max(50),
});

export async function setVersionSources(
  actor: ActorContext,
  input: z.infer<typeof setVersionSourcesSchema>,
): Promise<UseCaseResult<{ count: number }>> {
  const parsed = setVersionSourcesSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const version = await db().aiPromptVersion.findUnique({
    where: { id: parsed.data.promptVersionId },
    select: { id: true, status: true, prompt: { select: { id: true, code: true } } },
  });
  if (version === null) return fail(errors.notFound('la versión no existe'));

  const decision = can(actor, 'ai.prompt.edit', { kind: 'AiPrompt', id: version.prompt.id, legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  // Solo se editan las fuentes de un borrador o una versión en prueba: las de una
  // versión publicada son parte de lo que se revisó, y cambiarlas sin una versión
  // nueva cambiaría lo que un prompt publicado lee sin que nadie lo revisara.
  if (version.status !== 'DRAFT' && version.status !== 'TESTING') {
    return fail(errors.ruleViolation('Solo se pueden cambiar las fuentes de una versión en borrador o en prueba.', `estado ${version.status}`));
  }

  const existen = await db().knowledgeSource.findMany({
    where: { id: { in: parsed.data.sourceIds } },
    select: { id: true },
  });
  if (existen.length !== parsed.data.sourceIds.length) {
    return fail(errors.ruleViolation('Alguna de las fuentes no existe.', 'fuente inexistente'));
  }

  await transaction(async (tx) => {
    await tx.aiPromptVersionSource.deleteMany({ where: { promptVersionId: version.id } });
    if (parsed.data.sourceIds.length > 0) {
      await tx.aiPromptVersionSource.createMany({
        data: parsed.data.sourceIds.map((knowledgeSourceId) => ({ promptVersionId: version.id, knowledgeSourceId })),
      });
    }
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AI_PROMPT_SOURCES_CHANGED,
      objectKind: 'AiPrompt',
      objectId: version.prompt.id,
      outcome: 'SUCCESS',
      legalEntityId: null,
      metadata: { code: version.prompt.code, count: parsed.data.sourceIds.length },
    });
  });

  return ok({ count: parsed.data.sourceIds.length });
}

/* -------------------------------------------------------------------------- */
/* Recuperación con permisos, para una versión de prompt                      */
/* -------------------------------------------------------------------------- */

export interface RetrievalResult {
  readonly status: 'OK' | 'DEGRADED';
  readonly chunks: RetrievedChunk[];
}

/**
 * Recupera fragmentos para una versión de prompt, con los permisos de quien
 * pregunta. Es el punto que usarán los flujos asistidos (bloque F). La lista de
 * permisos sale de `effectiveGrantedPermissions`, la misma que decide todo lo
 * demás: si alguien obtiene permisos por una vía, esta también los ve.
 */
export async function retrieveForVersion(
  actor: ActorContext,
  input: { promptVersionId: string; queryText: string; limit?: number },
): Promise<UseCaseResult<RetrievalResult>> {
  const version = await db().aiPromptVersion.findUnique({
    where: { id: input.promptVersionId },
    select: { id: true, authorizedSources: { select: { knowledgeSourceId: true } } },
  });
  if (version === null) return fail(errors.notFound('la versión no existe'));

  const permisos = [...effectiveGrantedPermissions(actor)];
  const fuentes = version.authorizedSources.map((s) => s.knowledgeSourceId);

  const resultado = await retrieveChunks({
    queryText: input.queryText,
    permissionCodes: permisos,
    authorizedSourceIds: fuentes,
    limit: input.limit ?? 5,
  });

  return ok({ status: resultado.status, chunks: resultado.status === 'OK' ? resultado.chunks : [] });
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                  */
/* -------------------------------------------------------------------------- */

export interface SourceListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sourceKind: string;
  readonly status: string;
  readonly requiredPermissionCode: string | null;
  readonly chunkCount: number;
  readonly indexedAt: Date | null;
  readonly updatedAt: Date;
}

/** Los permisos que una fuente puede exigir, para poblar el formulario. */
export async function permissionOptions(actor: ActorContext): Promise<UseCaseResult<{ code: string; description: string }[]>> {
  const decision = can(actor, 'ai.knowledge.manage', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  const permisos = await db().permission.findMany({ orderBy: { code: 'asc' }, select: { code: true, description: true } });
  return ok(permisos);
}

export async function listSources(actor: ActorContext): Promise<UseCaseResult<SourceListItem[]>> {
  const decision = can(actor, 'ai.knowledge.manage', RECURSO);
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fuentes = await db().knowledgeSource.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      code: true,
      name: true,
      sourceKind: true,
      status: true,
      requiredPermissionCode: true,
      chunkCount: true,
      indexedAt: true,
      updatedAt: true,
    },
  });
  return ok(fuentes);
}
