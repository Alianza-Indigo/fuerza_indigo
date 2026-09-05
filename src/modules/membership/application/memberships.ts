import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { MembershipCategory, MembershipEndReason, MembershipStatus } from '@prisma-client/enums';
import { openAuthorityFiling } from './rosters';

/**
 * Vida de una membresía: activación, vigencia, suspensión, baja y conversión
 * (PRD §3.6, §8.1 pasos 12 y 13, §8.4; F4-AFI-008, F4-AFI-009).
 *
 * **Una membresía nace de un hecho, no de una intención.** Se activa cuando se
 * cumplen resolución y pago, y el pago lo confirma el webhook firmado —nunca el
 * regreso del navegador—. Cuando la calidad no tiene cuota, basta la
 * resolución: el pago cumplido es el pago que no había que hacer.
 *
 * **Todo cambio de estado deja motivo, actor y fecha** en `MembershipStatusEvent`,
 * que es inmutable por privilegios de columna. El PRD §3.6 lo exige y la base lo
 * garantiza: no depende de que cada caso de uso se acuerde de anotarlo, porque
 * ninguno puede cambiar el estado sin pasar por aquí.
 */

const MOTIVO_MINIMO = 15;

/**
 * Número de miembro: serie por categoría y año.
 *
 * Con bloqueo de asesor sobre la serie, igual que el folio de la solicitud: dos
 * activaciones simultáneas repartirían el mismo número, y un número repetido
 * acaba en dos credenciales que dicen ser la misma persona.
 */
async function siguienteNumero(tx: Tx, prefijo: string, categoria: MembershipCategory, año: number): Promise<string> {
  const marca = categoria === 'UNION_MEMBER' ? 'A' : 'H';
  const serie = `${prefijo}-${marca}${año}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`miembro:${serie}`}))`;
  const usados = await tx.membership.count({ where: { memberNumber: { startsWith: `${serie}-` } } });
  return `${serie}-${String(usados + 1).padStart(5, '0')}`;
}

/** Fin de la vigencia a partir de la duración de la calidad. */
function vencimiento(desde: Date, durationMonths: number | null): Date | null {
  if (durationMonths === null) return null;
  const fin = new Date(desde);
  fin.setUTCMonth(fin.getUTCMonth() + durationMonths);
  return fin;
}

interface SolicitudActivable {
  readonly id: string;
  readonly folio: string;
  readonly personId: string;
  readonly membershipTypeId: string;
  readonly category: MembershipCategory;
  readonly legalEntityId: string;
  readonly territorialUnitId: string | null;
  readonly membershipType: {
    readonly durationMonths: number | null;
    readonly requiresPayment: boolean;
  };
}

/**
 * Crea la membresía y deja el asiento de nacimiento.
 *
 * Se escribe dentro de la transacción de quien la llama —la resolución o la
 * confirmación del cobro— para que no exista un estado en el que el hecho
 * conste y la membresía no.
 */
export async function crearMembresiaActiva(
  tx: Tx,
  actor: ActorContext,
  solicitud: SolicitudActivable,
  origen: 'resolución sin cuota' | 'cobro confirmado',
): Promise<{ membershipId: string; memberNumber: string }> {
  const entidad = await tx.legalEntity.findUniqueOrThrow({
    where: { id: solicitud.legalEntityId },
    select: { documentSeriesPrefix: true },
  });

  const ahora = new Date();
  const memberNumber = await siguienteNumero(
    tx,
    entidad.documentSeriesPrefix,
    solicitud.category,
    ahora.getUTCFullYear(),
  );

  const creada = await tx.membership.create({
    data: {
      publicId: newPublicId(20),
      memberNumber,
      personId: solicitud.personId,
      membershipTypeId: solicitud.membershipTypeId,
      category: solicitud.category,
      legalEntityId: solicitud.legalEntityId,
      applicationId: solicitud.id,
      status: 'ACTIVE',
      startedAt: ahora,
      expiresAt: vencimiento(ahora, solicitud.membershipType.durationMonths),
      territorialUnitId: solicitud.territorialUnitId,
      createdByActorId: actor.actorId,
      updatedByActorId: actor.actorId,
    },
    select: { id: true, memberNumber: true },
  });

  await tx.membershipStatusEvent.create({
    data: {
      membershipId: creada.id,
      fromStatus: null,
      toStatus: 'ACTIVE',
      reason: `Activación por ${origen} (solicitud ${solicitud.folio}).`,
      ...(actor.userId === null ? {} : { actorUserId: actor.userId }),
      actorId: actor.actorId,
    },
  });

  await tx.membershipApplication.update({
    where: { id: solicitud.id },
    data: { status: 'ACTIVATED', updatedByActorId: actor.actorId, rowVersion: { increment: 1 } },
  });

  // El alta queda preparada para el informe ante la autoridad laboral, dentro
  // de la misma transacción que la produce (PRD §8.1 paso 14). Solo para las
  // calidades que sí aparecen ante autoridades: la función lo comprueba.
  await openAuthorityFiling(tx, actor, {
    membershipId: creada.id,
    personId: solicitud.personId,
    legalEntityId: solicitud.legalEntityId,
    kind: 'ROSTER_ADDITION',
    occurredAt: ahora,
  });

  await recordAudit(tx, actor, {
    action: AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
    objectKind: 'Membership',
    objectId: creada.id,
    outcome: 'SUCCESS',
    legalEntityId: solicitud.legalEntityId,
    onBehalfOfPersonId: solicitud.personId,
    ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
    metadata: { folio: solicitud.folio, memberNumber: creada.memberNumber, origen },
  });

  return { membershipId: creada.id, memberNumber: creada.memberNumber };
}

/** La solicitud, con lo que hace falta para activarla. */
export async function solicitudParaActivar(
  tx: Tx,
  applicationId: string,
): Promise<SolicitudActivable | null> {
  const solicitud = await tx.membershipApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      folio: true,
      personId: true,
      membershipTypeId: true,
      category: true,
      legalEntityId: true,
      territorialUnitId: true,
      membershipType: { select: { durationMonths: true, requiresPayment: true } },
    },
  });
  return solicitud;
}

/* -------------------------------------------------------------------------- */
/* Cobro de la cuota de inscripción                                           */
/* -------------------------------------------------------------------------- */

export const payApplicationSchema = z.object({ applicationId: z.uuid() });

export type PayApplicationInput = z.infer<typeof payApplicationSchema>;

/**
 * Qué hay que pagar para activar una solicitud aprobada, y por qué concepto.
 *
 * Se resuelve aquí y no en la pantalla porque la pregunta es del dominio: una
 * calidad con cuota y sin concepto de cobro configurado **no se puede cobrar**,
 * y decirlo con claridad vale más que ofrecer un botón que lleva a un error.
 */
export async function pendingChargeFor(
  actor: ActorContext,
  applicationId: string,
): Promise<
  UseCaseResult<{
    applicationId: string;
    catalogProductId: string | null;
    productName: string | null;
    alreadyPaid: boolean;
  }>
> {
  const solicitud = await db().membershipApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      personId: true,
      legalEntityId: true,
      paymentId: true,
      payment: { select: { status: true } },
      membershipType: {
        select: { requiresPayment: true, catalogProductId: true, catalogProduct: { select: { name: true } } },
      },
    },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const propia = solicitud.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.application.read_own' : 'membership.application.read',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (solicitud.status !== 'APPROVED' || !solicitud.membershipType.requiresPayment) {
    return ok({ applicationId: solicitud.id, catalogProductId: null, productName: null, alreadyPaid: false });
  }

  return ok({
    applicationId: solicitud.id,
    catalogProductId: solicitud.membershipType.catalogProductId,
    productName: solicitud.membershipType.catalogProduct?.name ?? null,
    alreadyPaid: solicitud.payment?.status === 'SUCCEEDED',
  });
}

/**
 * Ata un cobro a la solicitud que va a activar.
 *
 * Sin este enlace, la activación tendría que adivinar a qué solicitud
 * corresponde un pago cotejando persona, entidad y concepto, y esa clase de
 * conjetura falla justo cuando alguien tiene dos trámites abiertos. Se llama
 * desde la pantalla de la persona, justo después de abrir el cobro.
 */
export async function linkPaymentToApplication(
  actor: ActorContext,
  input: { applicationId: string; paymentPublicId: string },
): Promise<UseCaseResult<{ applicationId: string }>> {
  const solicitud = await db().membershipApplication.findUnique({
    where: { id: input.applicationId },
    select: { id: true, status: true, personId: true, legalEntityId: true, paymentId: true },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const propia = solicitud.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.application.read_own' : 'membership.application.review',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const pago = await db().payment.findUnique({
    where: { publicId: input.paymentPublicId },
    select: { id: true, billingAccount: { select: { personId: true } } },
  });
  if (pago === null) return fail(errors.notFound('cobro inexistente'));
  if (pago.billingAccount.personId !== solicitud.personId) {
    return fail(
      errors.ruleViolation(
        'Ese cobro es de otra persona.',
        'intento de atar a una solicitud el cobro de otra persona',
      ),
    );
  }

  await db().membershipApplication.update({
    where: { id: solicitud.id },
    data: { paymentId: pago.id, updatedByActorId: actor.actorId, rowVersion: { increment: 1 } },
  });

  return ok({ applicationId: solicitud.id });
}

/**
 * Activa la membresía cuando el cobro que la sostiene queda confirmado.
 *
 * Lo llama el manejador de `billing.payment.succeeded`, que a su vez se dispara
 * desde la bandeja de salida. Tres cosas de las que depende que esto sea
 * correcto y no solo funcional:
 *
 * - **Es idempotente.** Un reenvío del webhook no crea una segunda membresía:
 *   la solicitud ya no está en `APPROVED` y la función no hace nada.
 * - **No confía en el navegador.** Llega por webhook firmado, que es el único
 *   camino por el que un cobro pasa a confirmado (PRD §11.4).
 * - **No inventa la calidad.** Lee la que la solicitud aprobó, no la que el
 *   cobro sugiera: pagar el concepto equivocado no debe conceder otra cosa.
 */
export async function activateFromConfirmedPayment(
  actor: ActorContext,
  paymentId: string,
): Promise<{ activated: boolean; membershipId?: string }> {
  return transaction(async (tx) => {
    const solicitud = await tx.membershipApplication.findFirst({
      where: { paymentId, status: 'APPROVED' },
      select: { id: true },
    });
    if (solicitud === null) return { activated: false };

    const pago = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (pago?.status !== 'SUCCEEDED') return { activated: false };

    const activable = await solicitudParaActivar(tx, solicitud.id);
    if (activable === null) return { activated: false };

    const creada = await crearMembresiaActiva(tx, actor, activable, 'cobro confirmado');
    return { activated: true, membershipId: creada.membershipId };
  });
}

/* -------------------------------------------------------------------------- */
/* Vida de la membresía                                                       */
/* -------------------------------------------------------------------------- */

const motivo = z
  .string()
  .trim()
  .min(MOTIVO_MINIMO, {
    error: () => 'Escribe el motivo. Un cambio de estado sin motivo no se puede explicar después.',
  })
  .max(1000);

export const suspendMembershipSchema = z.object({ membershipId: z.uuid(), reason: motivo });
export type SuspendMembershipInput = z.infer<typeof suspendMembershipSchema>;

export const reinstateMembershipSchema = z.object({ membershipId: z.uuid(), reason: motivo });
export type ReinstateMembershipInput = z.infer<typeof reinstateMembershipSchema>;

export const endMembershipSchema = z.object({
  membershipId: z.uuid(),
  endReason: z.enum(
    ['VOLUNTARY_WITHDRAWAL', 'EXPULSION', 'INACTIVITY', 'DECEASED', 'ADMIN_CORRECTION', 'DUPLICATE', 'CONVERSION'],
    { error: () => 'Di por qué termina.' },
  ),
  reason: motivo,
});
export type EndMembershipInput = z.infer<typeof endMembershipSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** El estado final que corresponde a cada motivo de terminación. */
const ESTADO_FINAL: Record<string, MembershipStatus> = {
  VOLUNTARY_WITHDRAWAL: 'VOLUNTARY_WITHDRAWAL',
  EXPULSION: 'STATUS_LOSS',
  INACTIVITY: 'STATUS_LOSS',
  DECEASED: 'DECEASED',
  ADMIN_CORRECTION: 'CANCELLED_DUPLICATE',
  DUPLICATE: 'CANCELLED_DUPLICATE',
  CONVERSION: 'STATUS_LOSS',
};

interface MembresiaEnCurso {
  readonly id: string;
  readonly memberNumber: string;
  readonly status: MembershipStatus;
  readonly personId: string;
  readonly legalEntityId: string;
  readonly territorialUnitId: string | null;
}

async function membresia(membershipId: string): Promise<MembresiaEnCurso | null> {
  return db().membership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      memberNumber: true,
      status: true,
      personId: true,
      legalEntityId: true,
      territorialUnitId: true,
    },
  });
}

function recurso(fila: MembresiaEnCurso) {
  return {
    kind: 'Membership' as const,
    id: fila.id,
    legalEntityId: fila.legalEntityId,
    ...(fila.territorialUnitId === null ? {} : { territorialUnitId: fila.territorialUnitId }),
  };
}

/** Escribe el cambio de estado y su asiento, siempre juntos. */
async function moverEstado(
  tx: Tx,
  actor: ActorContext,
  fila: MembresiaEnCurso,
  destino: MembershipStatus,
  razon: string,
  // El motivo aquí es el del modelo, no el de la lista que se ofrece a una
  // persona: `EXPIRY` existe en la base y **no** se puede elegir a mano, porque
  // un vencimiento no lo decide nadie. Estrechar el formulario sin estrechar el
  // dominio es justo lo que permite que la base lo exija y la pantalla no lo
  // ofrezca.
  extra: { endedAt?: Date; endReason?: MembershipEndReason } = {},
): Promise<void> {
  await tx.membership.update({
    where: { id: fila.id },
    data: {
      status: destino,
      ...(extra.endedAt === undefined ? {} : { endedAt: extra.endedAt }),
      ...(extra.endReason === undefined ? {} : { endReason: extra.endReason }),
      updatedByActorId: actor.actorId,
      rowVersion: { increment: 1 },
    },
  });

  await tx.membershipStatusEvent.create({
    data: {
      membershipId: fila.id,
      fromStatus: fila.status,
      toStatus: destino,
      reason: razon,
      ...(actor.userId === null ? {} : { actorUserId: actor.userId }),
      actorId: actor.actorId,
    },
  });
}

/**
 * Suspende una membresía activa.
 *
 * Suspender **no** es dar de baja: la persona sigue siendo miembro y la
 * membresía vuelve con `reinstateMembership`. Por eso no se escribe `endedAt`:
 * una fecha de fin en una suspensión convertiría una pausa en una salida, y
 * quien mirara el padrón meses después no podría distinguirlas.
 */
export async function suspendMembership(
  actor: ActorContext,
  input: SuspendMembershipInput,
): Promise<UseCaseResult<{ membershipId: string }>> {
  const parsed = suspendMembershipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const fila = await membresia(parsed.data.membershipId);
  if (fila === null) return fail(errors.notFound('membresía inexistente'));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'membership.record.suspend', recurso(fila));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (fila.status !== 'ACTIVE') {
    return fail(
      errors.conflict('Solo se suspende una membresía activa.', `estado actual: ${fila.status}`),
    );
  }

  await transaction(async (tx) => {
    await moverEstado(tx, actor, fila, 'SUSPENDED', parsed.data.reason);
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED,
      objectKind: 'Membership',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { memberNumber: fila.memberNumber },
    });
  });

  return ok({ membershipId: fila.id });
}

/** Levanta una suspensión. Exige motivo igual que ponerla. */
export async function reinstateMembership(
  actor: ActorContext,
  input: ReinstateMembershipInput,
): Promise<UseCaseResult<{ membershipId: string }>> {
  const parsed = reinstateMembershipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const fila = await membresia(parsed.data.membershipId);
  if (fila === null) return fail(errors.notFound('membresía inexistente'));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'membership.record.suspend', recurso(fila));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (fila.status !== 'SUSPENDED') {
    return fail(
      errors.conflict('Esa membresía no está suspendida.', `estado actual: ${fila.status}`),
    );
  }

  await transaction(async (tx) => {
    await moverEstado(tx, actor, fila, 'ACTIVE', parsed.data.reason);
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MEMBERSHIP_REINSTATED,
      objectKind: 'Membership',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { memberNumber: fila.memberNumber },
    });
  });

  return ok({ membershipId: fila.id });
}

/**
 * Termina una membresía, por el motivo que sea.
 *
 * Los siete motivos del PRD §3.6 no comparten estado final a propósito: una
 * baja voluntaria y una expulsión terminan las dos, y decir que son lo mismo
 * sería mentir en el padrón que se consulta años después. La conversión también
 * termina, y tampoco es una baja: la persona pasó a otra calidad (PRD §8.4).
 *
 * Lo terminado no revive. Volver es una solicitud nueva, y así el historial
 * conserva las dos etapas en vez de fundirlas en una fila que se reescribió.
 */
export async function endMembership(
  actor: ActorContext,
  input: EndMembershipInput,
): Promise<UseCaseResult<{ membershipId: string; status: MembershipStatus }>> {
  const parsed = endMembershipSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const fila = await membresia(parsed.data.membershipId);
  if (fila === null) return fail(errors.notFound('membresía inexistente'));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'membership.record.terminate', recurso(fila));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const VIVAS: MembershipStatus[] = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'DISCIPLINARY_PROCESS'];
  if (!VIVAS.includes(fila.status)) {
    return fail(
      errors.conflict('Esa membresía ya está terminada.', `estado actual: ${fila.status}`),
    );
  }

  const destino = ESTADO_FINAL[parsed.data.endReason] ?? 'STATUS_LOSS';

  const cuando = new Date();
  await transaction(async (tx) => {
    await moverEstado(tx, actor, fila, destino, parsed.data.reason, {
      endedAt: cuando,
      endReason: parsed.data.endReason,
    });

    // Y la baja queda preparada igual que el alta (PRD §8.1 paso 14, §9.7). Una
    // organización que informa las altas y olvida las bajas acaba con un padrón
    // ante la autoridad que crece y nunca mengua.
    await openAuthorityFiling(tx, actor, {
      membershipId: fila.id,
      personId: fila.personId,
      legalEntityId: fila.legalEntityId,
      kind: 'ROSTER_REMOVAL',
      occurredAt: cuando,
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MEMBERSHIP_TERMINATED,
      objectKind: 'Membership',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      onBehalfOfPersonId: fila.personId,
      reason: parsed.data.reason,
      metadata: { memberNumber: fila.memberNumber, endReason: parsed.data.endReason, estadoFinal: destino },
    });
  });

  return ok({ membershipId: fila.id, status: destino });
}

/**
 * Marca como vencidas las membresías cuya vigencia terminó.
 *
 * Lo ejecuta un trabajo diario. **Vencer no es dar de baja**: nadie decidió
 * nada, solo pasó el tiempo, y renovar la devuelve. Eso se dice con el motivo
 * `EXPIRY`, que existe precisamente para no tener que disfrazar un vencimiento
 * de inactividad o de corrección administrativa —las dos afirman que alguien
 * decidió algo—. La fecha de fin es la del vencimiento, no la de hoy: la
 * membresía dejó de estar en vigor cuando se acabó su vigencia, no cuando el
 * trabajo nocturno se enteró.
 *
 * El vencimiento sí es automático, a diferencia del plazo de una aclaración
 * (ADR-0080), y la diferencia importa: aquí no se decide nada sobre nadie. La
 * vigencia la fijó la calidad al activarse y el calendario solo la constata.
 */
export async function expireDueMemberships(
  actor: ActorContext,
): Promise<UseCaseResult<{ expired: number }>> {
  const decision = can(actor, 'membership.record.read', { kind: 'Membership' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const vencidas = await db().membership.findMany({
    where: { status: 'ACTIVE', expiresAt: { not: null, lte: ahora } },
    take: 200,
    select: {
      id: true,
      memberNumber: true,
      status: true,
      personId: true,
      legalEntityId: true,
      territorialUnitId: true,
      expiresAt: true,
    },
  });
  if (vencidas.length === 0) return ok({ expired: 0 });

  await transaction(async (tx) => {
    for (const fila of vencidas) {
      const cuando = fila.expiresAt === null ? ahora : fila.expiresAt;
      await moverEstado(
        tx,
        actor,
        fila,
        'EXPIRED',
        `Terminó la vigencia el ${cuando.toISOString().slice(0, 10)}. Nadie la dio de baja: renovar la devuelve.`,
        { endedAt: cuando, endReason: 'EXPIRY' },
      );

      // Vencer saca del padrón que se remite a la autoridad, así que también
      // obliga a informar. Una organización que informa las altas y no las
      // bajas —incluidas las que ocurren solas— acaba remitiendo un padrón que
      // crece y nunca mengua.
      await openAuthorityFiling(tx, actor, {
        membershipId: fila.id,
        personId: fila.personId,
        legalEntityId: fila.legalEntityId,
        kind: 'ROSTER_REMOVAL',
        occurredAt: cuando,
      });

      await recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
        objectKind: 'Membership',
        objectId: fila.id,
        outcome: 'SUCCESS',
        legalEntityId: fila.legalEntityId,
        onBehalfOfPersonId: fila.personId,
        metadata: { memberNumber: fila.memberNumber, vencioEl: cuando.toISOString() },
      });
    }
  });

  return ok({ expired: vencidas.length });
}

/* -------------------------------------------------------------------------- */
/* Consulta                                                                   */
/* -------------------------------------------------------------------------- */

export interface MembershipRow {
  readonly id: string;
  readonly publicId: string;
  readonly memberNumber: string;
  readonly personId: string;
  readonly personName: string;
  readonly category: MembershipCategory;
  readonly membershipType: string;
  readonly legalEntity: string;
  readonly status: MembershipStatus;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;
  readonly endedAt: Date | null;
  readonly endReason: string | null;
  readonly territory: string | null;
  readonly grantsPoliticalRights: boolean;
  readonly events: readonly {
    readonly id: string;
    readonly fromStatus: MembershipStatus | null;
    readonly toStatus: MembershipStatus;
    readonly reason: string;
    readonly occurredAt: Date;
  }[];
}

function nombre(persona: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

const SELECCION = {
  id: true,
  publicId: true,
  memberNumber: true,
  personId: true,
  category: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  endedAt: true,
  endReason: true,
  legalEntity: { select: { shortName: true } },
  membershipType: { select: { name: true, grantsPoliticalRights: true } },
  territorialUnit: { select: { name: true } },
  person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
  statusEvents: {
    orderBy: { occurredAt: 'asc' },
    select: { id: true, fromStatus: true, toStatus: true, reason: true, occurredAt: true },
  },
} as const;

type FilaCruda = {
  id: string;
  publicId: string;
  memberNumber: string;
  personId: string;
  category: MembershipCategory;
  status: MembershipStatus;
  startedAt: Date;
  expiresAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  legalEntity: { shortName: string };
  membershipType: { name: string; grantsPoliticalRights: boolean };
  territorialUnit: { name: string } | null;
  person: { givenName: string; middleName: string | null; familyName: string; secondFamilyName: string | null };
  statusEvents: {
    id: string;
    fromStatus: MembershipStatus | null;
    toStatus: MembershipStatus;
    reason: string;
    occurredAt: Date;
  }[];
};

function aFila(fila: FilaCruda): MembershipRow {
  return {
    id: fila.id,
    publicId: fila.publicId,
    memberNumber: fila.memberNumber,
    personId: fila.personId,
    personName: nombre(fila.person),
    category: fila.category,
    membershipType: fila.membershipType.name,
    legalEntity: fila.legalEntity.shortName,
    status: fila.status,
    startedAt: fila.startedAt,
    expiresAt: fila.expiresAt,
    endedAt: fila.endedAt,
    endReason: fila.endReason,
    territory: fila.territorialUnit?.name ?? null,
    grantsPoliticalRights: fila.membershipType.grantsPoliticalRights,
    events: fila.statusEvents,
  };
}

/** Las membresías de una persona, con su historial completo de estados. */
export async function personMemberships(
  actor: ActorContext,
  personId: string,
): Promise<UseCaseResult<MembershipRow[]>> {
  const propia = personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.record.read_own' : 'membership.record.read',
    { kind: 'Membership', containsPersonalData: true },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().membership.findMany({
    where: { personId },
    orderBy: { startedAt: 'desc' },
    select: SELECCION,
  });
  return ok(filas.map((fila) => aFila(fila as unknown as FilaCruda)));
}

/** Una membresía por su identificador, para la pantalla de gestión. */
export async function membershipDetail(
  actor: ActorContext,
  membershipId: string,
): Promise<UseCaseResult<MembershipRow>> {
  const fila = await db().membership.findUnique({
    where: { id: membershipId },
    select: { ...SELECCION, legalEntityId: true, territorialUnitId: true },
  });
  if (fila === null) return fail(errors.notFound('membresía inexistente'));

  const propia = fila.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.record.read_own' : 'membership.record.read',
    {
      kind: 'Membership',
      id: fila.id,
      legalEntityId: fila.legalEntityId,
      containsPersonalData: true,
      ...(fila.territorialUnitId === null ? {} : { territorialUnitId: fila.territorialUnitId }),
    },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return ok(aFila(fila as unknown as FilaCruda));
}
