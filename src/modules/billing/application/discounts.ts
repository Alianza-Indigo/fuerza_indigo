import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { parseAmountToMinor } from '@/platform/i18n';
import type { DiscountKind, ScholarshipProgram } from '@prisma-client/enums';

/**
 * Descuentos, becas y exenciones (PRD §11.3, F3-PAG-006).
 *
 * Las tres cosas responden a la misma pregunta —cuánto deja de cobrar la
 * organización y por qué— y por eso comparten módulo, pero **no** son lo
 * mismo:
 *
 *  · Un **descuento** es una condición comercial: un cupón, un convenio con
 *    otra organización, un precio especial por un periodo. Alcanza a quien
 *    cumpla la condición y se justifica ante la asamblea por su acuerdo.
 *  · Una **beca o exención** es una decisión sobre una persona concreta que no
 *    puede pagar. Lleva justificación escrita y evidencia, y decir que existe
 *    ya es decir algo sobre su situación: por eso leerla es un permiso
 *    sensible.
 *
 * Ninguna de las dos se borra nunca. Se revocan con motivo y fecha, porque un
 * cobro pasado se hizo con la que estuviera vigente y quien revise las cuentas
 * dentro de un año tiene que poder encontrarla.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const grantDiscountSchema = z.object({
  name: z.string().trim().min(3).max(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/, { error: () => 'El código lleva mayúsculas, números, guiones y guiones bajos.' })
    .optional(),
  legalEntityId: z.uuid(),
  kind: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FULL_WAIVER'] as const),
  /** Porcentaje entero en `PERCENTAGE`; importe escrito en `FIXED_AMOUNT`; se ignora en `FULL_WAIVER`. */
  value: z.string().trim().optional(),
  currency: z.enum(['MXN', 'USD'] as const).default('MXN'),
  productIds: z.array(z.uuid()).default([]),
  maxRedemptions: z.coerce.number().int().min(1).max(1_000_000).optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional(),
  agreementDocumentId: z.uuid().optional(),
});

export type GrantDiscountInput = z.input<typeof grantDiscountSchema>;

/**
 * Traduce lo que se escribió al entero que la columna guarda.
 *
 * `value` significa cosas distintas según el tipo, y por eso se resuelve aquí
 * y no en la pantalla: dejar que cada formulario decida qué guarda es como se
 * acaba con un «20» que en una tabla es por ciento y en otra son veinte pesos.
 */
function valorDelDescuento(
  kind: DiscountKind,
  escrito: string | undefined,
  currency: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (kind === 'FULL_WAIVER') return { ok: true, value: 100 };

  if (escrito === undefined || escrito === '') {
    return { ok: false, reason: 'Falta cuánto descuenta.' };
  }

  if (kind === 'PERCENTAGE') {
    const numero = Number(escrito);
    if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
      return { ok: false, reason: 'El porcentaje va de 1 a 99 y sin decimales. Para el cien por ciento, usa exención total.' };
    }
    return { ok: true, value: numero };
  }

  const importe = parseAmountToMinor(escrito, currency);
  if (!importe.ok) return { ok: false, reason: importe.reason };
  if (importe.minor <= 0n) return { ok: false, reason: 'El importe descontado tiene que ser mayor que cero.' };
  if (importe.minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: 'Ese importe es desmedido para un descuento.' };
  }
  return { ok: true, value: Number(importe.minor) };
}

export async function grantDiscount(
  actor: ActorContext,
  input: GrantDiscountInput,
): Promise<UseCaseResult<{ discountGrantId: string }>> {
  const parsed = grantDiscountSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const decision = can(actor, 'billing.discount.manage', {
    kind: 'DiscountGrant',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const valor = valorDelDescuento(data.kind, data.value, data.currency);
  if (!valor.ok) return fail(errors.validation({ value: [valor.reason] }));

  if (data.validTo !== undefined && data.validTo.getTime() <= data.validFrom.getTime()) {
    return fail(errors.validation({ validTo: ['La vigencia termina antes de empezar.'] }));
  }

  if (data.code !== undefined) {
    const existente = await db().discountGrant.findUnique({ where: { code: data.code }, select: { id: true } });
    if (existente !== null) return fail(errors.conflict('Ya existe un descuento con ese código.', 'código duplicado'));
  }

  // Los conceptos alcanzados tienen que ser de la misma entidad: un descuento
  // de una persona moral no puede rebajar el cobro de la otra.
  if (data.productIds.length > 0) {
    const ajenos = await db().catalogProduct.count({
      where: { id: { in: data.productIds }, legalEntityId: { not: data.legalEntityId } },
    });
    if (ajenos > 0) {
      return fail(
        errors.ruleViolation(
          'Alguno de los conceptos elegidos pertenece a la otra entidad.',
          'descuento que cruzaría entidades jurídicas',
        ),
      );
    }
  }

  const resultado = await transaction(async (tx) => {
    const otorgado = await tx.discountGrant.create({
      data: {
        name: data.name,
        code: data.code ?? null,
        legalEntityId: data.legalEntityId,
        kind: data.kind,
        value: valor.value,
        maxRedemptions: data.maxRedemptions ?? null,
        validFrom: data.validFrom,
        validTo: data.validTo ?? null,
        agreementDocumentId: data.agreementDocumentId ?? null,
        authorizedById: actor.userId!,
        ...(data.productIds.length === 0
          ? {}
          : { products: { create: data.productIds.map((productId) => ({ productId })) } }),
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DISCOUNT_GRANTED,
      objectKind: 'DiscountGrant',
      objectId: otorgado.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: {
        nombre: data.name,
        tipo: data.kind,
        valor: valor.value,
        conceptos: data.productIds.length,
        vigencia: `${data.validFrom.toISOString()} → ${data.validTo?.toISOString() ?? 'sin fin'}`,
      },
    });

    return otorgado;
  });

  return ok({ discountGrantId: resultado.id });
}

export const revokeDiscountSchema = z.object({
  discountGrantId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué se retira este descuento.' }).max(400),
});

export async function revokeDiscount(
  actor: ActorContext,
  input: z.infer<typeof revokeDiscountSchema>,
): Promise<UseCaseResult<{ discountGrantId: string }>> {
  const parsed = revokeDiscountSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const otorgado = await db().discountGrant.findUnique({
    where: { id: parsed.data.discountGrantId },
    select: { id: true, legalEntityId: true, revokedAt: true, name: true },
  });
  if (otorgado === null) return fail(errors.notFound('descuento inexistente'));

  const decision = can(actor, 'billing.discount.manage', {
    kind: 'DiscountGrant',
    id: otorgado.id,
    legalEntityId: otorgado.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (otorgado.revokedAt !== null) return fail(errors.conflict('Ese descuento ya estaba retirado.'));

  await transaction(async (tx) => {
    // Se revoca, no se borra: los cobros que ya lo usaron apuntan aquí.
    await tx.discountGrant.update({
      where: { id: otorgado.id },
      data: { revokedAt: new Date(), revokeReason: parsed.data.reason },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DISCOUNT_REVOKED,
      objectKind: 'DiscountGrant',
      objectId: otorgado.id,
      outcome: 'SUCCESS',
      legalEntityId: otorgado.legalEntityId,
      metadata: { nombre: otorgado.name, motivo: parsed.data.reason },
    });
  });

  return ok({ discountGrantId: otorgado.id });
}

export interface DiscountRow {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly kind: DiscountKind;
  readonly value: number;
  readonly legalEntityShortName: string;
  readonly productNames: readonly string[];
  readonly redemptions: number;
  readonly maxRedemptions: number | null;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly revokedAt: Date | null;
  readonly vigente: boolean;
}

export async function discountList(actor: ActorContext): Promise<UseCaseResult<DiscountRow[]>> {
  const decision = can(actor, 'billing.discount.read', { kind: 'DiscountGrant' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;
  const ahora = new Date();

  const filas = await db().discountGrant.findMany({
    where: entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } },
    orderBy: [{ revokedAt: 'asc' }, { validFrom: 'desc' }],
    select: {
      id: true,
      name: true,
      code: true,
      kind: true,
      value: true,
      redemptions: true,
      maxRedemptions: true,
      validFrom: true,
      validTo: true,
      revokedAt: true,
      legalEntity: { select: { shortName: true } },
      products: { select: { product: { select: { name: true } } } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      code: fila.code,
      kind: fila.kind,
      value: fila.value,
      legalEntityShortName: fila.legalEntity.shortName,
      productNames: fila.products.map((enlace) => enlace.product.name),
      redemptions: fila.redemptions,
      maxRedemptions: fila.maxRedemptions,
      validFrom: fila.validFrom,
      validTo: fila.validTo,
      revokedAt: fila.revokedAt,
      vigente:
        fila.revokedAt === null &&
        fila.validFrom.getTime() <= ahora.getTime() &&
        (fila.validTo === null || fila.validTo.getTime() > ahora.getTime()) &&
        (fila.maxRedemptions === null || fila.redemptions < fila.maxRedemptions),
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Becas y exenciones                                                         */
/* -------------------------------------------------------------------------- */

export const approveScholarshipSchema = z.object({
  personId: z.uuid(),
  legalEntityId: z.uuid(),
  programKind: z.enum(['MEMBERSHIP', 'CIAN_SERVICE', 'COURSE', 'TOOL_ACCESS'] as const),
  coveragePercent: z.coerce
    .number()
    .int({ error: () => 'La cobertura va en porcentaje entero.' })
    .min(1, { error: () => 'Una beca del cero por ciento no es una beca.' })
    .max(100),
  justification: z.string().trim().min(30, {
    error: () => 'La justificación es lo que respalda la beca ante quien revise las cuentas. Escríbela con detalle.',
  }).max(4000),
  evidenceFileIds: z.array(z.uuid()).default([]),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional(),
});

export type ApproveScholarshipInput = z.input<typeof approveScholarshipSchema>;

export async function approveScholarship(
  actor: ActorContext,
  input: ApproveScholarshipInput,
): Promise<UseCaseResult<{ scholarshipId: string }>> {
  const parsed = approveScholarshipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const decision = can(actor, 'billing.scholarship.manage', {
    kind: 'Scholarship',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const persona = await db().person.findUnique({ where: { id: data.personId }, select: { id: true } });
  if (persona === null) return fail(errors.notFound('persona inexistente'));

  if (data.validTo !== undefined && data.validTo.getTime() <= data.validFrom.getTime()) {
    return fail(errors.validation({ validTo: ['La vigencia termina antes de empezar.'] }));
  }

  // Dos becas vivas del mismo programa se pisarían y nadie sabría cuál rige.
  const solapada = await db().scholarship.findFirst({
    where: {
      personId: data.personId,
      legalEntityId: data.legalEntityId,
      programKind: data.programKind,
      revokedAt: null,
      OR: [{ validTo: null }, { validTo: { gt: data.validFrom } }],
    },
    select: { id: true },
  });
  if (solapada !== null) {
    return fail(
      errors.conflict(
        'Esa persona ya tiene una beca vigente para el mismo programa. Retira la anterior antes de otorgar otra.',
        'becas solapadas del mismo programa',
      ),
    );
  }

  const resultado = await transaction(async (tx) => {
    const beca = await tx.scholarship.create({
      data: {
        personId: data.personId,
        legalEntityId: data.legalEntityId,
        programKind: data.programKind,
        coveragePercent: data.coveragePercent,
        justification: data.justification,
        approvedById: actor.userId!,
        approvedAt: new Date(),
        validFrom: data.validFrom,
        validTo: data.validTo ?? null,
        ...(data.evidenceFileIds.length === 0
          ? {}
          : { evidence: { create: data.evidenceFileIds.map((fileObjectId) => ({ fileObjectId })) } }),
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SCHOLARSHIP_APPROVED,
      objectKind: 'Scholarship',
      objectId: beca.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      // La justificación **no** va a la bitácora: dice por qué alguien no puede
      // pagar, y la bitácora la leen más personas que la beca. Queda en su
      // propia fila, bajo un permiso sensible.
      metadata: {
        programa: data.programKind,
        cobertura: data.coveragePercent,
        evidencias: data.evidenceFileIds.length,
      },
    });

    return beca;
  });

  return ok({ scholarshipId: resultado.id });
}

export const revokeScholarshipSchema = z.object({
  scholarshipId: z.uuid(),
  reason: z.string().trim().min(10, { error: () => 'Escribe por qué se retira esta beca.' }).max(400),
});

export async function revokeScholarship(
  actor: ActorContext,
  input: z.infer<typeof revokeScholarshipSchema>,
): Promise<UseCaseResult<{ scholarshipId: string }>> {
  const parsed = revokeScholarshipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const beca = await db().scholarship.findUnique({
    where: { id: parsed.data.scholarshipId },
    select: { id: true, legalEntityId: true, revokedAt: true, programKind: true },
  });
  if (beca === null) return fail(errors.notFound('beca inexistente'));

  const decision = can(actor, 'billing.scholarship.manage', {
    kind: 'Scholarship',
    id: beca.id,
    legalEntityId: beca.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (beca.revokedAt !== null) return fail(errors.conflict('Esa beca ya estaba retirada.'));

  await transaction(async (tx) => {
    await tx.scholarship.update({
      where: { id: beca.id },
      data: { revokedAt: new Date(), revokeReason: parsed.data.reason },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SCHOLARSHIP_REVOKED,
      objectKind: 'Scholarship',
      objectId: beca.id,
      outcome: 'SUCCESS',
      legalEntityId: beca.legalEntityId,
      metadata: { programa: beca.programKind, motivo: parsed.data.reason },
    });
  });

  return ok({ scholarshipId: beca.id });
}

export interface ScholarshipRow {
  readonly id: string;
  readonly personName: string;
  readonly legalEntityShortName: string;
  readonly programKind: ScholarshipProgram;
  readonly coveragePercent: number;
  readonly justification: string;
  readonly evidenceCount: number;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly revokedAt: Date | null;
  readonly vigente: boolean;
}

export async function scholarshipList(actor: ActorContext): Promise<UseCaseResult<ScholarshipRow[]>> {
  const decision = can(actor, 'billing.scholarship.read', { kind: 'Scholarship' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;
  const ahora = new Date();

  const filas = await db().scholarship.findMany({
    where: entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } },
    orderBy: [{ revokedAt: 'asc' }, { approvedAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      programKind: true,
      coveragePercent: true,
      justification: true,
      validFrom: true,
      validTo: true,
      revokedAt: true,
      person: { select: { givenName: true, familyName: true } },
      legalEntity: { select: { shortName: true } },
      _count: { select: { evidence: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      personName: `${fila.person.givenName} ${fila.person.familyName}`,
      legalEntityShortName: fila.legalEntity.shortName,
      programKind: fila.programKind,
      coveragePercent: fila.coveragePercent,
      justification: fila.justification,
      evidenceCount: fila._count.evidence,
      validFrom: fila.validFrom,
      validTo: fila.validTo,
      revokedAt: fila.revokedAt,
      vigente:
        fila.revokedAt === null &&
        fila.validFrom.getTime() <= ahora.getTime() &&
        (fila.validTo === null || fila.validTo.getTime() > ahora.getTime()),
    })),
  );
}
