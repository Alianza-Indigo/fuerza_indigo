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
import type { AssetKind, AssetMovementKind, AssetStatus } from '@prisma-client/enums';

/**
 * Registro patrimonial (PRD §11.6, F3-LIB-003).
 *
 * El patrimonio de un sindicato es de sus agremiados. Por eso este registro no
 * se parece a un inventario de oficina: lo que importa no es qué hay, sino
 * **quién autorizó cada movimiento y con qué documento**.
 *
 * Dos reglas gobiernan el módulo:
 *
 *  1. **Un bien no cambia de manos sin acuerdo habilitante.** Transferir,
 *     asignar, dar de baja o disponer de un bien exige declarar de qué acuerdo
 *     sale. La tabla `Resolution` llega en la Fase 5; hasta entonces el acuerdo
 *     se declara por escrito, igual que en las cuotas extraordinarias.
 *  2. **Los movimientos no se editan ni se borran.** La migración de esta fase
 *     le revocó a la aplicación `UPDATE` y `DELETE` sobre `asset_movement`: un
 *     bien tiene la historia que tiene, y corregirla se hace con un movimiento
 *     nuevo, no reescribiendo el anterior.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Movimientos que exigen acuerdo institucional.
 *
 * Revaluar y dar de alta los decide la administración con su documentación.
 * Sacar un bien del patrimonio o ponerlo en manos de alguien, no: eso lo acuerda
 * el órgano que corresponda, y sin ese acuerdo el movimiento no se registra.
 */
const EXIGEN_ACUERDO: readonly AssetMovementKind[] = ['TRANSFERRED', 'ASSIGNED', 'DISPOSED', 'WRITTEN_OFF'];

/** A qué estado deja el bien cada movimiento. */
const ESTADO_TRAS_EL_MOVIMIENTO: Partial<Record<AssetMovementKind, AssetStatus>> = {
  TRANSFERRED: 'TRANSFERRED',
  DISPOSED: 'DISPOSED',
  WRITTEN_OFF: 'DISPOSED',
};

export const registerAssetSchema = z.object({
  legalEntityId: z.uuid(),
  assetKind: z.enum([
    'REAL_ESTATE',
    'VEHICLE',
    'EQUIPMENT',
    'FURNITURE',
    'BANK_ACCOUNT',
    'INTANGIBLE',
    'OTHER',
  ] as const),
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10, {
    error: () => 'Describe el bien con detalle: es lo que permite reconocerlo dentro de diez años.',
  }).max(1000),
  acquisitionMode: z.enum(['PURCHASE', 'DONATION', 'TRANSFER', 'OTHER'] as const),
  acquiredOn: z.coerce.date(),
  documentedValue: z.string().trim().min(1, { error: () => 'Escribe el valor documentado del bien.' }),
  currency: z.enum(['MXN', 'USD'] as const),
  location: z.string().trim().max(300).optional(),
  custodianPersonId: z.uuid().optional(),
  authorizingResolutionNote: z.string().trim().max(400).optional(),
});

export type RegisterAssetInput = z.input<typeof registerAssetSchema>;

export async function registerAsset(
  actor: ActorContext,
  input: RegisterAssetInput,
): Promise<UseCaseResult<{ assetId: string }>> {
  const parsed = registerAssetSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const decision = can(actor, 'billing.asset.manage', {
    kind: 'AssetRegister',
    legalEntityId: data.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const valor = parseAmountToMinor(data.documentedValue, data.currency);
  if (!valor.ok) return fail(errors.validation({ documentedValue: [valor.reason] }));
  if (valor.minor < 0n) {
    return fail(errors.validation({ documentedValue: ['El valor documentado no puede ser negativo.'] }));
  }

  const resultado = await transaction(async (tx) => {
    const bien = await tx.assetRegister.create({
      data: {
        legalEntityId: data.legalEntityId,
        assetKind: data.assetKind,
        name: data.name,
        description: data.description,
        acquisitionMode: data.acquisitionMode,
        acquiredOn: data.acquiredOn,
        documentedValueMinor: valor.minor,
        currency: data.currency,
        location: data.location ?? null,
        custodianPersonId: data.custodianPersonId ?? null,
        authorizingResolutionNote: data.authorizingResolutionNote ?? null,
        createdByActorId: actor.actorId,
      },
      select: { id: true },
    });

    // El alta es el primer movimiento de su historia, no un estado inicial sin
    // rastro: así el bien nunca tiene un momento del que nadie responde.
    await tx.assetMovement.create({
      data: {
        assetId: bien.id,
        movementKind: 'REGISTERED',
        occurredOn: data.acquiredOn,
        amountMinor: valor.minor,
        toCustodianId: data.custodianPersonId ?? null,
        authorizingResolutionNote: data.authorizingResolutionNote ?? null,
        registeredById: actor.userId!,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ASSET_REGISTERED,
      objectKind: 'AssetRegister',
      objectId: bien.id,
      outcome: 'SUCCESS',
      legalEntityId: data.legalEntityId,
      metadata: {
        nombre: data.name,
        tipo: data.assetKind,
        modo: data.acquisitionMode,
        valor: valor.minor.toString(),
        moneda: data.currency,
      },
    });

    return bien;
  });

  return ok({ assetId: resultado.id });
}

export const moveAssetSchema = z.object({
  assetId: z.uuid(),
  movementKind: z.enum(['REVALUED', 'TRANSFERRED', 'ASSIGNED', 'DISPOSED', 'WRITTEN_OFF'] as const),
  occurredOn: z.coerce.date(),
  toCustodianPersonId: z.uuid().optional(),
  amount: z.string().trim().optional(),
  authorizingResolutionNote: z.string().trim().max(400).optional(),
  evidenceFileIds: z.array(z.uuid()).default([]),
});

export type MoveAssetInput = z.input<typeof moveAssetSchema>;

/**
 * Registra un movimiento de un bien.
 *
 * No edita el movimiento anterior ni puede hacerlo: la base se lo impide. Lo que
 * sí actualiza es el estado del bien y quién lo custodia, que es la fotografía
 * de hoy, no la historia.
 */
export async function moveAsset(
  actor: ActorContext,
  input: MoveAssetInput,
): Promise<UseCaseResult<{ movementId: string }>> {
  const parsed = moveAssetSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  if (actor.userId === null) return fail(errors.forbidden('actor sin cuenta'));

  const bien = await db().assetRegister.findUnique({
    where: { id: data.assetId },
    select: {
      id: true,
      legalEntityId: true,
      status: true,
      currency: true,
      custodianPersonId: true,
      name: true,
      documentedValueMinor: true,
    },
  });
  if (bien === null) return fail(errors.notFound('bien inexistente'));

  const decision = can(actor, 'billing.asset.manage', {
    kind: 'AssetMovement',
    id: bien.id,
    legalEntityId: bien.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (bien.status === 'DISPOSED') {
    return fail(
      errors.conflict(
        'Ese bien ya salió del patrimonio. No se le pueden registrar más movimientos.',
        'movimiento sobre un bien dado de baja',
      ),
    );
  }

  if (EXIGEN_ACUERDO.includes(data.movementKind) && (data.authorizingResolutionNote ?? '') === '') {
    return fail(
      errors.validation({
        authorizingResolutionNote: [
          'Sacar un bien del patrimonio o ponerlo en manos de alguien lo acuerda el órgano que corresponda. Escribe de qué acuerdo sale: fecha, número de acta o resolución.',
        ],
      }),
    );
  }

  // Un movimiento que exige acuerdo también exige respaldo documental: el
  // acuerdo declarado por escrito es lo mínimo, y el documento es lo que lo
  // sostiene ante quien revise.
  if (EXIGEN_ACUERDO.includes(data.movementKind) && data.evidenceFileIds.length === 0) {
    return fail(
      errors.validation({
        evidenceFileIds: ['Adjunta el documento que respalda el acuerdo: el acta, el convenio o el oficio.'],
      }),
    );
  }

  let importe: bigint | null = null;
  if (data.movementKind === 'REVALUED') {
    if (data.amount === undefined || data.amount === '') {
      return fail(errors.validation({ amount: ['Una revaluación necesita el valor nuevo.'] }));
    }
    const valor = parseAmountToMinor(data.amount, bien.currency);
    if (!valor.ok) return fail(errors.validation({ amount: [valor.reason] }));
    importe = valor.minor;
  } else if (data.amount !== undefined && data.amount !== '') {
    const valor = parseAmountToMinor(data.amount, bien.currency);
    if (!valor.ok) return fail(errors.validation({ amount: [valor.reason] }));
    importe = valor.minor;
  }

  if ((data.movementKind === 'TRANSFERRED' || data.movementKind === 'ASSIGNED') && data.toCustodianPersonId === undefined) {
    return fail(errors.validation({ toCustodianPersonId: ['Di en manos de quién queda el bien.'] }));
  }

  const resultado = await transaction(async (tx) => {
    const movimiento = await tx.assetMovement.create({
      data: {
        assetId: bien.id,
        movementKind: data.movementKind,
        occurredOn: data.occurredOn,
        fromCustodianId: bien.custodianPersonId,
        toCustodianId: data.toCustodianPersonId ?? null,
        amountMinor: importe,
        authorizingResolutionNote: data.authorizingResolutionNote ?? null,
        registeredById: actor.userId!,
        ...(data.evidenceFileIds.length === 0
          ? {}
          : { evidence: { create: data.evidenceFileIds.map((fileObjectId) => ({ fileObjectId })) } }),
      },
      select: { id: true },
    });

    const nuevoEstado = ESTADO_DEL_MOVIMIENTO(data.movementKind);
    await tx.assetRegister.update({
      where: { id: bien.id },
      data: {
        ...(nuevoEstado === undefined ? {} : { status: nuevoEstado }),
        ...(data.toCustodianPersonId === undefined ? {} : { custodianPersonId: data.toCustodianPersonId }),
        ...(data.movementKind === 'REVALUED' && importe !== null ? { documentedValueMinor: importe } : {}),
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ASSET_MOVED,
      objectKind: 'AssetMovement',
      objectId: movimiento.id,
      outcome: 'SUCCESS',
      legalEntityId: bien.legalEntityId,
      metadata: {
        bien: bien.name,
        movimiento: data.movementKind,
        acuerdo: data.authorizingResolutionNote ?? null,
        evidencias: data.evidenceFileIds.length,
        importe: importe === null ? null : importe.toString(),
      },
    });

    return movimiento;
  });

  return ok({ movementId: resultado.id });
}

function ESTADO_DEL_MOVIMIENTO(kind: AssetMovementKind): AssetStatus | undefined {
  return ESTADO_TRAS_EL_MOVIMIENTO[kind];
}

export interface AssetRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly assetKind: AssetKind;
  readonly legalEntityShortName: string;
  readonly documentedValueMinor: bigint;
  readonly currency: string;
  readonly status: AssetStatus;
  readonly acquiredOn: Date;
  readonly location: string | null;
  readonly custodianName: string | null;
  readonly movements: readonly {
    readonly id: string;
    readonly movementKind: AssetMovementKind;
    readonly occurredOn: Date;
    readonly amountMinor: bigint | null;
    readonly authorizingResolutionNote: string | null;
    readonly evidenceCount: number;
    readonly registeredBy: string;
  }[];
}

export async function assetRegister(actor: ActorContext): Promise<UseCaseResult<AssetRow[]>> {
  // Leer no exige motivo escrito; administrar sí. Son dos permisos por eso.
  const decision = can(actor, 'billing.asset.read', { kind: 'AssetRegister' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const entidades = actor.legalEntityScope;

  const filas = await db().assetRegister.findMany({
    where: entidades.length === 0 ? {} : { legalEntityId: { in: [...entidades] } },
    orderBy: [{ status: 'asc' }, { acquiredOn: 'desc' }],
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      assetKind: true,
      documentedValueMinor: true,
      currency: true,
      status: true,
      acquiredOn: true,
      location: true,
      legalEntity: { select: { shortName: true } },
      custodianPerson: { select: { givenName: true, familyName: true } },
      movements: {
        orderBy: { occurredOn: 'desc' },
        select: {
          id: true,
          movementKind: true,
          occurredOn: true,
          amountMinor: true,
          authorizingResolutionNote: true,
          registeredBy: { select: { person: { select: { givenName: true, familyName: true } } } },
          _count: { select: { evidence: true } },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      description: fila.description,
      assetKind: fila.assetKind,
      legalEntityShortName: fila.legalEntity.shortName,
      documentedValueMinor: fila.documentedValueMinor,
      currency: fila.currency,
      status: fila.status,
      acquiredOn: fila.acquiredOn,
      location: fila.location,
      custodianName:
        fila.custodianPerson === null
          ? null
          : `${fila.custodianPerson.givenName} ${fila.custodianPerson.familyName}`,
      movements: fila.movements.map((movimiento) => ({
        id: movimiento.id,
        movementKind: movimiento.movementKind,
        occurredOn: movimiento.occurredOn,
        amountMinor: movimiento.amountMinor,
        authorizingResolutionNote: movimiento.authorizingResolutionNote,
        evidenceCount: movimiento._count.evidence,
        registeredBy:
          movimiento.registeredBy.person === null
            ? 'Persona no identificada'
            : `${movimiento.registeredBy.person.givenName} ${movimiento.registeredBy.person.familyName}`,
      })),
    })),
  );
}
