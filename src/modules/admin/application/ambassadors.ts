import { z } from 'zod';

import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { recordAudit } from '@/platform/audit/audit-service';
import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';

const ESTADOS = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(maximum).optional(),
  );

export const createIndigoAmbassadorSchema = z.object({
  givenName: z.string().trim().min(1, 'Escribe el nombre.').max(80),
  familyName: z.string().trim().min(1, 'Escribe el primer apellido.').max(80),
  secondFamilyName: optionalText(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.').max(320)),
  phone: optionalText(40),
  territory: optionalText(160),
  notes: optionalText(2000),
});

export const updateIndigoAmbassadorSchema = createIndigoAmbassadorSchema.extend({
  ambassadorId: z.uuid('El registro de embajador no es válido.'),
  rowVersion: z.number().int().nonnegative(),
  status: z.enum(ESTADOS),
  reason: z.string().trim().min(10, 'Explica brevemente el motivo del cambio.').max(1000),
});

export type CreateIndigoAmbassadorInput = z.input<typeof createIndigoAmbassadorSchema>;
export type UpdateIndigoAmbassadorInput = z.input<typeof updateIndigoAmbassadorSchema>;

export interface IndigoAmbassadorView {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly secondFamilyName: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly territory: string | null;
  readonly notes: string | null;
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  readonly applicationCount: number;
  readonly beneficiaryCount: number;
  readonly totalRegistrations: number;
  readonly createdAt: Date;
  readonly rowVersion: number;
}

export interface PublicIndigoAmbassador {
  readonly code: string;
  readonly displayName: string;
}

function validationDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) (details[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return details;
}

function rootOnly(actor: ActorContext): UseCaseResult<true> {
  return actor.actorKind === 'ROOT_SUPERADMIN'
    ? ok(true)
    : fail(errors.forbidden('El padrón de Embajadores Índigo pertenece exclusivamente al Superadmin.'));
}

function displayName(row: {
  givenName: string;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [row.givenName, row.familyName, row.secondFamilyName].filter(Boolean).join(' ');
}

function toView(row: {
  id: string;
  code: string;
  givenName: string;
  familyName: string;
  secondFamilyName: string | null;
  email: string;
  phone: string | null;
  territory: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  createdAt: Date;
  rowVersion: number;
  _count: { applications: number; beneficiaries: number };
}): IndigoAmbassadorView {
  const applicationCount = row._count.applications;
  const beneficiaryCount = row._count.beneficiaries;
  return {
    id: row.id,
    code: row.code,
    displayName: displayName(row),
    givenName: row.givenName,
    familyName: row.familyName,
    secondFamilyName: row.secondFamilyName,
    email: row.email,
    phone: row.phone,
    territory: row.territory,
    notes: row.notes,
    status: row.status,
    applicationCount,
    beneficiaryCount,
    totalRegistrations: applicationCount + beneficiaryCount,
    createdAt: row.createdAt,
    rowVersion: row.rowVersion,
  };
}

const VIEW_SELECT = {
  id: true,
  code: true,
  givenName: true,
  familyName: true,
  secondFamilyName: true,
  email: true,
  phone: true,
  territory: true,
  notes: true,
  status: true,
  createdAt: true,
  rowVersion: true,
  _count: { select: { applications: true, beneficiaries: true } },
} as const;

async function nextCode(tx: Tx): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fuerza-indigo:ambassador-code'))`;
  const used = await tx.indigoAmbassador.count();
  return `FI-EMB-${String(used + 1).padStart(5, '0')}`;
}

export async function listIndigoAmbassadors(
  actor: ActorContext,
): Promise<UseCaseResult<IndigoAmbassadorView[]>> {
  const allowed = rootOnly(actor);
  if (!allowed.ok) return allowed;

  const rows = await db().indigoAmbassador.findMany({
    orderBy: [{ status: 'asc' }, { familyName: 'asc' }, { givenName: 'asc' }],
    select: VIEW_SELECT,
  });
  return ok(rows.map(toView));
}

export async function getIndigoAmbassador(
  actor: ActorContext,
  ambassadorId: string,
): Promise<UseCaseResult<IndigoAmbassadorView>> {
  const allowed = rootOnly(actor);
  if (!allowed.ok) return allowed;
  const parsed = z.uuid().safeParse(ambassadorId);
  if (!parsed.success) return fail(errors.notFound('identificador de embajador inválido'));

  const row = await db().indigoAmbassador.findUnique({ where: { id: parsed.data }, select: VIEW_SELECT });
  return row === null ? fail(errors.notFound('embajador inexistente')) : ok(toView(row));
}

export async function createIndigoAmbassador(
  actor: ActorContext,
  input: CreateIndigoAmbassadorInput,
): Promise<UseCaseResult<{ ambassadorId: string; code: string }>> {
  const allowed = rootOnly(actor);
  if (!allowed.ok) return allowed;
  const parsed = createIndigoAmbassadorSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(validationDetails(parsed.error)));

  const existing = await db().indigoAmbassador.findUnique({
    where: { email: parsed.data.email },
    select: { code: true },
  });
  if (existing !== null) {
    return fail(errors.conflict(`Ese correo ya pertenece al embajador ${existing.code}.`));
  }

  const created = await transaction(async (tx) => {
    const code = await nextCode(tx);
    const row = await tx.indigoAmbassador.create({
      data: {
        code,
        givenName: parsed.data.givenName,
        familyName: parsed.data.familyName,
        secondFamilyName: parsed.data.secondFamilyName ?? null,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        territory: parsed.data.territory ?? null,
        notes: parsed.data.notes ?? null,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, code: true },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.INDIGO_AMBASSADOR_CREATED,
      objectKind: 'IndigoAmbassador',
      objectId: row.id,
      outcome: 'SUCCESS',
      metadata: { code: row.code },
    });
    return row;
  });

  return ok({ ambassadorId: created.id, code: created.code });
}

export async function updateIndigoAmbassador(
  actor: ActorContext,
  input: UpdateIndigoAmbassadorInput,
): Promise<UseCaseResult<{ ambassadorId: string }>> {
  const allowed = rootOnly(actor);
  if (!allowed.ok) return allowed;
  const parsed = updateIndigoAmbassadorSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(validationDetails(parsed.error)));
  const data = parsed.data;

  const duplicate = await db().indigoAmbassador.findFirst({
    where: { email: data.email, id: { not: data.ambassadorId } },
    select: { code: true },
  });
  if (duplicate !== null) return fail(errors.conflict(`Ese correo ya pertenece al embajador ${duplicate.code}.`));

  const changed = await transaction(async (tx) => {
    const updated = await tx.indigoAmbassador.updateMany({
      where: { id: data.ambassadorId, rowVersion: data.rowVersion },
      data: {
        givenName: data.givenName,
        familyName: data.familyName,
        secondFamilyName: data.secondFamilyName ?? null,
        email: data.email,
        phone: data.phone ?? null,
        territory: data.territory ?? null,
        notes: data.notes ?? null,
        status: data.status,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) return false;
    await recordAudit(tx, { ...actor, reason: data.reason }, {
      action: AUDIT_ACTIONS.INDIGO_AMBASSADOR_UPDATED,
      objectKind: 'IndigoAmbassador',
      objectId: data.ambassadorId,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: { status: data.status },
    });
    return true;
  });

  if (!changed) {
    return fail(errors.conflict('El registro cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.'));
  }
  return ok({ ambassadorId: data.ambassadorId });
}

/** Ficha mínima y pública detrás del enlace personal del embajador. */
export async function publicIndigoAmbassador(code: string): Promise<PublicIndigoAmbassador | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^FI-EMB-\d{5}$/.test(normalized)) return null;
  const row = await db().indigoAmbassador.findFirst({
    where: { code: normalized, status: 'ACTIVE' },
    select: { code: true, givenName: true, familyName: true, secondFamilyName: true },
  });
  return row === null ? null : { code: row.code, displayName: displayName(row) };
}
