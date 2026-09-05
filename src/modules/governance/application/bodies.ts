import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { OfficeKind, UnionBodyKind, UnionBodyStatus } from '@prisma-client/enums';

/**
 * Órganos de gobierno y cargos (PRD §9.2, §9.3; F5-GOB-001, F5-GOB-004).
 *
 * Dos decisiones gobiernan este archivo.
 *
 * **Un cargo concede permisos, no un rol entero.** `OfficeDefinition` lleva su
 * conjunto de permisos en una tabla, y el rol base que la ocupación otorga es
 * una columna aparte. La matriz por cartera de `docs/PERMISSIONS.md` §4.1 se
 * lee de la base, no de una lista escrita en código: una cartera nueva se
 * define desde la pantalla y su alcance se ve, en vez de pedirse por correo.
 *
 * **La incompatibilidad se guarda una vez.** Es simétrica —si A es incompatible
 * con B, B lo es con A—, y guardarla dos veces permite que una de las dos filas
 * se borre y la regla quede a medias. Se guarda con el identificador menor
 * primero, y lo impone la base con un `CHECK`.
 */

const CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;

export const createUnionBodySchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: CEN_NACIONAL.',
  }),
  name: z.string().trim().min(3).max(160),
  kind: z.enum([
    'GENERAL_ASSEMBLY',
    'NATIONAL_EXECUTIVE_COMMITTEE',
    'OVERSIGHT_COMMISSION',
    'ELECTORAL_COMMISSION',
    'SECTION_DELEGATION',
    'TEMPORARY_COMMISSION',
  ]),
  territorialUnitId: z.uuid({ error: () => 'Elige la unidad territorial donde vive el órgano.' }),
  legalEntityId: z.uuid({ error: () => 'Elige la entidad jurídica responsable.' }),
  installedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2026-01-01.' })
    .nullable()
    .default(null),
});

export type CreateUnionBodyInput = z.infer<typeof createUnionBodySchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Versión normativa vigente. Todo acto institucional se ata a una. */
export async function reglasVigentes(): Promise<{ id: string; version: string; rules: unknown } | null> {
  const fila = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true, rules: true },
  });
  return fila;
}

export async function createUnionBody(
  actor: ActorContext,
  input: CreateUnionBodyInput,
): Promise<UseCaseResult<{ unionBodyId: string }>> {
  const parsed = createUnionBodySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'governance.body.manage', { kind: 'UnionBody' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const reglas = await reglasVigentes();
  if (reglas === null) {
    return fail(
      errors.conflict(
        'No hay una versión de reglas estatutarias en vigor. Un órgano se instala conforme a un estatuto, no en el aire.',
      ),
    );
  }

  const duplicado = await db().unionBody.findUnique({ where: { code: data.code }, select: { id: true } });
  if (duplicado !== null) return fail(errors.conflict('Ya existe un órgano con ese código.'));

  const unionBodyId = await transaction(async (tx) => {
    const creado = await tx.unionBody.create({
      data: {
        code: data.code,
        name: data.name,
        kind: data.kind,
        territorialUnitId: data.territorialUnitId,
        legalEntityId: data.legalEntityId,
        normativeRuleSetId: reglas.id,
        ...(data.installedOn === null ? {} : { installedOn: new Date(`${data.installedOn}T00:00:00.000Z`) }),
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.UNION_BODY_CREATED,
      objectKind: 'UnionBody',
      objectId: creado.id,
      outcome: 'SUCCESS',
      metadata: { code: data.code, kind: data.kind, normativeVersion: reglas.version },
    });

    return creado.id;
  });

  return ok({ unionBodyId });
}

export const defineOfficeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODIGO, {
    error: () => 'El código lleva mayúsculas, números y guiones bajos. Por ejemplo: SECRETARIA_GENERAL.',
  }),
  name: z.string().trim().min(3).max(160),
  unionBodyId: z.uuid(),
  kind: z.enum([
    'SECRETARY_GENERAL',
    'SECRETARY_ORGANIZATION',
    'SECRETARY_LABOR_DISPUTES',
    'SECRETARY_FINANCE',
    'SECRETARY_MINUTES',
    'SECRETARY_NEUROINCLUSION',
    'SECRETARY_GENDER_EQUITY',
    'SECRETARY_PRESS',
    'ADDITIONAL_SECRETARY',
    'OVERSIGHT_MEMBER',
    'ELECTORAL_MEMBER',
    'SECTION_DELEGATE',
    'COMMISSION_MEMBER',
  ]),
  termMonths: z.coerce
    .number()
    .int({ error: () => 'El periodo va en meses enteros.' })
    .positive({ error: () => 'Un periodo de cero meses no es un periodo.' })
    .max(240),
  reelectionAllowed: z.boolean().default(false),
  seats: z.coerce.number().int().positive().max(50).default(1),
  grantsRoleCode: z.enum([
    'TERRITORIAL_DELEGATE',
    'EXECUTIVE_SECRETARY',
    'OVERSIGHT_COMMISSION',
    'ELECTORAL_COMMISSION',
  ]),
  /** Facultades que confiere. Sin ninguna, el cargo no abre ninguna puerta. */
  permissionCodes: z.array(z.string().trim().min(3)).min(1, {
    error: () => 'Un cargo sin facultades no es un cargo: elige al menos una.',
  }),
});

export type DefineOfficeInput = z.infer<typeof defineOfficeSchema>;

export async function defineOffice(
  actor: ActorContext,
  input: DefineOfficeInput,
): Promise<UseCaseResult<{ officeDefinitionId: string }>> {
  const parsed = defineOfficeSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'governance.body.manage', { kind: 'OfficeDefinition' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const body = await db().unionBody.findUnique({
    where: { id: data.unionBodyId },
    select: { id: true, normativeRuleSetId: true, status: true },
  });
  if (body === null) return fail(errors.notFound('No existe ese órgano.'));
  if (body.status !== 'ACTIVE') return fail(errors.conflict('Ese órgano no está activo.'));

  const permisos = await db().permission.findMany({
    where: { code: { in: data.permissionCodes } },
    select: { id: true, code: true },
  });
  const encontrados = new Set(permisos.map((p) => p.code));
  const faltantes = data.permissionCodes.filter((code) => !encontrados.has(code));
  if (faltantes.length > 0) {
    return fail(errors.validation({ permissionCodes: [`No existen estas facultades: ${faltantes.join(', ')}.`] }));
  }

  const duplicado = await db().officeDefinition.findUnique({ where: { code: data.code }, select: { id: true } });
  if (duplicado !== null) return fail(errors.conflict('Ya existe un cargo con ese código.'));

  const officeDefinitionId = await transaction(async (tx) => {
    const creado = await tx.officeDefinition.create({
      data: {
        code: data.code,
        name: data.name,
        unionBodyId: data.unionBodyId,
        kind: data.kind,
        termMonths: data.termMonths,
        reelectionAllowed: data.reelectionAllowed,
        seats: data.seats,
        grantsRoleCode: data.grantsRoleCode,
        normativeRuleSetId: body.normativeRuleSetId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.officeDefinitionPermission.createMany({
      data: permisos.map((p) => ({ officeDefinitionId: creado.id, permissionId: p.id })),
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.OFFICE_DEFINED,
      objectKind: 'OfficeDefinition',
      objectId: creado.id,
      outcome: 'SUCCESS',
      metadata: { code: data.code, kind: data.kind, seats: data.seats, permissions: data.permissionCodes.length },
    });

    return creado.id;
  });

  return ok({ officeDefinitionId });
}

export const declareIncompatibilitySchema = z.object({
  officeAId: z.uuid(),
  officeBId: z.uuid(),
  rationale: z.string().trim().min(15, {
    error: () => 'Explica por qué son incompatibles: es lo que leerá quien intente ocupar los dos.',
  }).max(400),
});

/**
 * Declara que dos cargos no pueden ocuparse a la vez.
 *
 * El orden en que llegan da igual: se guardan ordenados. Quien lo declara no
 * tiene que acordarse de cuál va primero, y la base garantiza que no haya dos
 * filas para la misma pareja.
 */
export async function declareIncompatibility(
  actor: ActorContext,
  input: z.infer<typeof declareIncompatibilitySchema>,
): Promise<UseCaseResult<{ incompatibilityId: string }>> {
  const parsed = declareIncompatibilitySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'governance.body.manage', { kind: 'OfficeIncompatibility' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const { officeAId, officeBId, rationale } = parsed.data;
  if (officeAId === officeBId) {
    return fail(errors.validation({ officeBId: ['Un cargo no es incompatible consigo mismo.'] }));
  }

  const [leftId, rightId] = officeAId < officeBId ? [officeAId, officeBId] : [officeBId, officeAId];

  const existen = await db().officeDefinition.count({ where: { id: { in: [leftId, rightId] } } });
  if (existen !== 2) return fail(errors.notFound('Alguno de los dos cargos no existe.'));

  const yaEsta = await db().officeIncompatibility.findUnique({
    where: { leftId_rightId: { leftId, rightId } },
    select: { id: true },
  });
  if (yaEsta !== null) return fail(errors.conflict('Esa incompatibilidad ya está declarada.'));

  const incompatibilityId = await transaction(async (tx) => {
    const creada = await tx.officeIncompatibility.create({
      data: { leftId, rightId, rationale, createdByActorId: actor.actorId, updatedByActorId: actor.actorId },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.UNION_BODY_UPDATED,
      objectKind: 'OfficeIncompatibility',
      objectId: creada.id,
      outcome: 'SUCCESS',
      metadata: { leftId, rightId },
    });
    return creada.id;
  });

  return ok({ incompatibilityId });
}

/**
 * Cargos con los que uno es incompatible. Consulta simétrica: da igual por qué
 * lado se pregunte.
 */
export async function incompatibleOffices(officeDefinitionId: string): Promise<readonly string[]> {
  const filas = await db().officeIncompatibility.findMany({
    where: { OR: [{ leftId: officeDefinitionId }, { rightId: officeDefinitionId }] },
    select: { leftId: true, rightId: true },
  });
  return filas.map((f) => (f.leftId === officeDefinitionId ? f.rightId : f.leftId));
}

export interface UnionBodyRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: UnionBodyKind;
  readonly status: UnionBodyStatus;
  readonly territory: string;
  readonly legalEntity: string;
  readonly officeCount: number;
  readonly filledSeats: number;
}

export async function unionBodyList(actor: ActorContext): Promise<UseCaseResult<readonly UnionBodyRow[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'UnionBody' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().unionBody.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      status: true,
      territorialUnit: { select: { name: true } },
      legalEntity: { select: { shortName: true } },
      offices: {
        select: {
          id: true,
          _count: { select: { terms: true } },
          terms: { where: { endsOn: { gte: ahora }, endedEarlyOn: null }, select: { id: true } },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      name: fila.name,
      kind: fila.kind,
      status: fila.status,
      territory: fila.territorialUnit.name,
      legalEntity: fila.legalEntity.shortName,
      officeCount: fila.offices.length,
      filledSeats: fila.offices.reduce((suma, oficina) => suma + oficina.terms.length, 0),
    })),
  );
}

export interface OfficeRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: OfficeKind;
  readonly bodyName: string;
  readonly termMonths: number;
  readonly seats: number;
  readonly occupiedSeats: number;
  readonly reelectionAllowed: boolean;
  readonly permissionCodes: readonly string[];
  readonly incompatibleWith: readonly string[];
}

export async function officeList(
  actor: ActorContext,
  filters: { readonly unionBodyId?: string } = {},
): Promise<UseCaseResult<readonly OfficeRow[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'OfficeDefinition' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().officeDefinition.findMany({
    where: filters.unionBodyId === undefined ? {} : { unionBodyId: filters.unionBodyId },
    orderBy: [{ unionBody: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      termMonths: true,
      seats: true,
      reelectionAllowed: true,
      unionBody: { select: { name: true } },
      permissions: { select: { permission: { select: { code: true } } } },
      terms: { where: { endsOn: { gte: ahora }, endedEarlyOn: null }, select: { id: true } },
      incompatibleWith: { select: { right: { select: { name: true } } } },
      incompatibleFrom: { select: { left: { select: { name: true } } } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      code: fila.code,
      name: fila.name,
      kind: fila.kind,
      bodyName: fila.unionBody.name,
      termMonths: fila.termMonths,
      seats: fila.seats,
      occupiedSeats: fila.terms.length,
      reelectionAllowed: fila.reelectionAllowed,
      permissionCodes: fila.permissions.map((p) => p.permission.code),
      incompatibleWith: [
        ...fila.incompatibleWith.map((i) => i.right.name),
        ...fila.incompatibleFrom.map((i) => i.left.name),
      ],
    })),
  );
}
