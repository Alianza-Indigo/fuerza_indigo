import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { systemContext } from '@/platform/kernel/actor-context';
import { systemActorId } from '@/platform/auth/superadmin';
import { newCorrelationId } from '@/platform/kernel/ids';
import { logger } from '@/platform/observability/logger';

/**
 * Publica lo que estaba programado y ya llegó su hora.
 *
 * Lo ejecuta el despachador de tareas, no una petición. La publicación queda
 * atribuida al actor del trabajo y no a la última persona que tocó el contenido:
 * quien programó una convocatoria para el jueves no está publicando el jueves,
 * y la bitácora tiene que poder distinguir las dos cosas.
 */
export async function publishDueContent(): Promise<{ published: number }> {
  const ahora = new Date();

  const pendientes = await db().contentPage.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: { lte: ahora },
      draftVersionId: { not: null },
    },
    select: { id: true, slug: true, legalEntityId: true, draftVersionId: true, scheduledFor: true },
    take: 50,
  });

  if (pendientes.length === 0) return { published: 0 };

  const actorId = await systemActorId('content-schedule');
  let publicadas = 0;

  for (const pagina of pendientes) {
    const actor = systemContext({
      actorId,
      jobType: 'content-schedule',
      correlationId: newCorrelationId(),
    });

    try {
      await transaction(async (tx) => {
        // Se relee dentro de la transacción: entre la consulta y aquí, alguien
        // pudo archivar el contenido o publicarlo a mano.
        const vigente = await tx.contentPage.findUnique({
          where: { id: pagina.id },
          select: { status: true, draftVersionId: true, currentVersionId: true },
        });
        if (vigente === null || vigente.status !== 'SCHEDULED' || vigente.draftVersionId === null) return;

        await tx.contentVersion.update({ where: { id: vigente.draftVersionId }, data: { publishedAt: ahora } });
        await tx.contentPage.update({
          where: { id: pagina.id },
          data: {
            status: 'PUBLISHED',
            currentVersionId: vigente.draftVersionId,
            draftVersionId: null,
            publishedAt: ahora,
            scheduledFor: null,
            updatedByActorId: actorId,
          },
        });
        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.CONTENT_PUBLISHED,
          objectKind: 'ContentPage',
          objectId: pagina.id,
          outcome: 'SUCCESS',
          legalEntityId: pagina.legalEntityId,
          metadata: { slug: pagina.slug, origen: 'publicación programada' },
        });
        publicadas += 1;
      });
    } catch (error) {
      // Un contenido que falla no puede impedir que salgan los demás: una
      // convocatoria con fecha no espera a que alguien arregle otra página.
      logger.error('No se pudo publicar un contenido programado', {
        module: 'content',
        correlationId: actor.correlationId,
        outcome: 'failed',
        context: { slug: pagina.slug, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return { published: publicadas };
}
