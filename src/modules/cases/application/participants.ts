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
import type { CaseMembershipQuality, CaseParticipantRole } from '@prisma-client/enums';
import { EXIGEN_REPRESENTACION, VEN_EL_EXPEDIENTE } from '../domain/participation';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Participantes de un expediente y su calidad (PRD §10.2).
 *
 * Tres decisiones que no son de forma:
 *
 * **La calidad no se teclea, se deriva.** Quién es agremiada, honoraria o
 * persona beneficiaria ya está en el padrón; pedirlo a mano invita a poner lo
 * que a alguien le parece y produce expedientes que contradicen la afiliación.
 * Se lee al agregar y se **copia**: si la persona pierde después la membresía,
 * el expediente tiene que seguir diciendo con qué calidad intervino.
 *
 * **Quien representa tiene que tener acreditada la representación.** Una
 * relación de cuidado viva (Fase 4) es lo que separa a una representante de
 * alguien que dice serlo. Sin ella no se agrega como representante: se agrega
 * como testigo, como familiar, o no se agrega.
 *
 * **Ver el expediente no viene con figurar en él.** Una contraparte figura y no
 * mira; una persona beneficiaria mira lo suyo. Se decide por el papel que
 * juega, no por una casilla que alguien marca al pasar.
 */

export const addParticipantSchema = z
  .object({
    caseId: z.uuid(),
    /** Persona del padrón. Excluyente con el nombre externo. */
    personId: z.uuid().nullable().default(null),
    /** Contraparte o institución sin registro en el padrón. */
    externalName: z.string().trim().min(3).max(160).nullable().default(null),
    role: z.enum([
      'APPLICANT',
      'AFFECTED_PERSON',
      'REPRESENTATIVE',
      'FAMILY_OR_CAREGIVER',
      'WITNESS',
      'COUNTERPART',
      'EXTERNAL_INSTITUTION',
    ] as const satisfies readonly CaseParticipantRole[]),
    reason: z.string().trim().min(10, {
      error: () => 'Escribe por qué se agrega a esta persona al expediente.',
    }),
  })
  .refine((valor) => (valor.personId === null) !== (valor.externalName === null), {
    error: () =>
      'Un participante es una persona del padrón o alguien de fuera con nombre, nunca las dos cosas ni ninguna.',
    path: ['personId'],
  });

export type AddParticipantInput = z.input<typeof addParticipantSchema>;

export const removeParticipantSchema = z.object({
  participantId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué deja de figurar: retirar a alguien de un expediente es un acto.',
  }),
});

export type RemoveParticipantInput = z.infer<typeof removeParticipantSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Con qué calidad interviene, leída del padrón en este momento.
 *
 * Una persona puede tener varias calidades a la vez (PRD §3.1) y aquí interesa
 * la que más derechos le da en el expediente: si es agremiada, es agremiada,
 * aunque además sea beneficiaria de otra atención.
 */
async function calidadDe(personId: string): Promise<CaseMembershipQuality> {
  const membresias = await db().membership.findMany({
    where: { personId, status: { in: ['ACTIVE', 'SUSPENDED', 'DISCIPLINARY_PROCESS'] } },
    select: { membershipType: { select: { category: true } } },
  });

  if (membresias.some((membresia) => membresia.membershipType.category === 'UNION_MEMBER')) {
    return 'UNION_MEMBER';
  }
  if (membresias.some((membresia) => membresia.membershipType.category === 'HONORARY_AFFILIATE')) {
    return 'HONORARY_AFFILIATE';
  }

  const beneficiaria = await db().protectedBeneficiary.findFirst({
    where: { personId, closedAt: null },
    select: { id: true },
  });
  return beneficiaria === null ? 'NONE' : 'PROTECTED_BENEFICIARY';
}

/** Personas del expediente sobre las que se puede representar. */
async function personasDelExpediente(caseId: string): Promise<readonly string[]> {
  const filas = await db().caseParticipant.findMany({
    where: {
      caseId,
      removedAt: null,
      personId: { not: null },
      role: { in: ['APPLICANT', 'AFFECTED_PERSON'] },
    },
    select: { personId: true },
  });
  return filas.flatMap((fila) => (fila.personId === null ? [] : [fila.personId]));
}

export async function addParticipant(
  actor: ActorContext,
  input: AddParticipantInput,
): Promise<UseCaseResult<{ participantId: string; calidad: CaseMembershipQuality; veElExpediente: boolean }>> {
  const parsed = addParticipantSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de tocar a quién figura en él.'));
  }

  const asignada = await estaAsignada(actor, expediente.id);
  const contexto = { ...actor, reason: data.reason };
  const decision = can(
    contexto,
    'cases.participant.manage',
    { ...recursoDelExpediente(expediente), kind: 'CaseParticipant' },
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  let calidad: CaseMembershipQuality = 'NONE';
  let etiqueta = data.externalName ?? '';

  if (data.personId !== null) {
    const persona = await db().person.findUnique({
      where: { id: data.personId },
      select: {
        id: true,
        givenName: true,
        middleName: true,
        familyName: true,
        secondFamilyName: true,
        preferredName: true,
      },
    });
    if (persona === null) return fail(errors.notFound('Esa persona no existe en el registro.'));
    etiqueta = nombreCompleto(persona);

    const yaFigura = await db().caseParticipant.findFirst({
      where: { caseId: expediente.id, personId: persona.id, removedAt: null },
      select: { role: true },
    });
    if (yaFigura !== null) {
      return fail(errors.conflict(`Esa persona ya figura en el expediente como ${yaFigura.role}.`));
    }

    calidad = await calidadDe(persona.id);

    if (EXIGEN_REPRESENTACION.includes(data.role)) {
      const representadas = await personasDelExpediente(expediente.id);
      if (representadas.length === 0) {
        return fail(
          errors.conflict(
            'Todavía no hay nadie en el expediente a quien representar. Agrega primero a la persona afectada.',
          ),
        );
      }
      const ahora = new Date();
      const relacion = await db().careRelationship.findFirst({
        where: {
          fromPersonId: persona.id,
          toPersonId: { in: [...representadas] },
          revokedAt: null,
          startsAt: { lte: ahora },
          OR: [{ endsAt: null }, { endsAt: { gt: ahora } }],
        },
        select: { id: true, kind: true },
      });
      if (relacion === null) {
        return fail(
          errors.conflict(
            'No consta una relación de cuidado o representación viva con la persona del expediente. Regístrala antes: quien representa tiene que poder acreditarlo.',
          ),
        );
      }
    }
  }

  const veElExpediente = data.personId !== null && VEN_EL_EXPEDIENTE.includes(data.role);

  const agregado = await transaction(async (tx) => {
    const fila = await tx.caseParticipant.create({
      data: {
        caseId: expediente.id,
        personId: data.personId,
        externalName: data.externalName,
        role: data.role,
        membershipQuality: calidad,
        canViewCase: veElExpediente,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'PARTICIPANT_ADDED',
        actorId: actor.actorId,
        summary: `${etiqueta} figura como ${data.role}.`,
        payload: { rol: data.role, calidad, veElExpediente, motivo: data.reason },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_PARTICIPANT_ADDED,
      objectKind: 'CaseParticipant',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      reason: data.reason,
      metadata: { folio: expediente.folio, rol: data.role, calidad },
    });

    return fila;
  });

  return ok({ participantId: agregado.id, calidad, veElExpediente });
}

export async function removeParticipant(
  actor: ActorContext,
  input: RemoveParticipantInput,
): Promise<UseCaseResult<{ participantId: string }>> {
  const parsed = removeParticipantSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const participante = await db().caseParticipant.findUnique({
    where: { id: data.participantId },
    select: {
      id: true,
      role: true,
      removedAt: true,
      case: { select: { ...CAMPOS_PARA_DECIDIR, folio: true } },
    },
  });
  if (participante === null) return fail(errors.notFound('Ese participante no existe.'));
  if (participante.removedAt !== null) {
    return fail(errors.conflict('Esa persona ya dejó de figurar en el expediente.'));
  }
  if (participante.role === 'APPLICANT') {
    return fail(
      errors.conflict(
        'Quien pidió ayuda no se retira del expediente: el expediente existe porque esa persona lo pidió.',
      ),
    );
  }

  const asignada = await estaAsignada(actor, participante.case.id);
  const contexto = { ...actor, reason: data.reason };
  const decision = can(
    contexto,
    'cases.participant.manage',
    { ...recursoDelExpediente(participante.case), kind: 'CaseParticipant' },
    { hasLiveAssignment: () => asignada },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  await transaction(async (tx) => {
    await tx.caseParticipant.update({
      where: { id: participante.id },
      data: {
        removedAt: new Date(),
        removeReason: data.reason,
        // Deja de figurar y deja de ver: si conservara el acceso, retirar a
        // alguien del expediente sería solo un cambio de etiqueta.
        canViewCase: false,
        updatedByActorId: actor.actorId,
      },
    });

    await tx.caseEvent.create({
      data: {
        caseId: participante.case.id,
        kind: 'PARTICIPANT_REMOVED',
        actorId: actor.actorId,
        summary: `Deja de figurar quien constaba como ${participante.role}.`,
        payload: { rol: participante.role, motivo: data.reason },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_PARTICIPANT_REMOVED,
      objectKind: 'CaseParticipant',
      objectId: participante.id,
      outcome: 'SUCCESS',
      legalEntityId: participante.case.legalEntityId,
      reason: data.reason,
      metadata: { folio: participante.case.folio, rol: participante.role },
    });
  });

  return ok({ participantId: participante.id });
}
