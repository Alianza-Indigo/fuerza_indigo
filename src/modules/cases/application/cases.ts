import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { newPublicId } from '@/platform/kernel/ids';
import type { CaseDomain, CasePriority, SupportRequestType } from '@prisma-client/enums';
import { compartimentoDe } from '../domain/access';

/**
 * Apertura y valoración del expediente de caso (PRD §10.2, Fase 6).
 *
 * **Un expediente no nace de una propuesta, nace de una decisión.** La entrada
 * pública propone canalización y no ejecuta nada; abrir el expediente exige que
 * esa canalización esté confirmada por una persona. Sin esa confirmación el
 * caso de uso se niega, y ese es el punto donde el criterio del PRD §24 —«la
 * propuesta automática no sustituye confirmación humana»— deja de ser una frase
 * y pasa a ser una condición.
 *
 * **El relato original es inalterable.** Se copia tal cual de lo que la persona
 * escribió y el motor retira el privilegio de actualización sobre esa columna.
 * La valoración de quien atiende se escribe **al lado**, en otra columna: una
 * valoración que reescribiera el relato borraría la única versión que no pasó
 * por la organización.
 *
 * **Quien abre queda asignada.** No es una comodidad: los permisos de caso
 * exigen asignación, así que abrir un expediente sin asignarse a él produciría
 * uno que su propia autora no puede leer. Eso ya pasó en el módulo
 * disciplinario y costó una fase entera inalcanzable.
 */

export const openCaseSchema = z.object({
  /** Solicitud de la que nace. Un caso puede abrirse sin ella. */
  supportRequestId: z.uuid().nullable().default(null),
  /** Entidad responsable. Con solicitud, tiene que ser la confirmada. */
  legalEntityId: z.uuid({ error: () => 'Elige la entidad responsable.' }),
  domain: z.enum(['UNION_DEFENSE', 'SOCIAL_ATTENTION'] as const satisfies readonly CaseDomain[]),
  caseType: z.enum([
    'GENERAL_CONTACT',
    'INDIVIDUAL_LABOR_DISPUTE',
    'COLLECTIVE_DISPUTE',
    'DISCRIMINATION_OR_ADJUSTMENTS',
    'EDUCATION_ACCESS',
    'HEALTH_ACCESS',
    'ACCESSIBILITY',
    'FAMILY_GUIDANCE',
    'PSYCHOSOCIAL_RISK',
    'VIOLENCE_OR_URGENCY',
    'TRAINING_OR_INSTITUTIONAL_SUPPORT',
    'OTHER',
  ] as const satisfies readonly SupportRequestType[]),
  territorialUnitId: z.uuid().nullable().default(null),
  /**
   * Lo que se cuenta al abrir. Con solicitud se copia de ella y este campo
   * sobra; sin solicitud, alguien lo escribe porque se lo contaron en persona.
   */
  summary: z.string().trim().min(30).max(50_000).nullable().default(null),
  priority: z
    .enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const satisfies readonly CasePriority[])
    .default('NORMAL'),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se abre el expediente: al menos diez caracteres.',
  }),
});

export type OpenCaseInput = z.input<typeof openCaseSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Serie por entidad y año, bajo bloqueo consultivo para que no se repita. */
const PREFIJO: Record<CaseDomain, string> = {
  UNION_DEFENSE: 'DEF',
  SOCIAL_ATTENTION: 'ATN',
};

export async function openCase(
  actor: ActorContext,
  input: OpenCaseInput,
): Promise<UseCaseResult<{ caseId: string; folio: string; publicId: string }>> {
  const parsed = openCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.case.open', {
    kind: 'Case',
    legalEntityId: data.legalEntityId,
    compartment: compartimentoDe(data.domain),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienAbre = actor.userId;
  if (quienAbre === null || quienAbre === undefined) {
    return fail(errors.forbidden('Abrir un expediente es un acto de una persona: exige una cuenta.'));
  }

  const entidad = await db().legalEntity.findUnique({
    where: { id: data.legalEntityId },
    select: { id: true },
  });
  if (entidad === null) return fail(errors.notFound('Esa entidad no existe.'));

  let relato = data.summary;
  let personaSolicitante: string | null = null;
  let territorio = data.territorialUnitId;

  if (data.supportRequestId !== null) {
    const solicitud = await db().supportRequest.findUnique({
      where: { id: data.supportRequestId },
      select: {
        id: true,
        folio: true,
        narrative: true,
        status: true,
        personId: true,
        territorialUnitId: true,
        confirmedRoutingLegalEntityId: true,
        case: { select: { id: true } },
      },
    });
    if (solicitud === null) return fail(errors.notFound('Esa solicitud no existe.'));
    if (solicitud.case !== null) {
      return fail(errors.conflict('Esa solicitud ya tiene expediente abierto.'));
    }

    // Aquí es donde la confirmación humana deja de ser una promesa.
    if (solicitud.confirmedRoutingLegalEntityId === null) {
      return fail(
        errors.conflict(
          'La canalización de esta solicitud no está confirmada. Una propuesta del sistema no abre expedientes: confírmala primero.',
        ),
      );
    }
    if (solicitud.confirmedRoutingLegalEntityId !== data.legalEntityId) {
      return fail(
        errors.conflict(
          'El expediente se abre en una entidad distinta de la que se confirmó. Cambia la confirmación o abre donde se canalizó.',
        ),
      );
    }

    // El relato es el de la persona, no el que alguien reescriba al abrir.
    relato = solicitud.narrative;
    personaSolicitante = solicitud.personId;

    // El territorio ya se resolvió al canalizar, mirando lo que la persona
    // escribió. Cambiarlo aquí en silencio dejaría el expediente en un sitio y
    // la solicitud en otro, y con ellos el reparto por delegación.
    if (solicitud.territorialUnitId !== null) {
      if (territorio !== null && territorio !== solicitud.territorialUnitId) {
        return fail(
          errors.conflict(
            'El expediente se abre en un territorio distinto del que se resolvió al canalizar. Corrige la canalización o abre donde se canalizó.',
          ),
        );
      }
      territorio = solicitud.territorialUnitId;
    }
  }

  // Una unidad territorial disuelta no recibe expedientes nuevos: el asunto
  // quedaría a cargo de una delegación que ya no existe.
  let rutaDelTerritorio: string | null = null;
  if (territorio !== null) {
    const unidad = await db().territorialUnit.findUnique({
      where: { id: territorio },
      select: { path: true, status: true },
    });
    if (unidad === null) return fail(errors.notFound('Esa unidad territorial no existe.'));
    if (unidad.status !== 'ACTIVE') {
      return fail(errors.conflict('Esa unidad territorial no está activa. Elige la que atiende hoy ese territorio.'));
    }
    rutaDelTerritorio = unidad.path;
  }

  // Segunda comprobación, ya con el territorio resuelto. La primera no podía
  // hacerla: el territorio del expediente sale de la solicitud, y la solicitud
  // no se lee sin facultad. Esta es la que decide.
  const conTerritorio = can(contexto, 'cases.case.open', {
    kind: 'Case',
    legalEntityId: data.legalEntityId,
    territorialPath: rutaDelTerritorio,
    compartment: compartimentoDe(data.domain),
  });
  if (!conTerritorio.allowed) return fail(errors.forbidden(explain(conTerritorio.reason!)));

  if (relato === null || relato.trim().length < 30) {
    return fail(
      errors.validation({
        summary: ['Sin solicitud de origen hay que escribir qué se contó: al menos treinta caracteres.'],
      }),
    );
  }

  const abierto = await transaction(async (tx) => {
    const anio = new Date().getUTCFullYear();
    const serie = `${PREFIJO[data.domain]}-${anio}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`expediente:${serie}`}))`;
    const usados = await tx.case.count({ where: { folio: { startsWith: `${serie}-` } } });
    const folio = `${serie}-${String(usados + 1).padStart(4, '0')}`;
    const publicId = newPublicId();

    const fila = await tx.case.create({
      data: {
        folio,
        publicId,
        supportRequestId: data.supportRequestId,
        legalEntityId: entidad.id,
        domain: data.domain,
        caseType: data.caseType,
        priority: data.priority,
        territorialUnitId: territorio,
        originalSummary: relato,
        status: 'OPEN',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, folio: true, publicId: true },
    });

    // Quien abre queda a cargo. Sin esto el expediente nacería ilegible para su
    // propia autora, porque los permisos de caso exigen asignación viva.
    await tx.caseAssignment.create({
      data: {
        caseId: fila.id,
        userId: quienAbre,
        assignmentRole: 'OWNER',
        assignedById: quienAbre,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
    });

    if (personaSolicitante !== null) {
      await tx.caseParticipant.create({
        data: {
          caseId: fila.id,
          personId: personaSolicitante,
          role: 'APPLICANT',
          canViewCase: true,
          createdByActorId: actor.actorId,
          updatedByActorId: actor.actorId,
        },
      });
    }

    if (data.supportRequestId !== null) {
      await tx.supportRequest.update({
        where: { id: data.supportRequestId },
        data: { status: 'CONVERTED_TO_CASE' },
      });
    }

    await tx.caseEvent.createMany({
      data: [
        {
          caseId: fila.id,
          kind: 'CREATED',
          actorId: actor.actorId,
          summary: `Se abrió el expediente ${fila.folio}.`,
          payload: { motivo: data.reason, desdeSolicitud: data.supportRequestId },
        },
        {
          caseId: fila.id,
          kind: 'ASSIGNED',
          actorId: actor.actorId,
          summary: 'Queda a cargo quien lo abrió.',
          payload: { rol: 'OWNER' },
        },
      ],
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_OPENED,
      objectKind: 'Case',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: entidad.id,
      reason: data.reason,
      metadata: {
        folio: fila.folio,
        dominio: data.domain,
        materia: data.caseType,
        territorio: rutaDelTerritorio,
      },
    });

    return fila;
  });

  return ok({ caseId: abierto.id, folio: abierto.folio, publicId: abierto.publicId });
}
