import { z } from 'zod';
import type { NotificationCategory, NotificationChannel } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { isMandatoryCategory, NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from '../domain/preferences';

/**
 * Las preferencias de una persona sobre qué avisos quiere y por dónde (PRD §16.2).
 *
 * Como el centro de notificaciones, esto es un derecho de la cuenta: nadie
 * necesita un cargo para decidir qué le llega. La única regla que la persona no
 * manda es la de la fase: **un aviso obligatorio de gobierno no se silencia**. La
 * base lo rechaza con un `CHECK`; aquí se comprueba antes, para responder con un
 * mensaje que se entiende en vez de un error de restricción.
 */

export interface CategoryPreferenceView {
  readonly category: NotificationCategory;
  readonly mandatory: boolean;
  readonly inAppSuppressed: boolean;
  readonly webPushSuppressed: boolean;
}

/** El estado de las preferencias de la persona, clase por clase y por canal. */
export async function myNotificationPreferences(
  actor: ActorContext,
): Promise<UseCaseResult<{ categories: CategoryPreferenceView[]; webPushSubscribed: boolean }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const [silenciadasCentro, silenciadasWeb, persona] = await Promise.all([
    suppressedSet(actor.personId, 'IN_APP'),
    suppressedSet(actor.personId, 'WEB_PUSH'),
    db().person.findUnique({ where: { id: actor.personId }, select: { webPushSubscriptions: true } }),
  ]);
  const categories = NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    mandatory: isMandatoryCategory(category),
    inAppSuppressed: silenciadasCentro.has(category),
    webPushSuppressed: silenciadasWeb.has(category),
  }));
  const suscripciones = persona?.webPushSubscriptions;
  const webPushSubscribed = Array.isArray(suscripciones) && suscripciones.length > 0;
  return ok({ categories, webPushSubscribed });
}

export const setNotificationPreferencesSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  entries: z
    .array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), suppressed: z.boolean() }))
    .min(1),
});
export type SetNotificationPreferencesInput = z.infer<typeof setNotificationPreferencesSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

async function suppressedSet(personId: string, channel: NotificationChannel): Promise<Set<NotificationCategory>> {
  const filas = await db().notificationPreference.findMany({
    where: { personId, channel, suppressed: true },
    select: { category: true },
  });
  return new Set(filas.map((fila) => fila.category));
}

/**
 * Fija las preferencias de la persona sobre un canal, clase por clase.
 *
 * Silenciar una clase obligatoria se rechaza antes de tocar la base. De lo
 * demás, solo se escribe lo que cambia —una preferencia que ya estaba así no
 * genera ni escritura ni bitácora—, y el cambio queda registrado: alterar lo que
 * la organización puede o no puede enviarte es una decisión que se guarda.
 */
export async function setNotificationPreferences(
  actor: ActorContext,
  input: SetNotificationPreferencesInput,
): Promise<UseCaseResult<{ changed: number }>> {
  if (actor.personId === null) return fail(errors.unauthenticated());

  const parsed = setNotificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const { channel, entries } = parsed.data;

  const obligatoriaSilenciada = entries.find((entry) => entry.suppressed && isMandatoryCategory(entry.category));
  if (obligatoriaSilenciada !== undefined) {
    return fail(
      errors.ruleViolation(
        'Los avisos obligatorios de gobierno no se pueden silenciar: son la vía por la que la organización te informa de lo que te obliga.',
        'intento de suprimir una categoría de aviso obligatoria',
      ),
    );
  }

  const personId = actor.personId;
  const changed = await transaction(async (tx) => {
    const actuales = new Set(
      (
        await tx.notificationPreference.findMany({
          where: { personId, channel, suppressed: true },
          select: { category: true },
        })
      ).map((fila) => fila.category),
    );

    const cambios: Array<{ category: NotificationCategory; suppressed: boolean }> = [];
    for (const { category, suppressed } of entries) {
      if (actuales.has(category) === suppressed) continue;
      await tx.notificationPreference.upsert({
        where: { personId_category_channel: { personId, category, channel } },
        create: { personId, category, channel, suppressed, createdByActorId: actor.actorId },
        update: { suppressed, rowVersion: { increment: 1 } },
        select: { id: true },
      });
      cambios.push({ category, suppressed });
    }

    if (cambios.length > 0) {
      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.NOTIFICATION_PREFERENCE_SET,
        objectKind: 'NotificationPreference',
        objectId: personId,
        outcome: 'SUCCESS',
        onBehalfOfPersonId: personId,
        reason: 'la persona ajustó qué avisos quiere recibir',
        metadata: { channel, cambios },
      });
    }
    return cambios.length;
  });

  return ok({ changed });
}
