import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Ciclo editorial del CMS (PRD §16.1, §24 Fase 2).
 *
 * El estado de un contenido vive en dos punteros y no en un campo suelto:
 *
 *  · `currentVersionId` es lo que el público ve. Cambia solo al publicar.
 *  · `draftVersionId` es sobre lo que se trabaja. Puede ser posterior.
 *
 * Editar una página publicada crea una versión nueva **sin tocar la vigente**,
 * de modo que el sitio no cambia hasta que alguien decide publicarlo. Y revertir
 * no borra nada: copia una versión antigua en una nueva, con el rastro de cuál
 * fue el origen. El historial de un comunicado sindical es parte del comunicado.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/, {
    error: () => 'Usa solo minúsculas, números y guiones. Por ejemplo: sindicato-y-derechos.',
  });

export const createPageSchema = z.object({
  slug,
  kind: z.enum([
    'PAGE',
    'NEWS',
    'STATEMENT',
    'RESOURCE',
    'FAQ',
    'CALL_FOR_APPLICATIONS',
    'BANNER',
    'LEGAL',
    'DELEGATION_PROFILE',
    'PROTOCOL',
  ]),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(400, {
    error: () => 'El resumen es lo que se lee en los listados y en las redes: hasta 400 caracteres.',
  }),
  bodyMarkdown: z.string().min(1, { error: () => 'Escribe el contenido.' }),
  legalEntityId: z.uuid().optional(),
  territorialUnitId: z.uuid().optional(),
  accessLevel: z.enum(['PUBLIC', 'MEMBERS', 'INTERNAL']).default('PUBLIC'),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(200).optional(),
  changeNote: z.string().trim().max(400).optional(),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** El actor tiene que ser una persona: toda versión lleva autoría identificada. */
function autoria(actor: ActorContext): string | null {
  return actor.userId;
}

export async function createPage(
  actor: ActorContext,
  input: CreatePageInput,
): Promise<UseCaseResult<{ pageId: string; versionId: string }>> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const decision = can(actor, 'content.page.write', {
    kind: 'ContentPage',
    legalEntityId: data.legalEntityId ?? null,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const authorId = autoria(actor);
  if (authorId === null) {
    return fail(
      errors.ruleViolation(
        'Un contenido debe tener una autoría identificada.',
        'el actor no tiene cuenta: no puede figurar como autoría de una versión (ADR-0042)',
      ),
    );
  }

  const existente = await db().contentPage.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (existente !== null) {
    return fail(
      errors.conflict(
        'Ya existe un contenido en esa dirección. Elige otra o edita el que ya está.',
        'slug ocupado',
      ),
    );
  }

  const resultado = await transaction(async (tx) => {
    const pagina = await tx.contentPage.create({
      data: {
        slug: data.slug,
        kind: data.kind,
        legalEntityId: data.legalEntityId ?? null,
        territorialUnitId: data.territorialUnitId ?? null,
        accessLevel: data.accessLevel,
        status: 'DRAFT',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    const version = await tx.contentVersion.create({
      data: {
        pageId: pagina.id,
        version: 1,
        title: data.title,
        summary: data.summary,
        bodyMarkdown: data.bodyMarkdown,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        changeNote: data.changeNote ?? 'Versión inicial',
        authorId,
      },
      select: { id: true },
    });

    await tx.contentPage.update({ where: { id: pagina.id }, data: { draftVersionId: version.id } });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_DRAFTED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId ?? null,
      metadata: { slug: data.slug, kind: data.kind, version: 1 },
    });

    return { pageId: pagina.id, versionId: version.id };
  });

  return ok(resultado);
}

export const editPageSchema = z.object({
  pageId: z.uuid(),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(400),
  bodyMarkdown: z.string().min(1),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(200).optional(),
  changeNote: z.string().trim().min(3).max(400, {
    error: () => 'Escribe qué cambiaste: es lo que se lee en el historial.',
  }),
});

/**
 * Guarda una versión nueva sobre el borrador vivo.
 *
 * Si ya hay un borrador sin publicar, se **sobrescribe**: son ediciones del
 * mismo trabajo en curso, y conservar una versión por cada pulsación de teclado
 * convertiría el historial en ruido. Lo que nunca se toca es la versión vigente.
 */
export async function editPage(
  actor: ActorContext,
  input: z.infer<typeof editPageSchema>,
): Promise<UseCaseResult<{ versionId: string; version: number }>> {
  const parsed = editPageSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const pagina = await db().contentPage.findUnique({
    where: { id: data.pageId },
    select: { id: true, slug: true, legalEntityId: true, status: true, draftVersionId: true, currentVersionId: true },
  });
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(actor, 'content.page.write', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pagina.status === 'IN_REVIEW') {
    return fail(
      errors.ruleViolation(
        'Este contenido está en revisión. Pide que te lo devuelvan antes de seguir editándolo.',
        'edición sobre contenido en revisión',
      ),
    );
  }

  const authorId = autoria(actor);
  if (authorId === null) return fail(errors.ruleViolation('Un contenido debe tener una autoría identificada.'));

  const resultado = await transaction(async (tx) => {
    // Se sobrescribe el borrador vivo, salvo que sea la versión publicada.
    const borradorReutilizable =
      pagina.draftVersionId !== null && pagina.draftVersionId !== pagina.currentVersionId
        ? pagina.draftVersionId
        : null;

    if (borradorReutilizable !== null) {
      const actualizada = await tx.contentVersion.update({
        where: { id: borradorReutilizable },
        data: {
          title: data.title,
          summary: data.summary,
          bodyMarkdown: data.bodyMarkdown,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          changeNote: data.changeNote,
          authorId,
        },
        select: { id: true, version: true },
      });
      return { versionId: actualizada.id, version: actualizada.version };
    }

    const ultima = await tx.contentVersion.findFirst({
      where: { pageId: pagina.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const creada = await tx.contentVersion.create({
      data: {
        pageId: pagina.id,
        version: (ultima?.version ?? 0) + 1,
        title: data.title,
        summary: data.summary,
        bodyMarkdown: data.bodyMarkdown,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        changeNote: data.changeNote,
        authorId,
      },
      select: { id: true, version: true },
    });

    await tx.contentPage.update({
      where: { id: pagina.id },
      data: { draftVersionId: creada.id, status: pagina.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_DRAFTED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      metadata: { slug: pagina.slug, version: creada.version, changeNote: data.changeNote },
    });

    return { versionId: creada.id, version: creada.version };
  });

  return ok(resultado);
}
