import { z } from 'zod';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { render } from '@/platform/mail/mailer';
import { enqueue } from '@/platform/jobs/queue';
import { isMandatoryCategory } from '../domain/preferences';

/**
 * Campañas operativas autorizadas (PRD §16.2, §24 Fase 9 criterio 1).
 *
 * Una campaña es un envío autorizado del mismo texto a un público —los miembros
 * activos de una entidad—, a partir de una plantilla **publicada**. No hay
 * entidad de campaña: el contrato de fases no admite una nueva en la Fase 9, así
 * que la campaña vive en la bitácora y en las notificaciones que crea.
 *
 * **Lo obligatorio y lo promocional se gestionan por separado.** Una campaña
 * nunca envía un aviso obligatorio de gobierno: esos van por su propio flujo, no
 * como difusión. Y respeta la preferencia de cada persona: a quien silenció esa
 * clase para el correo no se le envía —queda un intento `SUPPRESSED`, no un
 * envío—. El correo sale por la cola de trabajos, que registra entrega, fallo y
 * reintento.
 */

export interface CampaignTemplateOption {
  readonly value: string;
  readonly label: string;
}

/** Las plantillas publicadas que una campaña puede usar: de correo y no obligatorias. */
export async function campaignTemplateOptions(
  actor: ActorContext,
): Promise<UseCaseResult<readonly CampaignTemplateOption[]>> {
  const decision = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().notificationTemplate.findMany({
    where: { channel: 'EMAIL', status: 'PUBLISHED', category: { not: 'GOVERNANCE_MANDATORY' } },
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: { code: true, version: true },
  });
  return ok(filas.map((fila) => ({ value: fila.code, label: `${fila.code} · v${fila.version}` })));
}

export const sendCampaignSchema = z.object({
  templateCode: z.string().trim().min(1),
  legalEntityId: z.uuid(),
  reason: z.string().trim().min(10).max(400),
});
export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Envía una campaña a los miembros activos de una entidad.
 *
 * Rechaza antes de tocar a nadie una plantilla obligatoria: una campaña no envía
 * lo que la persona no puede rechazar. Para cada miembro con correo, si silenció
 * esa clase por correo, queda un intento `SUPPRESSED` y no se envía; si no, se
 * crea la notificación y se encola su correo.
 */
export async function sendCampaign(
  actor: ActorContext,
  input: SendCampaignInput,
): Promise<UseCaseResult<{ audience: number; queued: number; suppressed: number }>> {
  const parsed = sendCampaignSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const { templateCode, legalEntityId, reason } = parsed.data;

  const contexto = { ...actor, reason };
  const decision = can(contexto, 'notifications.campaign.send', { kind: 'NotificationCampaign', legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const template = await db().notificationTemplate.findFirst({
    where: { code: templateCode, channel: 'EMAIL', status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
    select: { id: true, category: true, subject: true, bodyTemplate: true, variables: true },
  });
  if (template === null) {
    return fail(errors.notFound('No hay una plantilla de correo publicada con ese código.'));
  }
  if (isMandatoryCategory(template.category)) {
    return fail(
      errors.ruleViolation(
        'Una campaña no envía avisos obligatorios de gobierno: esos van por su propio flujo, no como difusión.',
        'intento de enviar una campaña con una plantilla de clase obligatoria',
      ),
    );
  }

  const miembros = await db().membership.findMany({
    where: { legalEntityId, status: 'ACTIVE', person: { archivedAt: null } },
    select: { personId: true, person: { select: { givenName: true, primaryEmail: true } } },
    distinct: ['personId'],
  });
  const conCorreo = miembros.filter(
    (m): m is typeof m & { person: { givenName: string; primaryEmail: string } } => m.person.primaryEmail !== null,
  );

  const silenciados = new Set(
    (
      await db().notificationPreference.findMany({
        where: {
          personId: { in: conCorreo.map((m) => m.personId) },
          channel: 'EMAIL',
          category: template.category,
          suppressed: true,
        },
        select: { personId: true },
      })
    ).map((fila) => fila.personId),
  );

  let queued = 0;
  let suppressed = 0;
  for (const miembro of conCorreo) {
    const rendered = render(
      { subject: template.subject, bodyTemplate: template.bodyTemplate, variables: template.variables },
      { givenName: miembro.person.givenName },
      actor.correlationId,
    );
    const suprimido = silenciados.has(miembro.personId);

    const notificacion = await db().notification.create({
      data: {
        personId: miembro.personId,
        templateId: template.id,
        category: template.category,
        title: rendered.subject === '' ? 'Aviso' : rendered.subject,
        body: rendered.body,
        channels: suprimido ? ['IN_APP'] : ['EMAIL', 'IN_APP'],
      },
      select: { id: true },
    });

    if (suprimido) {
      await db().deliveryAttempt.create({
        data: { notificationId: notificacion.id, channel: 'EMAIL', attemptNumber: 1, status: 'SUPPRESSED' },
      });
      suppressed += 1;
    } else {
      await enqueue({
        jobType: 'notification-email',
        businessKey: `campaign:${notificacion.id}`,
        payload: {
          notificationId: notificacion.id,
          to: miembro.person.primaryEmail,
          templateCode,
          variables: { givenName: miembro.person.givenName },
        },
        correlationId: actor.correlationId,
      });
      queued += 1;
    }
  }

  await transaction((tx) =>
    recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NOTIFICATION_CAMPAIGN_SENT,
      objectKind: 'NotificationCampaign',
      objectId: template.id,
      outcome: 'SUCCESS',
      legalEntityId,
      reason,
      metadata: { templateCode, category: template.category, audience: conCorreo.length, queued, suppressed },
    }),
  );

  return ok({ audience: conCorreo.length, queued, suppressed });
}
