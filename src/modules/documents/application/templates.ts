import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { DocumentKind, DocumentTemplateStatus } from '@prisma-client/enums';
import {
  CODIGO_DE_PLANTILLA,
  NOMBRE_DE_VARIABLE,
  variablesDeclaradas,
  variablesUsadas,
} from '../domain/templates';

export { variablesDeclaradas, variablesUsadas } from '../domain/templates';

/**
 * Plantillas versionadas de documento institucional (PRD §16.2; F5-DOC).
 *
 * **Una plantilla publicada no se edita.** Se publica una versión nueva. Lo que
 * un acta dice tiene que poder reconstruirse años después con la plantilla
 * exacta que la produjo, y una plantilla mutable convierte cada documento
 * emitido en una afirmación sin respaldo.
 *
 * **Las variables se declaran.** Publicar comprueba que toda variable usada en
 * el cuerpo esté declarada, y que toda variable declarada se use. La primera
 * mitad evita documentos con huecos; la segunda evita creer que un dato viaja al
 * documento cuando en realidad se descarta al emitir.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const draftTemplateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO_DE_PLANTILLA, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: ACTA_ASAMBLEA.',
  }),
  name: z.string().trim().min(3).max(160),
  kind: z.enum([
    'MEMBERSHIP_RESOLUTION',
    'CREDENTIAL',
    'ASSEMBLY_MINUTES',
    'CALL_NOTICE',
    'ELECTION_RESULT',
    'DISCIPLINARY_DECISION',
    'POWER_GRANT',
    'RECEIPT',
    'CERTIFICATE',
    'ATTENDANCE_CONSTANCY',
    'REPORT',
  ]),
  legalEntityId: z.uuid(),
  bodyTemplate: z.string().min(20).max(200_000),
  variables: z.array(z.string().trim().regex(NOMBRE_DE_VARIABLE)).max(80),
  numberingSeries: z.string().trim().max(40).nullable().default(null),
});

export type DraftTemplateInput = z.infer<typeof draftTemplateSchema>;

/**
 * Redacta una versión nueva de una plantilla.
 *
 * La versión es el consecutivo del código, calculado bajo cerrojo: dos
 * redacciones simultáneas del mismo código no pueden reclamar el mismo número.
 */
export async function draftTemplate(
  actor: ActorContext,
  input: DraftTemplateInput,
): Promise<UseCaseResult<{ templateId: string; version: number }>> {
  const parsed = draftTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'documents.template.manage', { kind: 'DocumentTemplate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const creada = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plantilla:${data.code}`}))`;
    const ultima = await tx.documentTemplate.findFirst({
      where: { code: data.code },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (ultima?.version ?? 0) + 1;

    const fila = await tx.documentTemplate.create({
      data: {
        code: data.code,
        version,
        legalEntityId: data.legalEntityId,
        name: data.name,
        kind: data.kind,
        bodyTemplate: data.bodyTemplate,
        variables: data.variables,
        numberingSeries: data.numberingSeries,
        status: 'DRAFT',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_DRAFTED,
      objectKind: 'DocumentTemplate',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: { code: data.code, version: fila.version, kind: data.kind },
    });

    return fila;
  });

  return ok({ templateId: creada.id, version: creada.version });
}

export const publishTemplateSchema = z.object({ templateId: z.uuid() });

/**
 * Publica una plantilla y retira la versión anterior del mismo código.
 *
 * No pueden convivir dos versiones publicadas del mismo código: emitir tomaría
 * una de las dos sin que nadie pudiera decir cuál.
 */
export async function publishTemplate(
  actor: ActorContext,
  input: { readonly templateId: string },
): Promise<UseCaseResult<{ code: string; version: number; retiredVersion: number | null }>> {
  const parsed = publishTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'documents.template.manage', { kind: 'DocumentTemplate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const plantilla = await db().documentTemplate.findUnique({
    where: { id: parsed.data.templateId },
    select: {
      id: true,
      code: true,
      version: true,
      status: true,
      bodyTemplate: true,
      variables: true,
      legalEntityId: true,
    },
  });
  if (plantilla === null) return fail(errors.notFound('Esa plantilla no existe.'));
  if (plantilla.status !== 'DRAFT') {
    return fail(errors.conflict('Esa versión ya no es un borrador. Redacta una versión nueva.'));
  }

  const usadas = variablesUsadas(plantilla.bodyTemplate);
  const declaradas = variablesDeclaradas(plantilla.variables);
  const sinDeclarar = usadas.filter((nombre) => !declaradas.includes(nombre));
  const sinUsar = declaradas.filter((nombre) => !usadas.includes(nombre));

  if (sinDeclarar.length > 0) {
    return fail(
      errors.validation({
        bodyTemplate: [
          `El cuerpo usa variables que no están declaradas: ${sinDeclarar.join(', ')}. Un documento emitido con ellas saldría con huecos.`,
        ],
      }),
    );
  }
  if (sinUsar.length > 0) {
    return fail(
      errors.validation({
        variables: [
          `Se declaran variables que el cuerpo no usa: ${sinUsar.join(', ')}. Quien emita creería que ese dato llega al documento.`,
        ],
      }),
    );
  }

  const anterior = await db().documentTemplate.findFirst({
    where: { code: plantilla.code, status: 'PUBLISHED' },
    select: { id: true, version: true },
  });

  await transaction(async (tx) => {
    if (anterior !== null) {
      await tx.documentTemplate.update({
        where: { id: anterior.id },
        data: { status: 'RETIRED', updatedByActorId: actor.actorId },
      });
    }

    await tx.documentTemplate.update({
      where: { id: plantilla.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: actor.userId,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_PUBLISHED,
      objectKind: 'DocumentTemplate',
      objectId: plantilla.id,
      outcome: 'SUCCESS',
      legalEntityId: plantilla.legalEntityId,
      metadata: { code: plantilla.code, version: plantilla.version, retira: anterior?.version ?? null },
    });
  });

  return ok({ code: plantilla.code, version: plantilla.version, retiredVersion: anterior?.version ?? null });
}

export const retireTemplateSchema = z.object({
  templateId: z.uuid(),
  reason: z.string().trim().min(10).max(400),
});

export async function retireTemplate(
  actor: ActorContext,
  input: z.infer<typeof retireTemplateSchema>,
): Promise<UseCaseResult<{ retired: true }>> {
  const parsed = retireTemplateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const contexto = { ...actor, reason: parsed.data.reason };
  const decision = can(contexto, 'documents.template.manage', { kind: 'DocumentTemplate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const plantilla = await db().documentTemplate.findUnique({
    where: { id: parsed.data.templateId },
    select: { id: true, code: true, version: true, status: true, legalEntityId: true },
  });
  if (plantilla === null) return fail(errors.notFound('Esa plantilla no existe.'));
  if (plantilla.status === 'RETIRED') return fail(errors.conflict('Esa versión ya estaba retirada.'));

  await transaction(async (tx) => {
    await tx.documentTemplate.update({
      where: { id: plantilla.id },
      data: { status: 'RETIRED', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_RETIRED,
      objectKind: 'DocumentTemplate',
      objectId: plantilla.id,
      outcome: 'SUCCESS',
      legalEntityId: plantilla.legalEntityId,
      reason: parsed.data.reason,
      metadata: { code: plantilla.code, version: plantilla.version },
    });
  });

  return ok({ retired: true });
}

export interface TemplateRow {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly name: string;
  readonly kind: DocumentKind;
  readonly status: DocumentTemplateStatus;
  readonly variables: readonly string[];
  readonly numberingSeries: string | null;
  readonly issuedCount: number;
}

export async function templateList(actor: ActorContext): Promise<UseCaseResult<readonly TemplateRow[]>> {
  const decision = can(actor, 'documents.template.manage', { kind: 'DocumentTemplate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().documentTemplate.findMany({
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      code: true,
      version: true,
      name: true,
      kind: true,
      status: true,
      variables: true,
      numberingSeries: true,
      _count: { select: { documents: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      version: fila.version,
      name: fila.name,
      kind: fila.kind,
      status: fila.status,
      variables: variablesDeclaradas(fila.variables),
      numberingSeries: fila.numberingSeries,
      issuedCount: fila._count.documents,
    })),
  );
}

export interface TemplateOption {
  readonly value: string;
  readonly label: string;
  readonly variables: readonly string[];
}

/**
 * Plantillas publicadas de un tipo, para elegir con qué se emite.
 *
 * Devuelve también las variables declaradas: quien emite necesita saber qué
 * datos va a pedirle la plantilla antes de elegirla.
 */
export async function publishedTemplateOptions(
  actor: ActorContext,
  kind: DocumentKind,
): Promise<UseCaseResult<readonly TemplateOption[]>> {
  const decision = can(actor, 'documents.document.issue', { kind: 'DocumentTemplate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().documentTemplate.findMany({
    where: { kind, status: 'PUBLISHED' },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, version: true, variables: true },
  });

  return ok(
    filas.map((fila) => ({
      value: fila.code,
      label: `${fila.name} · ${fila.code} v${fila.version}`,
      variables: variablesDeclaradas(fila.variables),
    })),
  );
}
