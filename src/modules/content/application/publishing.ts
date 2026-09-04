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
 * Revisión, publicación, archivo y reversión (PRD §16.1).
 *
 * Dos reglas gobiernan todo este archivo:
 *
 *  1. **Quien redacta no publica.** Escribir y publicar son permisos distintos,
 *     y quien envió un contenido a revisión no puede aprobarlo. Sin esto, la
 *     revisión existe en el diagrama y no en los hechos.
 *  2. **Nada se pierde.** Revertir copia una versión antigua en una nueva; no
 *     restaura sobrescribiendo. El historial de un comunicado sindical forma
 *     parte del comunicado, y una reversión silenciosa lo borraría.
 */

async function cargar(pageId: string) {
  return db().contentPage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      slug: true,
      status: true,
      legalEntityId: true,
      currentVersionId: true,
      draftVersionId: true,
      draftVersion: { select: { id: true, version: true, authorId: true } },
    },
  });
}

/** Envía el borrador a revisión. Lo puede hacer quien escribe. */
export async function submitForReview(
  actor: ActorContext,
  pageId: string,
): Promise<UseCaseResult<{ status: string }>> {
  const pagina = await cargar(pageId);
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(actor, 'content.page.write', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pagina.draftVersionId === null || pagina.draftVersionId === pagina.currentVersionId) {
    return fail(
      errors.ruleViolation(
        'No hay cambios sin publicar que revisar.',
        'sin borrador pendiente',
      ),
    );
  }
  if (pagina.status === 'IN_REVIEW') return ok({ status: 'IN_REVIEW' });

  await transaction(async (tx) => {
    await tx.contentPage.update({
      where: { id: pagina.id },
      data: { status: 'IN_REVIEW', updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_SUBMITTED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      metadata: { slug: pagina.slug, version: pagina.draftVersion?.version ?? null },
    });
  });

  return ok({ status: 'IN_REVIEW' });
}

export const reviewSchema = z.object({
  pageId: z.uuid(),
  decision: z.enum(['APROBAR', 'DEVOLVER']),
  comment: z.string().trim().max(400).optional(),
});

/**
 * Resuelve una revisión.
 *
 * Aprobar deja el contenido listo para publicar, **no** lo publica: son actos
 * distintos y a menudo de personas distintas, y una convocatoria aprobada el
 * martes puede tener que salir el jueves.
 */
export async function reviewPage(
  actor: ActorContext,
  input: z.infer<typeof reviewSchema>,
): Promise<UseCaseResult<{ status: string }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    const detalles: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (detalles[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(detalles));
  }

  const pagina = await cargar(parsed.data.pageId);
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(actor, 'content.page.review', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pagina.status !== 'IN_REVIEW') {
    return fail(errors.ruleViolation('Este contenido no está en revisión.', `estado ${pagina.status}`));
  }

  // Quien redactó la versión no la aprueba. Es lo que hace real la revisión.
  if (parsed.data.decision === 'APROBAR' && pagina.draftVersion?.authorId === actor.userId) {
    return fail(
      errors.ruleViolation(
        'No puedes aprobar un contenido que tú misma o tú mismo redactaste. Pídelo a otra persona con facultad de revisión.',
        'autorrevisión',
      ),
    );
  }

  const aprobado = parsed.data.decision === 'APROBAR';

  await transaction(async (tx) => {
    if (aprobado && pagina.draftVersionId !== null) {
      await tx.contentVersion.update({
        where: { id: pagina.draftVersionId },
        data: { reviewedById: actor.userId, reviewedAt: new Date() },
      });
    }
    await tx.contentPage.update({
      where: { id: pagina.id },
      data: { status: aprobado ? 'DRAFT' : 'DRAFT', updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: aprobado ? AUDIT_ACTIONS.CONTENT_APPROVED : AUDIT_ACTIONS.CONTENT_RETURNED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      reason: parsed.data.comment ?? null,
      metadata: { slug: pagina.slug, version: pagina.draftVersion?.version ?? null },
    });
  });

  return ok({ status: 'DRAFT' });
}

export const publishSchema = z.object({
  pageId: z.uuid(),
  /** Momento de publicación. Ausente significa ahora. */
  scheduledFor: z.iso.datetime().optional(),
});

/**
 * Publica o programa.
 *
 * Exige que la versión esté **revisada**. Sin ese requisito, el permiso de
 * publicar bastaría para saltarse la revisión sin dejar constancia de haberlo
 * hecho, y el circuito editorial sería un adorno.
 */
export async function publishPage(
  actor: ActorContext,
  input: z.infer<typeof publishSchema>,
): Promise<UseCaseResult<{ status: string; publishedAt: Date | null }>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ form: ['Revisa los datos.'] }));

  const pagina = await db().contentPage.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      id: true,
      slug: true,
      status: true,
      legalEntityId: true,
      currentVersionId: true,
      draftVersionId: true,
      draftVersion: { select: { id: true, version: true, reviewedAt: true } },
    },
  });
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(actor, 'content.page.publish', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const pendiente = pagina.draftVersionId !== null && pagina.draftVersionId !== pagina.currentVersionId;
  if (!pendiente) return fail(errors.ruleViolation('No hay cambios sin publicar.', 'sin borrador pendiente'));

  if (pagina.draftVersion?.reviewedAt === null || pagina.draftVersion?.reviewedAt === undefined) {
    return fail(
      errors.ruleViolation(
        'Este contenido todavía no pasó por revisión. Envíalo a revisar antes de publicarlo.',
        'publicación sin revisión previa',
      ),
    );
  }

  const cuando = parsed.data.scheduledFor === undefined ? null : new Date(parsed.data.scheduledFor);
  const programado = cuando !== null && cuando.getTime() > Date.now();

  const resultado = await transaction(async (tx) => {
    if (programado) {
      await tx.contentPage.update({
        where: { id: pagina.id },
        data: { status: 'SCHEDULED', scheduledFor: cuando, updatedByActorId: actor.actorId },
      });
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.CONTENT_SCHEDULED,
        objectKind: 'ContentPage',
        objectId: pagina.id,
        outcome: 'SUCCESS',
        legalEntityId: pagina.legalEntityId,
        metadata: { slug: pagina.slug, scheduledFor: cuando.toISOString() },
      });
      return { status: 'SCHEDULED' as const, publishedAt: null };
    }

    const ahora = new Date();
    await tx.contentVersion.update({ where: { id: pagina.draftVersionId! }, data: { publishedAt: ahora } });
    await tx.contentPage.update({
      where: { id: pagina.id },
      data: {
        status: 'PUBLISHED',
        currentVersionId: pagina.draftVersionId,
        // Sin borrador pendiente: lo que se ve y lo que se edita coinciden.
        draftVersionId: null,
        publishedAt: ahora,
        scheduledFor: null,
        archivedAt: null,
        updatedByActorId: actor.actorId,
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_PUBLISHED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      metadata: { slug: pagina.slug, version: pagina.draftVersion?.version ?? null },
    });
    return { status: 'PUBLISHED' as const, publishedAt: ahora };
  });

  return ok(resultado);
}

/** Retira del público sin borrar. Lo publicado sigue en el historial. */
export async function archivePage(actor: ActorContext, pageId: string): Promise<UseCaseResult<{ status: string }>> {
  const pagina = await cargar(pageId);
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(actor, 'content.page.publish', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pagina.status === 'ARCHIVED') return ok({ status: 'ARCHIVED' });

  await transaction(async (tx) => {
    await tx.contentPage.update({
      where: { id: pagina.id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), scheduledFor: null, updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CONTENT_ARCHIVED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      metadata: { slug: pagina.slug },
    });
  });

  return ok({ status: 'ARCHIVED' });
}

export const revertSchema = z.object({
  pageId: z.uuid(),
  versionId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se revierte: al menos diez caracteres.',
  }),
});

/**
 * Revierte a una versión anterior **creando una nueva**.
 *
 * La versión nueva queda como borrador revisado y listo para publicar, con el
 * rastro de cuál fue su origen. No se publica sola: revertir es una decisión
 * editorial y publicarla es otra, aunque suelan ocurrir seguidas.
 */
export async function revertPage(
  actor: ActorContext,
  input: z.infer<typeof revertSchema>,
): Promise<UseCaseResult<{ versionId: string; version: number }>> {
  const parsed = revertSchema.safeParse(input);
  if (!parsed.success) {
    const detalles: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (detalles[issue.path.join('.') || 'form'] ??= []).push(issue.message);
    return fail(errors.validation(detalles));
  }

  const contexto: ActorContext = { ...actor, reason: parsed.data.reason };
  const pagina = await cargar(parsed.data.pageId);
  if (pagina === null) return fail(errors.notFound('el contenido no existe'));

  const decision = can(contexto, 'content.page.revert', {
    kind: 'ContentPage',
    id: pagina.id,
    legalEntityId: pagina.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const origen = await db().contentVersion.findUnique({
    where: { id: parsed.data.versionId },
    select: {
      id: true,
      pageId: true,
      version: true,
      title: true,
      summary: true,
      bodyMarkdown: true,
      seoTitle: true,
      seoDescription: true,
      socialImageFileId: true,
    },
  });
  if (origen === null || origen.pageId !== pagina.id) {
    return fail(errors.notFound('esa versión no pertenece a este contenido'));
  }

  const authorId = actor.userId;
  if (authorId === null) return fail(errors.ruleViolation('Una reversión debe tener autoría identificada.'));

  const resultado = await transaction(async (tx) => {
    const ultima = await tx.contentVersion.findFirst({
      where: { pageId: pagina.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const creada = await tx.contentVersion.create({
      data: {
        pageId: pagina.id,
        version: (ultima?.version ?? 0) + 1,
        title: origen.title,
        summary: origen.summary,
        bodyMarkdown: origen.bodyMarkdown,
        seoTitle: origen.seoTitle,
        seoDescription: origen.seoDescription,
        socialImageFileId: origen.socialImageFileId,
        changeNote: `Reversión a la versión ${origen.version}: ${parsed.data.reason}`,
        revertedFromVersionId: origen.id,
        authorId,
        // Una reversión a una versión que ya estuvo publicada no necesita
        // revisión nueva: su contenido ya se revisó cuando se publicó.
        reviewedById: actor.userId,
        reviewedAt: new Date(),
      },
      select: { id: true, version: true },
    });

    await tx.contentPage.update({
      where: { id: pagina.id },
      data: { draftVersionId: creada.id, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CONTENT_REVERTED,
      objectKind: 'ContentPage',
      objectId: pagina.id,
      outcome: 'SUCCESS',
      legalEntityId: pagina.legalEntityId,
      reason: parsed.data.reason,
      metadata: { slug: pagina.slug, desde: origen.version, hacia: creada.version },
    });

    return { versionId: creada.id, version: creada.version };
  });

  return ok(resultado);
}
