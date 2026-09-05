import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { issueDocument } from '@/modules/documents';
import type { PowerKind } from '@prisma-client/enums';

/**
 * Poderes y representaciones (PRD §9.2; F5-GOB-002).
 *
 * **Un poder no sobrevive al cargo que lo otorgó.** La vigencia del poder se
 * acota a la del periodo de cargo, y cuando ese periodo termina —por vencimiento
 * o anticipadamente— los poderes que salieron de él se revocan en el mismo acto.
 * Sin esa regla, quedaría gente representando al sindicato en nombre de una
 * secretaría que ya no existe, que es exactamente el daño que un registro de
 * poderes debe impedir.
 *
 * **Un poder sin documento no es un poder.** El otorgamiento emite el documento
 * probatorio en el mismo acto, con su folio de serie, y la fila guarda la
 * referencia. La columna `documentId` es obligatoria en la base: no hay forma de
 * registrar un poder «pendiente de papel».
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const grantPowerSchema = z.object({
  officeTermId: z.uuid({ error: () => 'Elige el periodo de cargo que otorga el poder.' }),
  granteePersonId: z.uuid({ error: () => 'Elige a la persona apoderada.' }),
  powerKind: z.enum(['LEGAL_REPRESENTATION', 'BANKING', 'LABOR_AUTHORITY', 'ADMINISTRATIVE', 'SPECIAL']),
  scope: z.string().trim().min(30).max(8000, {
    error: () => 'Describe el alcance del poder: qué puede hacer la persona apoderada y qué no.',
  }),
  notaryReference: z.string().trim().max(200).nullable().default(null),
  startsOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  endsOn: z.string().trim().regex(FECHA).nullable().default(null),
  /** Plantilla publicada con la que se emite el documento probatorio. */
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
  reason: z.string().trim().min(10).max(2000),
});

export type GrantPowerInput = z.infer<typeof grantPowerSchema>;

const NOMBRE_DE_PODER: Readonly<Record<PowerKind, string>> = {
  LEGAL_REPRESENTATION: 'representación legal',
  BANKING: 'actos bancarios',
  LABOR_AUTHORITY: 'trámites ante la autoridad laboral',
  ADMINISTRATIVE: 'actos administrativos',
  SPECIAL: 'poder especial',
};

export async function grantPower(
  actor: ActorContext,
  input: GrantPowerInput,
): Promise<UseCaseResult<{ powerGrantId: string; folio: string }>> {
  const parsed = grantPowerSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'governance.power.grant', { kind: 'PowerGrant' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const cargo = await db().officeTerm.findUnique({
    where: { id: data.officeTermId },
    select: {
      id: true,
      startsOn: true,
      endsOn: true,
      endedEarlyOn: true,
      officeDefinition: {
        select: { name: true, unionBody: { select: { name: true, legalEntity: { select: { legalName: true } } } } },
      },
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
    },
  });
  if (cargo === null) return fail(errors.notFound('Ese periodo de cargo no existe.'));
  if (cargo.endedEarlyOn !== null) {
    return fail(errors.conflict('Ese periodo de cargo terminó anticipadamente. Un cargo concluido no otorga poderes.'));
  }

  const inicio = new Date(`${data.startsOn}T00:00:00.000Z`);
  const fin = data.endsOn === null ? null : new Date(`${data.endsOn}T00:00:00.000Z`);

  if (inicio < cargo.startsOn) {
    return fail(
      errors.validation({ startsOn: ['El poder no puede empezar antes que el periodo de cargo que lo otorga.'] }),
    );
  }
  if (inicio > cargo.endsOn) {
    return fail(errors.validation({ startsOn: ['El periodo de cargo ya habrá terminado en esa fecha.'] }));
  }
  if (fin !== null && fin < inicio) {
    return fail(errors.validation({ endsOn: ['La fecha de término es anterior a la de inicio.'] }));
  }
  if (fin !== null && fin > cargo.endsOn) {
    return fail(
      errors.validation({
        endsOn: [
          'Un poder no sobrevive al cargo que lo otorgó. Acorta la vigencia al término del periodo o déjala en blanco: se acota sola.',
        ],
      }),
    );
  }

  const apoderada = await db().person.findUnique({
    where: { id: data.granteePersonId },
    select: {
      id: true,
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      preferredName: true,
    },
  });
  if (apoderada === null) return fail(errors.notFound('Esa persona no está en el registro.'));

  const vigenciaTexto =
    fin === null ? `hasta el término del periodo, el ${cargo.endsOn.toISOString().slice(0, 10)}` : `hasta el ${data.endsOn}`;

  // El documento probatorio se emite primero: sin él no hay poder que registrar,
  // y así un fallo al emitir no deja una fila de poder sin respaldo.
  const documento = await issueDocument(contexto, {
    templateCode: data.templateCode,
    subjectKind: 'OFFICE_TERM',
    subjectId: cargo.id,
    variables: {
      entidad: cargo.officeDefinition.unionBody.legalEntity.legalName,
      organo: cargo.officeDefinition.unionBody.name,
      cargo: cargo.officeDefinition.name,
      otorgante: nombreCompleto(cargo.person),
      apoderada: nombreCompleto(apoderada),
      tipoDePoder: NOMBRE_DE_PODER[data.powerKind],
      alcance: data.scope,
      desde: data.startsOn,
      vigencia: vigenciaTexto,
      referenciaNotarial: data.notaryReference ?? 'Sin protocolización notarial',
    },
  });
  if (!documento.ok) return fail(documento.error);

  const otorgado = await transaction(async (tx) => {
    const fila = await tx.powerGrant.create({
      data: {
        officeTermId: cargo.id,
        granteePersonId: apoderada.id,
        scope: data.scope,
        powerKind: data.powerKind,
        documentId: documento.data.documentId,
        notaryReference: data.notaryReference,
        startsOn: inicio,
        endsOn: fin,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.POWER_GRANTED,
      objectKind: 'PowerGrant',
      objectId: fila.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: {
        cargo: cargo.officeDefinition.name,
        apoderada: nombreCompleto(apoderada),
        tipo: data.powerKind,
        folio: documento.data.folio,
      },
    });

    return fila;
  });

  return ok({ powerGrantId: otorgado.id, folio: documento.data.folio });
}

export const revokePowerSchema = z.object({
  powerGrantId: z.uuid(),
  revokedOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  reason: z.string().trim().min(10).max(400),
});

export type RevokePowerInput = z.infer<typeof revokePowerSchema>;

export async function revokePower(
  actor: ActorContext,
  input: RevokePowerInput,
): Promise<UseCaseResult<{ revoked: true }>> {
  const parsed = revokePowerSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'governance.power.revoke', { kind: 'PowerGrant' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const poder = await db().powerGrant.findUnique({
    where: { id: data.powerGrantId },
    select: { id: true, revokedOn: true, startsOn: true, powerKind: true },
  });
  if (poder === null) return fail(errors.notFound('Ese poder no existe.'));
  if (poder.revokedOn !== null) return fail(errors.conflict('Ese poder ya estaba revocado.'));

  const revocadoEl = new Date(`${data.revokedOn}T00:00:00.000Z`);
  if (revocadoEl < poder.startsOn) {
    return fail(errors.validation({ revokedOn: ['La revocación no puede ser anterior al otorgamiento.'] }));
  }

  await transaction(async (tx) => {
    await tx.powerGrant.update({
      where: { id: poder.id },
      data: { revokedOn: revocadoEl, revokeReason: data.reason, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.POWER_REVOKED,
      objectKind: 'PowerGrant',
      objectId: poder.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: { tipo: poder.powerKind, revocadoEl: data.revokedOn },
    });
  });

  return ok({ revoked: true });
}

/**
 * Revoca los poderes vivos que salieron de un periodo de cargo que termina.
 *
 * La llaman `endOfficeTerm` y el trabajo que cierra los cargos vencidos, dentro
 * de su misma transacción. No es una cortesía: un poder que sobrevive al cargo
 * deja a alguien representando al sindicato en nombre de una secretaría que ya
 * no ocupa nadie.
 */
export async function revokePowersOfTerm(
  tx: Tx,
  actor: ActorContext,
  officeTermId: string,
  fecha: Date,
  motivo: string,
): Promise<number> {
  const vivos = await tx.powerGrant.findMany({
    where: { officeTermId, revokedOn: null },
    select: { id: true, powerKind: true },
  });

  for (const poder of vivos) {
    await tx.powerGrant.update({
      where: { id: poder.id },
      data: { revokedOn: fecha, revokeReason: motivo, updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, { ...actor, reason: motivo }, {
      action: AUDIT_ACTIONS.POWER_REVOKED,
      objectKind: 'PowerGrant',
      objectId: poder.id,
      outcome: 'SUCCESS',
      reason: motivo,
      metadata: { tipo: poder.powerKind, porTerminoDelCargo: true },
    });
  }

  return vivos.length;
}

export interface PowerGrantRow {
  readonly id: string;
  readonly granteeName: string;
  readonly officeName: string;
  readonly grantorName: string;
  readonly powerKind: PowerKind;
  readonly scope: string;
  readonly notaryReference: string | null;
  readonly startsOn: Date;
  readonly endsOn: Date | null;
  readonly revokedOn: Date | null;
  readonly documentPublicId: string;
  readonly documentFolio: string | null;
  /** Si el poder puede ejercerse hoy. */
  readonly live: boolean;
}

export async function powerGrantList(
  actor: ActorContext,
  filters: { readonly onlyLive?: boolean; readonly officeTermId?: string } = {},
): Promise<UseCaseResult<readonly PowerGrantRow[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'PowerGrant' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const hoy = new Date();
  const filas = await db().powerGrant.findMany({
    where: {
      ...(filters.officeTermId === undefined ? {} : { officeTermId: filters.officeTermId }),
      ...(filters.onlyLive === true
        ? { revokedOn: null, startsOn: { lte: hoy }, OR: [{ endsOn: null }, { endsOn: { gte: hoy } }] }
        : {}),
    },
    orderBy: [{ startsOn: 'desc' }],
    select: {
      id: true,
      scope: true,
      powerKind: true,
      notaryReference: true,
      startsOn: true,
      endsOn: true,
      revokedOn: true,
      document: { select: { publicId: true, folio: true } },
      granteePerson: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
      officeTerm: {
        select: {
          officeDefinition: { select: { name: true } },
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      granteeName: nombreCompleto(fila.granteePerson),
      officeName: fila.officeTerm.officeDefinition.name,
      grantorName: nombreCompleto(fila.officeTerm.person),
      powerKind: fila.powerKind,
      scope: fila.scope,
      notaryReference: fila.notaryReference,
      startsOn: fila.startsOn,
      endsOn: fila.endsOn,
      revokedOn: fila.revokedOn,
      documentPublicId: fila.document.publicId,
      documentFolio: fila.document.folio,
      live:
        fila.revokedOn === null &&
        fila.startsOn <= hoy &&
        (fila.endsOn === null || fila.endsOn >= hoy),
    })),
  );
}
