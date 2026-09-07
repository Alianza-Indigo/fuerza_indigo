import { z } from 'zod';
import type { NotificationCategory, NotificationChannel, TemplateStatus } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from '../domain/preferences';
import { CODIGO_DE_PLANTILLA, NOMBRE_DE_VARIABLE, variablesDeclaradas, variablesUsadas } from '../domain/templates';

/**
 * Plantillas versionadas de aviso (PRD §16.2, §24 Fase 9 criterio 2).
 *
 * **Una plantilla publicada no se edita.** Se publica una versión nueva. Un aviso
 * enviado tiene que poder explicarse con la plantilla exacta que lo produjo, y
 * una plantilla mutable convertiría cada aviso en un texto sin respaldo.
 *
 * **Redactar y publicar son actos distintos.** Redacta Prensa; publica la
 * Secretaría, que es la revisión. Publicar pone un texto en boca de la
 * organización para muchas personas, así que es el acto que lleva motivo.
 *
 * **Las variables se declaran.** Publicar comprueba que toda variable usada en el
 * asunto o el cuerpo esté declarada, y que toda declarada se use: ni huecos ni
 * datos que se creen enviados y se descarten.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const draftNotificationTemplateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO_DE_PLANTILLA, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: EVENTO_INSCRIPCION.',
  }),
  channel: z.enum(NOTIFICATION_CHANNELS),
  category: z.enum(NOTIFICATION_CATEGORIES),
  locale: z.string().trim().min(2).max(10).default('es-MX'),
  subject: z.string().trim().max(300).nullable().default(null),
  bodyTemplate: z.string().min(1).max(20_000),
  variables: z.array(z.string().trim().regex(NOMBRE_DE_VARIABLE)).max(80).default([]),
});
export type DraftNotificationTemplateInput = z.infer<typeof draftNotificationTemplateSchema>;

/**
 * Redacta una versión nueva de una plantilla.
 *
 * La versión es el consecutivo del código, canal y locale, calculado bajo
 * cerrojo: dos redacciones simultáneas no pueden reclamar el mismo número.
 */
export async function draftNotificationTemplate(
  actor: ActorContext,
  input: DraftNotificationTemplateInput,
): Promise<UseCaseResult<{ templateId: string; version: number }>> {
  const parsed = draftNotificationTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const creada = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`aviso:${data.code}:${data.channel}:${data.locale}`}))`;
    const ultima = await tx.notificationTemplate.findFirst({
      where: { code: data.code, channel: data.channel, locale: data.locale },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (ultima?.version ?? 0) + 1;

    const fila = await tx.notificationTemplate.create({
      data: {
        code: data.code,
        version,
        channel: data.channel,
        category: data.category,
        locale: data.locale,
        subject: data.subject,
        bodyTemplate: data.bodyTemplate,
        variables: data.variables,
        status: 'DRAFT',
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_DRAFTED,
      objectKind: 'NotificationTemplate',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: { code: data.code, version: fila.version, channel: data.channel, category: data.category },
    });
    return fila;
  });

  return ok({ templateId: creada.id, version: creada.version });
}

export const publishNotificationTemplateSchema = z.object({
  templateId: z.uuid(),
  reason: z.string().trim().min(10).max(400),
});

/**
 * Publica una plantilla y retira la versión anterior del mismo código, canal y
 * locale. No pueden convivir dos publicadas: enviar tomaría una sin que nadie
 * pudiera decir cuál.
 */
export async function publishNotificationTemplate(
  actor: ActorContext,
  input: z.infer<typeof publishNotificationTemplateSchema>,
): Promise<UseCaseResult<{ code: string; version: number; retiredVersion: number | null }>> {
  const parsed = publishNotificationTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto = { ...actor, reason: parsed.data.reason };
  const decision = can(contexto, 'notifications.template.publish', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const plantilla = await db().notificationTemplate.findUnique({
    where: { id: parsed.data.templateId },
    select: {
      id: true,
      code: true,
      version: true,
      channel: true,
      locale: true,
      status: true,
      subject: true,
      bodyTemplate: true,
      variables: true,
    },
  });
  if (plantilla === null) return fail(errors.notFound('Esa plantilla no existe.'));
  if (plantilla.status !== 'DRAFT') {
    return fail(errors.conflict('Esa versión ya no es un borrador. Redacta una versión nueva.'));
  }

  const usadas = variablesUsadas(plantilla.subject, plantilla.bodyTemplate);
  const declaradas = variablesDeclaradas(plantilla.variables);
  const sinDeclarar = usadas.filter((nombre) => !declaradas.includes(nombre));
  const sinUsar = declaradas.filter((nombre) => !usadas.includes(nombre));

  if (sinDeclarar.length > 0) {
    return fail(
      errors.validation({
        bodyTemplate: [
          `El aviso usa variables que no están declaradas: ${sinDeclarar.join(', ')}. Saldría con huecos.`,
        ],
      }),
    );
  }
  if (sinUsar.length > 0) {
    return fail(
      errors.validation({
        variables: [
          `Se declaran variables que el aviso no usa: ${sinUsar.join(', ')}. Quien envíe creería que ese dato llega.`,
        ],
      }),
    );
  }

  const anterior = await db().notificationTemplate.findFirst({
    where: { code: plantilla.code, channel: plantilla.channel, locale: plantilla.locale, status: 'PUBLISHED' },
    select: { id: true, version: true },
  });

  await transaction(async (tx) => {
    if (anterior !== null) {
      await tx.notificationTemplate.update({ where: { id: anterior.id }, data: { status: 'RETIRED' } });
    }
    await tx.notificationTemplate.update({
      where: { id: plantilla.id },
      data: { status: 'PUBLISHED', publishedById: actor.actorId },
    });
    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_PUBLISHED,
      objectKind: 'NotificationTemplate',
      objectId: plantilla.id,
      outcome: 'SUCCESS',
      reason: parsed.data.reason,
      metadata: { code: plantilla.code, version: plantilla.version, retira: anterior?.version ?? null },
    });
  });

  return ok({ code: plantilla.code, version: plantilla.version, retiredVersion: anterior?.version ?? null });
}

export const retireNotificationTemplateSchema = z.object({
  templateId: z.uuid(),
  reason: z.string().trim().min(10).max(400),
});

export async function retireNotificationTemplate(
  actor: ActorContext,
  input: z.infer<typeof retireNotificationTemplateSchema>,
): Promise<UseCaseResult<{ retired: true }>> {
  const parsed = retireNotificationTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto = { ...actor, reason: parsed.data.reason };
  const decision = can(contexto, 'notifications.template.publish', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const plantilla = await db().notificationTemplate.findUnique({
    where: { id: parsed.data.templateId },
    select: { id: true, code: true, version: true, status: true },
  });
  if (plantilla === null) return fail(errors.notFound('Esa plantilla no existe.'));
  if (plantilla.status === 'RETIRED') return fail(errors.conflict('Esa versión ya estaba retirada.'));

  await transaction(async (tx) => {
    await tx.notificationTemplate.update({ where: { id: plantilla.id }, data: { status: 'RETIRED' } });
    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_RETIRED,
      objectKind: 'NotificationTemplate',
      objectId: plantilla.id,
      outcome: 'SUCCESS',
      reason: parsed.data.reason,
      metadata: { code: plantilla.code, version: plantilla.version },
    });
  });

  return ok({ retired: true });
}

export interface NotificationTemplateRow {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly channel: NotificationChannel;
  readonly category: NotificationCategory;
  readonly locale: string;
  readonly subject: string | null;
  readonly bodyTemplate: string;
  readonly variables: readonly string[];
  readonly status: TemplateStatus;
}

/** Una plantilla por su identificador, para la pantalla de detalle. */
export async function notificationTemplateDetail(
  actor: ActorContext,
  templateId: string,
): Promise<UseCaseResult<NotificationTemplateRow>> {
  const decision = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fila = await db().notificationTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      code: true,
      version: true,
      channel: true,
      category: true,
      locale: true,
      subject: true,
      bodyTemplate: true,
      variables: true,
      status: true,
    },
  });
  if (fila === null) return fail(errors.notFound('Esa plantilla no existe.'));

  return ok({
    id: fila.id,
    code: fila.code,
    version: fila.version,
    channel: fila.channel,
    category: fila.category,
    locale: fila.locale,
    subject: fila.subject,
    bodyTemplate: fila.bodyTemplate,
    variables: variablesDeclaradas(fila.variables),
    status: fila.status,
  });
}

/** Todas las plantillas, agrupadas por código y de la más nueva a la más vieja. */
export async function notificationTemplateList(
  actor: ActorContext,
): Promise<UseCaseResult<readonly NotificationTemplateRow[]>> {
  const decision = can(actor, 'notifications.template.author', { kind: 'NotificationTemplate', legalEntityId: null });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().notificationTemplate.findMany({
    orderBy: [{ code: 'asc' }, { channel: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      code: true,
      version: true,
      channel: true,
      category: true,
      locale: true,
      subject: true,
      bodyTemplate: true,
      variables: true,
      status: true,
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      version: fila.version,
      channel: fila.channel,
      category: fila.category,
      locale: fila.locale,
      subject: fila.subject,
      bodyTemplate: fila.bodyTemplate,
      variables: variablesDeclaradas(fila.variables),
      status: fila.status,
    })),
  );
}
