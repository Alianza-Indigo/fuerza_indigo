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
import { incompatibleOffices } from './bodies';
import { revokePowersOfTerm } from './powers';
import type { DesignationMethod } from '@prisma-client/enums';

/**
 * Periodos de cargo, suplencias y poderes (PRD §9.2, §4.3; F5-GOB-002).
 *
 * **Un cargo vencido pierde el acceso sin que nadie intervenga.** Esa es la
 * frase del PRD §24 Fase 5 que gobierna este archivo, y se cumple porque el
 * acceso *no* se concede aparte del cargo: nombrar crea la `RoleAssignment` y
 * la ata al periodo con `endsAt`; el trabajo `role-expiry` la revoca al vencer.
 * No hay un segundo sitio desde el que dar el mismo acceso, así que no hay un
 * segundo sitio del que olvidarse de quitarlo.
 *
 * **Nombrar es un acto institucional, no un favor.** Exige motivo escrito, deja
 * asiento, y comprueba tres cosas antes: que quien va a ocupar el cargo sea
 * agremiado en pleno goce de derechos, que el cargo tenga plaza libre, y que no
 * ocupe ya un cargo incompatible.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const appointOfficeSchema = z.object({
  officeDefinitionId: z.uuid(),
  membershipId: z.uuid({ error: () => 'Elige la membresía de quien ocupará el cargo.' }),
  territorialUnitId: z.uuid().nullable().default(null),
  designationMethod: z.enum(['ELECTION', 'ASSEMBLY_APPOINTMENT', 'SUBSTITUTION', 'INTERIM']),
  electionId: z.uuid().nullable().default(null),
  substitutedTermId: z.uuid().nullable().default(null),
  startsOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe el motivo del nombramiento: al menos diez caracteres.',
  }),
});

export type AppointOfficeInput = z.infer<typeof appointOfficeSchema>;

/** Suma meses a una fecha civil sin arrastrar husos horarios. */
function sumarMeses(desde: Date, meses: number): Date {
  const fin = new Date(desde.getTime());
  const diaOriginal = fin.getUTCDate();
  fin.setUTCMonth(fin.getUTCMonth() + meses);
  // Si el mes destino es más corto, `setUTCMonth` desborda al siguiente.
  if (fin.getUTCDate() !== diaOriginal) fin.setUTCDate(0);
  return fin;
}

/**
 * Designa a una persona en un cargo y le concede el acceso que el cargo confiere.
 *
 * El periodo y la asignación de rol nacen en la **misma transacción** y con la
 * misma fecha de fin. Separarlas dejaría la puerta abierta a que una exista sin
 * la otra, que es exactamente el defecto que la Fase 4 encontró al activar
 * membresías sin conceder el rol (`D-F4-014`).
 */
export async function appointOffice(
  actor: ActorContext,
  input: AppointOfficeInput,
): Promise<UseCaseResult<{ officeTermId: string; endsOn: Date }>> {
  const parsed = appointOfficeSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const conMotivo: ActorContext = { ...actor, reason: data.reason };

  const decision = can(conMotivo, 'governance.office.appoint', { kind: 'OfficeTerm' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const office = await db().officeDefinition.findUnique({
    where: { id: data.officeDefinitionId },
    select: {
      id: true,
      name: true,
      seats: true,
      termMonths: true,
      grantsRoleCode: true,
      isActive: true,
      unionBody: { select: { id: true, legalEntityId: true, status: true } },
    },
  });
  if (office === null) return fail(errors.notFound('No existe ese cargo.'));
  if (!office.isActive || office.unionBody.status !== 'ACTIVE') {
    return fail(errors.conflict('Ese cargo no está activo.'));
  }

  const membership = await db().membership.findUnique({
    where: { id: data.membershipId },
    select: { id: true, status: true, personId: true, category: true, membershipTypeId: true },
  });
  if (membership === null) return fail(errors.notFound('No existe esa membresía.'));

  const [persona, calidad, usuario] = await Promise.all([
    db().person.findUnique({
      where: { id: membership.personId },
      select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
    }),
    db().membershipType.findUnique({
      where: { id_category: { id: membership.membershipTypeId, category: membership.category } },
      select: { grantsPoliticalRights: true },
    }),
    db().user.findUnique({ where: { personId: membership.personId }, select: { id: true } }),
  ]);
  if (persona === null || calidad === null) return fail(errors.notFound('No existe esa membresía.'));

  // Solo agremiados en pleno goce de derechos ocupan un cargo (PRD §9.2).
  if (membership.status !== 'ACTIVE') {
    return fail(errors.conflict('Solo una membresía activa puede ocupar un cargo.'));
  }
  if (!calidad.grantsPoliticalRights) {
    return fail(
      errors.conflict(
        'Esa calidad no concede derechos políticos, así que no puede ocupar un cargo de gobierno sindical.',
      ),
    );
  }

  const inicio = new Date(`${data.startsOn}T00:00:00.000Z`);
  const fin = sumarMeses(inicio, office.termMonths);

  // Plazas libres: se cuentan los periodos vivos que se traslapan con este.
  const ocupadas = await db().officeTerm.count({
    where: {
      officeDefinitionId: office.id,
      endedEarlyOn: null,
      startsOn: { lt: fin },
      endsOn: { gt: inicio },
    },
  });
  if (ocupadas >= office.seats) {
    return fail(
      errors.conflict(
        `Ese cargo tiene ${String(office.seats)} plaza(s) y todas están ocupadas en el periodo que pides.`,
      ),
    );
  }

  // Incompatibilidades: quien ocupa un cargo incompatible no puede ocupar este.
  const incompatibles = await incompatibleOffices(office.id);
  if (incompatibles.length > 0) {
    const choque = await db().officeTerm.findFirst({
      where: {
        personId: membership.personId,
        officeDefinitionId: { in: [...incompatibles] },
        endedEarlyOn: null,
        startsOn: { lt: fin },
        endsOn: { gt: inicio },
      },
      select: { officeDefinition: { select: { name: true } } },
    });
    if (choque !== null) {
      return fail(
        errors.conflict(
          `Esta persona ocupa «${choque.officeDefinition.name}», que el estatuto declara incompatible con este cargo.`,
        ),
      );
    }
  }

  const userId = usuario?.id ?? null;

  const resultado = await transaction(async (tx) => {
    let roleAssignmentId: string | null = null;

    // Sin cuenta de usuario no hay acceso que conceder: el nombramiento consta
    // igual, y la persona lo recibirá al activar su cuenta.
    const otorgante = actor.userId;
    if (userId !== null && otorgante !== null && otorgante !== undefined) {
      const role = await tx.role.findUnique({ where: { code: office.grantsRoleCode }, select: { id: true } });
      if (role !== null) {
        const asignacion = await tx.roleAssignment.create({
          data: {
            userId,
            roleId: role.id,
            legalEntityId: office.unionBody.legalEntityId,
            grantedById: otorgante,
            grantReason: data.reason,
            startsAt: inicio,
            endsAt: fin,
            ...(data.territorialUnitId === null
              ? {}
              : {
                  territorialScopes: {
                    create: [{ territorialUnitId: data.territorialUnitId, includesDescendants: true }],
                  },
                }),
          },
          select: { id: true },
        });
        roleAssignmentId = asignacion.id;

        await recordAudit(tx, conMotivo, {
          action: AUDIT_ACTIONS.ROLE_GRANTED,
          objectKind: 'RoleAssignment',
          objectId: asignacion.id,
          outcome: 'SUCCESS',
          reason: data.reason,
          metadata: { roleCode: office.grantsRoleCode, porCargo: office.name },
        });
      }
    }

    const term = await tx.officeTerm.create({
      data: {
        officeDefinitionId: office.id,
        personId: membership.personId,
        membershipId: membership.id,
        territorialUnitId: data.territorialUnitId,
        designationMethod: data.designationMethod,
        electionId: data.electionId,
        substitutedTermId: data.substitutedTermId,
        startsOn: inicio,
        endsOn: fin,
        roleAssignmentId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, endsOn: true },
    });

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.OFFICE_APPOINTED,
      objectKind: 'OfficeTerm',
      objectId: term.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: {
        cargo: office.name,
        persona: nombreCompleto(persona),
        desde: data.startsOn,
        hasta: fin.toISOString().slice(0, 10),
        metodo: data.designationMethod,
      },
    });

    return term;
  });

  return ok({ officeTermId: resultado.id, endsOn: resultado.endsOn });
}

export const endOfficeTermSchema = z.object({
  officeTermId: z.uuid(),
  endedOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué concluye antes de tiempo: al menos diez caracteres.',
  }),
});

/**
 * Concluye un periodo antes de su vencimiento.
 *
 * Retira el acceso en la misma transacción. El historial no se toca: quien
 * ocupó el cargo lo ocupó, y los actos que firmó siguen atribuidos.
 */
export async function endOfficeTerm(
  actor: ActorContext,
  input: z.infer<typeof endOfficeTermSchema>,
): Promise<UseCaseResult<{ ended: true }>> {
  const parsed = endOfficeTermSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const conMotivo: ActorContext = { ...actor, reason: data.reason };

  const decision = can(conMotivo, 'governance.office.end', { kind: 'OfficeTerm' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const term = await db().officeTerm.findUnique({
    where: { id: data.officeTermId },
    select: {
      id: true,
      endedEarlyOn: true,
      roleAssignmentId: true,
      officeDefinition: { select: { name: true } },
    },
  });
  if (term === null) return fail(errors.notFound('No existe ese periodo de cargo.'));
  if (term.endedEarlyOn !== null) return fail(errors.conflict('Ese periodo ya está concluido.'));

  await transaction(async (tx) => {
    await tx.officeTerm.update({
      where: { id: term.id },
      data: {
        endedEarlyOn: new Date(`${data.endedOn}T00:00:00.000Z`),
        endReason: data.reason,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    if (term.roleAssignmentId !== null) {
      await tx.roleAssignment.update({
        where: { id: term.roleAssignmentId },
        data: {
          revokedAt: new Date(),
          revokedById: actor.userId ?? null,
          revokeReason: data.reason,
        },
      });
      await recordAudit(tx, conMotivo, {
        action: AUDIT_ACTIONS.ROLE_REVOKED,
        objectKind: 'RoleAssignment',
        objectId: term.roleAssignmentId,
        outcome: 'SUCCESS',
        reason: data.reason,
        metadata: { porConclusionDeCargo: term.officeDefinition.name },
      });
    }

    const poderes = await revokePowersOfTerm(
      tx,
      actor,
      term.id,
      new Date(`${data.endedOn}T00:00:00.000Z`),
      `Conclusión del periodo de «${term.officeDefinition.name}»`,
    );

    await recordAudit(tx, conMotivo, {
      action: AUDIT_ACTIONS.OFFICE_ENDED,
      objectKind: 'OfficeTerm',
      objectId: term.id,
      outcome: 'SUCCESS',
      reason: data.reason,
      metadata: { cargo: term.officeDefinition.name, hasta: data.endedOn, poderesRevocados: poderes },
    });
  });

  return ok({ ended: true });
}

/**
 * Retira lo que conceden los periodos que vencieron: el acceso y los poderes.
 * Lo ejecuta el trabajo `role-expiry`, y devuelve cuántos cerró para que el
 * trabajo lo asiente.
 *
 * No cambia el periodo: `endsOn` ya pasó y eso es un hecho, no un estado que
 * haya que escribir. Lo único que hace falta es que deje de conceder.
 */
export async function revokeExpiredOfficeAccess(
  tx: Tx,
  actor: ActorContext,
  ahora: Date,
): Promise<{ revoked: number }> {
  // Se buscan los periodos vencidos que todavía **conceden algo**: un acceso
  // vivo o un poder vivo. Mirar solo el acceso dejaba fuera al cargo cuyo rol ya
  // se había revocado a mano y cuyos poderes seguían en pie.
  const vencidos = await tx.officeTerm.findMany({
    where: {
      endsOn: { lt: ahora },
      endedEarlyOn: null,
      OR: [
        { roleAssignment: { revokedAt: null } },
        { powerGrants: { some: { revokedOn: null } } },
      ],
    },
    select: {
      id: true,
      roleAssignmentId: true,
      roleAssignment: { select: { revokedAt: true } },
      officeDefinition: { select: { name: true } },
    },
  });

  for (const term of vencidos) {
    if (term.roleAssignmentId !== null && term.roleAssignment?.revokedAt === null) {
      await tx.roleAssignment.update({
        where: { id: term.roleAssignmentId },
        data: { revokedAt: ahora, revokeReason: 'Periodo de cargo concluido' },
      });
    }
    const poderes = await revokePowersOfTerm(
      tx,
      actor,
      term.id,
      ahora,
      `Vencimiento del periodo de «${term.officeDefinition.name}»`,
    );

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.OFFICE_EXPIRED,
      objectKind: 'OfficeTerm',
      objectId: term.id,
      outcome: 'SUCCESS',
      metadata: { cargo: term.officeDefinition.name, poderesRevocados: poderes },
    });
  }

  return { revoked: vencidos.length };
}

export interface OfficeTermRow {
  readonly id: string;
  readonly officeName: string;
  readonly bodyName: string;
  readonly personName: string;
  readonly personId: string;
  readonly startsOn: Date;
  readonly endsOn: Date;
  readonly endedEarlyOn: Date | null;
  readonly designationMethod: DesignationMethod;
  readonly territory: string | null;
  /** Si el acceso que el cargo concede sigue vivo. */
  readonly accessLive: boolean;
}

export async function officeTermList(
  actor: ActorContext,
  filters: { readonly onlyLive?: boolean; readonly officeDefinitionId?: string } = {},
): Promise<UseCaseResult<readonly OfficeTermRow[]>> {
  const decision = can(actor, 'governance.body.read', { kind: 'OfficeTerm' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ahora = new Date();
  const filas = await db().officeTerm.findMany({
    where: {
      ...(filters.officeDefinitionId === undefined ? {} : { officeDefinitionId: filters.officeDefinitionId }),
      ...(filters.onlyLive === true ? { endedEarlyOn: null, endsOn: { gte: ahora } } : {}),
    },
    orderBy: [{ endsOn: 'desc' }],
    select: {
      id: true,
      startsOn: true,
      endsOn: true,
      endedEarlyOn: true,
      designationMethod: true,
      personId: true,
      person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true } },
      officeDefinition: { select: { name: true, unionBody: { select: { name: true } } } },
      territorialUnit: { select: { name: true } },
      roleAssignment: { select: { revokedAt: true, endsAt: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      officeName: fila.officeDefinition.name,
      bodyName: fila.officeDefinition.unionBody.name,
      personName: nombreCompleto(fila.person),
      personId: fila.personId,
      startsOn: fila.startsOn,
      endsOn: fila.endsOn,
      endedEarlyOn: fila.endedEarlyOn,
      designationMethod: fila.designationMethod,
      territory: fila.territorialUnit?.name ?? null,
      accessLive:
        fila.roleAssignment !== null &&
        fila.roleAssignment.revokedAt === null &&
        (fila.roleAssignment.endsAt === null || fila.roleAssignment.endsAt > ahora),
    })),
  );
}
