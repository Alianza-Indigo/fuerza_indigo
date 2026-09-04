import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { newPublicId } from '@/platform/kernel/ids';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { accountForLegalEntity } from '@/platform/payments/accounts';
import { parseAmountToMinor } from '@/platform/i18n';

/**
 * Pagos recibidos fuera de la plataforma (PRD §11.3, F3-PAG-009).
 *
 * Una transferencia o un efectivo entregado en una asamblea son pagos reales
 * que ninguna pasarela vio. Sin esta puerta, quien pagó así no consta como
 * pagado y el libro no cuadra nunca.
 *
 * Es también la puerta más peligrosa del módulo: alguien podría declarar
 * pagado lo que nadie pagó. Por eso lleva **doble control**, y el doble control
 * no es una casilla:
 *
 *  · Quien registra tiene `payment.register_manual`. Quien aprueba tiene
 *    `payment.approve_manual`. Son dos permisos, y en la semilla los tienen dos
 *    carteras distintas: Finanzas registra, la Secretaría Ejecutiva aprueba.
 *  · **La misma persona no puede hacer las dos cosas**, aunque acumulara los
 *    dos permisos. Es lo único que convierte la separación en un control real
 *    en vez de en una formalidad que se salta quien tenga los dos papeles.
 *  · Hace falta evidencia: comprobante de transferencia, recibo firmado, acta.
 *    Un pago manual sin respaldo es una afirmación, no un pago.
 *
 * Hasta que se aprueba, el dinero **no** cuenta: el pago vive en `PENDING` y no
 * entra en ningún total.
 */

export const registerManualPaymentSchema = z.object({
  billingAccountId: z.uuid({ error: () => 'Elige a nombre de quién entra este pago.' }),
  catalogPriceId: z.uuid().optional(),
  amount: z.string().trim().min(1, { error: () => 'Escribe cuánto se recibió.' }),
  currency: z.enum(['MXN', 'USD'] as const),
  method: z.enum(['MANUAL_TRANSFER', 'MANUAL_CASH'] as const, {
    error: () => 'Di cómo llegó el dinero: transferencia o efectivo.',
  }),
  /**
   * Archivo con el comprobante. Es obligatorio y no un adjunto opcional: sin
   * respaldo, aprobar un pago manual sería creerle a quien lo registra.
   */
  evidenceFileId: z.uuid({ error: () => 'Adjunta el comprobante: sin respaldo no se puede registrar.' }),
  receivedAt: z.coerce.date(),
  note: z.string().trim().max(400).optional(),
});

export type RegisterManualPaymentInput = z.input<typeof registerManualPaymentSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export async function registerManualPayment(
  actor: ActorContext,
  input: RegisterManualPaymentInput,
): Promise<UseCaseResult<{ paymentId: string; publicId: string }>> {
  const parsed = registerManualPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.userId === null) {
    return fail(errors.forbidden('actor sin cuenta: un pago manual lo registra una persona identificable'));
  }

  const cuenta = await db().billingAccount.findUnique({
    where: { id: data.billingAccountId },
    select: { id: true, legalEntityId: true, status: true, legalEntity: { select: { code: true } } },
  });
  if (cuenta === null) return fail(errors.notFound('cuenta de cobro inexistente'));

  const decision = can(actor, 'billing.payment.register_manual', {
    kind: 'Payment',
    legalEntityId: cuenta.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const importe = parseAmountToMinor(data.amount, data.currency);
  if (!importe.ok) return fail(errors.validation({ amount: [importe.reason] }));
  if (importe.minor <= 0n) {
    return fail(errors.validation({ amount: ['Un pago de cero no es un pago. Si es una exención, regístrala como beca.'] }));
  }

  const evidencia = await db().fileObject.findUnique({
    where: { id: data.evidenceFileId },
    select: { id: true, legalEntityId: true },
  });
  if (evidencia === null) return fail(errors.notFound('el comprobante no existe'));
  if (evidencia.legalEntityId !== cuenta.legalEntityId) {
    return fail(
      errors.ruleViolation(
        'Ese comprobante pertenece a otra entidad. Súbelo en la entidad que recibe el pago.',
        'evidencia de pago manual cruzada entre entidades jurídicas',
      ),
    );
  }

  const cuentaStripe = accountForLegalEntity(cuenta.legalEntity.code);
  if (cuentaStripe === null) {
    return fail(errors.dependencyUnavailable(`entidad ${cuenta.legalEntity.code} sin cuenta de cobro asignada`));
  }

  const resultado = await transaction(async (tx) => {
    const pago = await tx.payment.create({
      data: {
        publicId: newPublicId(20),
        billingAccountId: cuenta.id,
        legalEntityId: cuenta.legalEntityId,
        catalogPriceId: data.catalogPriceId ?? null,
        stripeAccountKey: cuentaStripe,
        amountMinor: importe.minor,
        currency: data.currency,
        // `PENDING` y no `SUCCEEDED`: hasta que alguien más lo apruebe, el
        // dinero no cuenta y no entra en ningún total.
        status: 'PENDING',
        method: data.method,
        manualEvidenceFileId: evidencia.id,
        manualRegisteredById: actor.userId,
        idempotencyKey: `manual:${newPublicId(24)}`,
        createdByActorId: actor.actorId,
      },
      select: { id: true, publicId: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MANUAL_PAYMENT_REGISTERED,
      objectKind: 'Payment',
      objectId: pago.id,
      outcome: 'SUCCESS',
      legalEntityId: cuenta.legalEntityId,
      metadata: {
        importe: importe.minor.toString(),
        moneda: data.currency,
        medio: data.method,
        recibido: data.receivedAt.toISOString(),
        nota: data.note ?? null,
      },
    });

    return pago;
  });

  return ok({ paymentId: resultado.id, publicId: resultado.publicId });
}

export const approveManualPaymentSchema = z.object({
  paymentId: z.uuid(),
  note: z.string().trim().max(400).optional(),
});

/**
 * Aprueba un pago manual registrado por **otra** persona.
 *
 * La comprobación de que no es la misma persona vive aquí y no en la pantalla,
 * porque una pantalla se puede saltar y esto es lo único que separa un control
 * de una formalidad.
 */
export async function approveManualPayment(
  actor: ActorContext,
  input: z.infer<typeof approveManualPaymentSchema>,
): Promise<UseCaseResult<{ paymentId: string }>> {
  const parsed = approveManualPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) {
    return fail(errors.forbidden('actor sin cuenta: aprobar un pago manual exige persona identificable'));
  }

  const pago = await db().payment.findUnique({
    where: { id: parsed.data.paymentId },
    select: {
      id: true,
      legalEntityId: true,
      status: true,
      method: true,
      amountMinor: true,
      currency: true,
      manualRegisteredById: true,
      manualApprovedById: true,
    },
  });
  if (pago === null) return fail(errors.notFound('pago inexistente'));

  const decision = can(actor, 'billing.payment.approve_manual', {
    kind: 'Payment',
    id: pago.id,
    legalEntityId: pago.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pago.manualRegisteredById === null) {
    return fail(
      errors.ruleViolation(
        'Ese cobro no es un pago manual, así que no hay nada que aprobar.',
        'intento de aprobar un pago que no se registró a mano',
      ),
    );
  }

  if (pago.manualRegisteredById === actor.userId) {
    return fail(
      errors.ruleViolation(
        'No puedes aprobar un pago que registraste tú. Tiene que aprobarlo otra persona.',
        'doble control: quien registra un pago manual no puede aprobarlo',
      ),
    );
  }

  if (pago.status !== 'PENDING') {
    return fail(errors.conflict('Ese pago ya no está pendiente de aprobación.', `estado ${pago.status}`));
  }

  await transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: pago.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED', paidAt: new Date(), manualApprovedById: actor.userId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MANUAL_PAYMENT_APPROVED,
      objectKind: 'Payment',
      objectId: pago.id,
      outcome: 'SUCCESS',
      legalEntityId: pago.legalEntityId,
      metadata: {
        importe: pago.amountMinor.toString(),
        moneda: pago.currency,
        registradoPor: pago.manualRegisteredById,
        nota: parsed.data.note ?? null,
      },
    });
  });

  return ok({ paymentId: pago.id });
}

export const rejectManualPaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se rechaza: lo va a leer quien lo registró y quien revise las cuentas.',
  }).max(400),
});

export async function rejectManualPayment(
  actor: ActorContext,
  input: z.infer<typeof rejectManualPaymentSchema>,
): Promise<UseCaseResult<{ paymentId: string }>> {
  const parsed = rejectManualPaymentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const pago = await db().payment.findUnique({
    where: { id: parsed.data.paymentId },
    select: { id: true, legalEntityId: true, status: true, manualRegisteredById: true },
  });
  if (pago === null) return fail(errors.notFound('pago inexistente'));

  const decision = can(actor, 'billing.payment.approve_manual', {
    kind: 'Payment',
    id: pago.id,
    legalEntityId: pago.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (pago.manualRegisteredById === actor.userId) {
    return fail(
      errors.ruleViolation(
        'No puedes resolver un pago que registraste tú.',
        'doble control: quien registra un pago manual no puede resolverlo',
      ),
    );
  }

  if (pago.status !== 'PENDING') {
    return fail(errors.conflict('Ese pago ya no está pendiente de aprobación.', `estado ${pago.status}`));
  }

  await transaction(async (tx) => {
    // Se cancela, no se borra. Un registro rechazado es parte de la historia:
    // alguien afirmó que había un pago y otra persona dijo que no.
    await tx.payment.updateMany({
      where: { id: pago.id, status: 'PENDING' },
      data: { status: 'CANCELLED', manualApprovedById: actor.userId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MANUAL_PAYMENT_REJECTED,
      objectKind: 'Payment',
      objectId: pago.id,
      outcome: 'SUCCESS',
      legalEntityId: pago.legalEntityId,
      metadata: { motivo: parsed.data.reason, registradoPor: pago.manualRegisteredById },
    });
  });

  return ok({ paymentId: pago.id });
}

export interface PendingManualPayment {
  readonly id: string;
  readonly publicId: string;
  readonly holder: string;
  readonly legalEntityShortName: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly method: string;
  readonly registeredAt: Date;
  readonly registeredBy: string;
  readonly registeredByMe: boolean;
  readonly evidenceFileId: string | null;
}

/** Pagos manuales esperando aprobación. */
export async function pendingManualPayments(actor: ActorContext): Promise<UseCaseResult<PendingManualPayment[]>> {
  const decision = can(actor, 'billing.payment.read', { kind: 'Payment' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;

  const filas = await db().payment.findMany({
    where: {
      status: 'PENDING',
      manualRegisteredById: { not: null },
      ...(entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } }),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      publicId: true,
      amountMinor: true,
      currency: true,
      method: true,
      createdAt: true,
      manualRegisteredById: true,
      manualEvidenceFileId: true,
      legalEntity: { select: { shortName: true } },
      manualRegisteredBy: { select: { person: { select: { givenName: true, familyName: true } } } },
      billingAccount: {
        select: { person: { select: { givenName: true, familyName: true } }, organization: { select: { legalName: true } } },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      holder:
        fila.billingAccount.person === null
          ? (fila.billingAccount.organization?.legalName ?? 'Sin titular')
          : `${fila.billingAccount.person.givenName} ${fila.billingAccount.person.familyName}`,
      legalEntityShortName: fila.legalEntity.shortName,
      amountMinor: fila.amountMinor,
      currency: fila.currency,
      method: fila.method,
      registeredAt: fila.createdAt,
      registeredBy:
        fila.manualRegisteredBy?.person === null || fila.manualRegisteredBy === null
          ? 'Persona no identificada'
          : `${fila.manualRegisteredBy.person.givenName} ${fila.manualRegisteredBy.person.familyName}`,
      // Lo decide el servidor, no la pantalla: es lo que permite ocultar el
      // botón de aprobar a quien de todos modos sería rechazado.
      registeredByMe: fila.manualRegisteredById === actor.userId,
      evidenceFileId: fila.manualEvidenceFileId,
    })),
  );
}
