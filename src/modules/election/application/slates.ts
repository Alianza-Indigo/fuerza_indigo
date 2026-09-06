import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import { leerReglas } from '@/modules/governance/domain';
import type { SlateStatus } from '@prisma-client/enums';
import {
  alertasDePlanilla,
  componerGenero,
  type AlertaDePlanilla,
  type ComposicionDeGenero,
  type GeneroDeclarado,
} from '../domain/proportionality';

/**
 * Planillas y candidaturas (PRD §9.6; F5-ELE-003).
 *
 * **El sistema alerta, no decide.** Es la regla del PRD §9.3 y aquí se aplica
 * literalmente: una planilla con advertencias se registra igual, y las
 * advertencias se conservan con ella. Quien las revisa —la Comisión Electoral—
 * decide con ellas delante; quien registró queda con constancia de que las vio.
 *
 * Rechazar una planilla exige motivo escrito, y la base lo impone con un
 * `CHECK`: no hay forma de dejar a alguien fuera sin decirle por qué.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const slateMemberSchema = z.object({
  personId: z.uuid(),
  officeDefinitionId: z.uuid(),
  position: z.coerce.number().int().min(1).max(200),
  isSubstitute: z.boolean().default(false),
});

export const registerSlateSchema = z.object({
  electionId: z.uuid(),
  name: z.string().trim().min(3).max(200),
  members: z.array(slateMemberSchema).min(1, {
    error: () => 'Una planilla necesita al menos una candidatura.',
  }).max(60),
});

export type RegisterSlateInput = z.infer<typeof registerSlateSchema>;

export interface RegisteredSlate {
  readonly slateId: string;
  readonly warnings: readonly AlertaDePlanilla[];
  readonly composition: ComposicionDeGenero;
}

export async function registerSlate(
  actor: ActorContext,
  input: RegisterSlateInput,
): Promise<UseCaseResult<RegisteredSlate>> {
  const parsed = registerSlateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.slate.register', { kind: 'CandidateSlate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const eleccion = await db().election.findUnique({
    where: { id: data.electionId },
    select: {
      id: true,
      publicId: true,
      status: true,
      unionBodyId: true,
      normativeRuleSet: { select: { version: true, rules: true } },
      commissionMembers: { where: { unassignedAt: null }, select: { personId: true } },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  if (eleccion.status !== 'REGISTRATION_OPEN') {
    return fail(
      errors.conflict('El registro de planillas no está abierto. Una planilla fuera de plazo es impugnable de origen.'),
    );
  }

  const reglas = leerReglas(eleccion.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(errors.conflict(`La versión ${eleccion.normativeRuleSet.version} tiene umbrales incompletos.`));
  }

  const duplicadaPorNombre = await db().candidateSlate.findFirst({
    where: { electionId: eleccion.id, name: data.name, status: { not: 'WITHDRAWN' } },
    select: { id: true },
  });
  if (duplicadaPorNombre !== null) {
    return fail(errors.conflict('Ya hay una planilla con ese nombre en este proceso.'));
  }

  const personIds = [...new Set(data.members.map((integrante) => integrante.personId))];
  const officeIds = [...new Set(data.members.map((integrante) => integrante.officeDefinitionId))];

  const [personas, cargos, cargosDelOrgano] = await Promise.all([
    db().person.findMany({
      where: { id: { in: personIds } },
      select: {
        id: true,
        genderIdentity: true,
        givenName: true,
        middleName: true,
        familyName: true,
        secondFamilyName: true,
        preferredName: true,
        memberships: {
          where: { status: 'ACTIVE', category: 'UNION_MEMBER' },
          select: {
            politicalRightsSuspendedUntil: true,
            membershipType: { select: { grantsPoliticalRights: true } },
          },
        },
      },
    }),
    db().officeDefinition.findMany({
      where: { id: { in: officeIds } },
      select: { id: true, name: true, unionBodyId: true, seats: true },
    }),
    db().officeDefinition.count({ where: { unionBodyId: eleccion.unionBodyId, isActive: true } }),
  ]);

  if (personas.length !== personIds.length) {
    return fail(errors.notFound('Alguna de las personas propuestas no está en el registro.'));
  }
  if (cargos.length !== officeIds.length) {
    return fail(errors.notFound('Alguno de los cargos no existe.'));
  }
  const ajenos = cargos.filter((cargo) => cargo.unionBodyId !== eleccion.unionBodyId);
  if (ajenos.length > 0) {
    return fail(
      errors.validation({
        members: [`Estos cargos no pertenecen al órgano que se renueva: ${ajenos.map((cargo) => cargo.name).join(', ')}.`],
      }),
    );
  }

  const porPersona = new Map(personas.map((persona) => [persona.id, persona]));
  const ahora = new Date();

  // Advertencias: se calculan, se enseñan y se guardan. No detienen el registro.
  const repetidas = new Map<string, number>();
  for (const integrante of data.members) {
    repetidas.set(integrante.personId, (repetidas.get(integrante.personId) ?? 0) + 1);
  }
  const duplicados = [...repetidas.entries()]
    .filter(([, veces]) => veces > 1)
    .map(([id]) => {
      const persona = porPersona.get(id);
      return persona === undefined ? id : nombreCompleto(persona);
    });

  const sinDerechos = personas
    .filter((persona) => {
      const membresia = persona.memberships[0];
      if (membresia === undefined) return true;
      if (!membresia.membershipType.grantsPoliticalRights) return true;
      return (
        membresia.politicalRightsSuspendedUntil !== null && membresia.politicalRightsSuspendedUntil > ahora
      );
    })
    .map((persona) => nombreCompleto(persona));

  const enComision = new Set(eleccion.commissionMembers.map((integrante) => integrante.personId));
  const juezYParte = personas
    .filter((persona) => enComision.has(persona.id))
    .map((persona) => nombreCompleto(persona));

  const generos: GeneroDeclarado[] = data.members.map((integrante) => {
    const persona = porPersona.get(integrante.personId);
    return persona?.genderIdentity ?? 'UNDISCLOSED';
  });
  const composicion = componerGenero(generos);

  const cargosCubiertos = new Set(
    data.members.filter((integrante) => !integrante.isSubstitute).map((integrante) => integrante.officeDefinitionId),
  ).size;

  const alertas = alertasDePlanilla({
    composicion,
    porcentajeMinimo: reglas.genderProportionalityMinPercent,
    cargosDelOrgano,
    cargosCubiertos,
    duplicados,
    sinDerechosPoliticos: sinDerechos,
    enComisionElectoral: juezYParte,
  });

  const registrada = await transaction(async (tx) => {
    const fila = await tx.candidateSlate.create({
      data: {
        electionId: eleccion.id,
        name: data.name,
        status: 'SUBMITTED',
        genderComposition: { ...composicion },
        complianceWarnings: alertas.map((alerta) => ({ ...alerta })),
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.slateMember.createMany({
      data: data.members.map((integrante) => ({
        slateId: fila.id,
        personId: integrante.personId,
        officeDefinitionId: integrante.officeDefinitionId,
        position: integrante.position,
        isSubstitute: integrante.isSubstitute,
      })),
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.SLATE_REGISTERED,
      objectKind: 'CandidateSlate',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: {
        eleccion: eleccion.publicId,
        planilla: data.name,
        integrantes: data.members.length,
        advertencias: alertas.map((alerta) => alerta.codigo),
        composicion: { ...composicion },
      },
    });

    return fila;
  });

  return ok({ slateId: registrada.id, warnings: alertas, composition: composicion });
}

export const decideSlateSchema = z
  .object({
    slateId: z.uuid(),
    decision: z.enum(['VALIDATED', 'REJECTED']),
    rejectionReason: z.string().trim().max(400).nullable().default(null),
  })
  .refine(
    (valor) =>
      valor.decision !== 'REJECTED' ||
      (valor.rejectionReason !== null && valor.rejectionReason.trim().length >= 20),
    {
      error: () => 'Rechazar una planilla exige motivo escrito: al menos veinte caracteres.',
      path: ['rejectionReason'],
    },
  );

export type DecideSlateInput = z.infer<typeof decideSlateSchema>;

/**
 * Valida o rechaza una planilla.
 *
 * La decide la Comisión Electoral, y quien la decide **no puede figurar en
 * ella**: la comprobación está aquí y no solo en la declaración de integración,
 * porque una declaración firmada hace meses no impide que alguien se sume a una
 * planilla después.
 */
export async function decideSlate(
  actor: ActorContext,
  input: DecideSlateInput,
): Promise<UseCaseResult<{ status: SlateStatus }>> {
  const parsed = decideSlateSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto =
    data.rejectionReason === null ? actor : { ...actor, reason: data.rejectionReason };
  const decision = can(contexto, 'election.slate.validate', { kind: 'CandidateSlate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienDecide = actor.userId;
  if (quienDecide === null || quienDecide === undefined) {
    return fail(errors.forbidden('Validar una planilla es un acto de una persona: exige una cuenta.'));
  }

  const planilla = await db().candidateSlate.findUnique({
    where: { id: data.slateId },
    select: {
      id: true,
      name: true,
      status: true,
      electionId: true,
      election: { select: { publicId: true, status: true } },
      members: { select: { personId: true } },
    },
  });
  if (planilla === null) return fail(errors.notFound('Esa planilla no existe.'));
  if (planilla.status === 'VALIDATED' || planilla.status === 'REJECTED') {
    return fail(errors.conflict('Esa planilla ya tiene resolución.'));
  }
  if (planilla.status === 'WITHDRAWN') {
    return fail(errors.conflict('Esa planilla se retiró.'));
  }

  const cuenta = await db().user.findUnique({ where: { id: quienDecide }, select: { personId: true } });
  if (cuenta === null) return fail(errors.notFound('No se encontró a la persona titular de la cuenta.'));

  if (planilla.members.some((integrante) => integrante.personId === cuenta.personId)) {
    return fail(
      errors.forbidden('Figuras en esa planilla. Nadie resuelve sobre la candidatura en la que participa.'),
    );
  }

  const esComision = await db().electionCommissionMember.findUnique({
    where: { electionId_personId: { electionId: planilla.electionId, personId: cuenta.personId } },
    select: { unassignedAt: true },
  });
  if (esComision === null || esComision.unassignedAt !== null) {
    return fail(
      errors.forbidden('Solo la Comisión Electoral de este proceso valida sus planillas.'),
    );
  }

  await transaction(async (tx) => {
    await tx.candidateSlate.update({
      where: { id: planilla.id },
      data: {
        status: data.decision,
        rejectionReason: data.decision === 'REJECTED' ? data.rejectionReason : null,
        validatedById: quienDecide,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: data.decision === 'VALIDATED' ? AUDIT_ACTIONS.SLATE_VALIDATED : AUDIT_ACTIONS.SLATE_REJECTED,
      objectKind: 'CandidateSlate',
      objectId: planilla.id,
      outcome: 'SUCCESS',
      ...(data.rejectionReason === null ? {} : { reason: data.rejectionReason }),
      metadata: { eleccion: planilla.election.publicId, planilla: planilla.name },
    });
  });

  return ok({ status: data.decision });
}

export interface SlateRow {
  readonly id: string;
  readonly name: string;
  readonly status: SlateStatus;
  readonly registeredAt: Date;
  readonly rejectionReason: string | null;
  readonly composition: ComposicionDeGenero | null;
  readonly warnings: readonly AlertaDePlanilla[];
  readonly members: readonly {
    readonly personName: string;
    readonly officeName: string;
    readonly position: number;
    readonly isSubstitute: boolean;
  }[];
}

function comoComposicion(valor: unknown): ComposicionDeGenero | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const bruto = valor as Record<string, unknown>;
  const numero = (clave: string): number => (typeof bruto[clave] === 'number' ? bruto[clave] : 0);
  const porcentaje = (clave: string): number | null =>
    typeof bruto[clave] === 'number' ? bruto[clave] : null;
  return {
    total: numero('total'),
    mujeres: numero('mujeres'),
    hombres: numero('hombres'),
    noBinarias: numero('noBinarias'),
    otras: numero('otras'),
    sinDeclarar: numero('sinDeclarar'),
    declarantes: numero('declarantes'),
    porcentajeMujeres: porcentaje('porcentajeMujeres'),
    porcentajeHombres: porcentaje('porcentajeHombres'),
  };
}

function comoAlertas(valor: unknown): readonly AlertaDePlanilla[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((entrada) => {
    if (typeof entrada !== 'object' || entrada === null) return [];
    const bruto = entrada as Record<string, unknown>;
    if (typeof bruto['codigo'] !== 'string' || typeof bruto['mensaje'] !== 'string') return [];
    return [{ codigo: bruto['codigo'], mensaje: bruto['mensaje'] }];
  });
}

export async function slateList(
  actor: ActorContext,
  electionId: string,
): Promise<UseCaseResult<readonly SlateRow[]>> {
  const decision = can(actor, 'voting.process.read', { kind: 'CandidateSlate' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().candidateSlate.findMany({
    where: { electionId },
    orderBy: { registeredAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      registeredAt: true,
      rejectionReason: true,
      genderComposition: true,
      complianceWarnings: true,
      members: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          isSubstitute: true,
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
      name: fila.name,
      status: fila.status,
      registeredAt: fila.registeredAt,
      rejectionReason: fila.rejectionReason,
      composition: comoComposicion(fila.genderComposition),
      warnings: comoAlertas(fila.complianceWarnings),
      members: fila.members.map((integrante) => ({
        personName: nombreCompleto(integrante.person),
        officeName: integrante.officeDefinition.name,
        position: integrante.position,
        isSubstitute: integrante.isSubstitute,
      })),
    })),
  );
}
