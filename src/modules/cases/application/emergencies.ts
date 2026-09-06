import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { CaseEmergencySource, CaseRiskKind } from '@prisma-client/enums';
import { RUTA_DEL_PROTOCOLO_DE_RIESGO } from '../domain/risk';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Marca de riesgo inmediato y protocolo visible (PRD §10.3, §24 Fase 6).
 *
 * **El sistema no atiende emergencias, y por eso las señala.** Nada de lo que
 * hay aquí llama a nadie ni avisa a ninguna autoridad: lo que hace es dejar el
 * asunto marcado para que una persona lo vea antes que el resto, y enseñar el
 * protocolo con las rutas humanas y de emergencia que la organización tiene
 * configuradas. Presentar cualquier automatismo como si atendiera una urgencia
 * sería peor que no tener nada, porque alguien se quedaría esperando.
 *
 * **El protocolo se administra en el gestor de contenidos.** Si no hay uno
 * publicado, la marca no se puede levantar, y eso no es un capricho del
 * esquema: una marca de riesgo sin protocolo que enseñar es una alarma sin
 * salida. Para que esa falta no se descubra durante una urgencia, la
 * comprobación de salud la señala antes.
 *
 * **Se guarda qué protocolo se mostró.** El texto se edita —cambian los
 * teléfonos, las instituciones y los horarios— y hay que poder saber qué vio
 * esa persona ese día.
 */

const RIESGOS = ['VIOLENCE', 'SELF_HARM', 'CHILD_PROTECTION', 'HEALTH_EMERGENCY', 'OTHER'] as const;

export const raiseEmergencySchema = z
  .object({
    caseId: z.uuid().nullable().default(null),
    supportRequestId: z.uuid().nullable().default(null),
    riskKind: z.enum(RIESGOS satisfies readonly CaseRiskKind[], {
      error: () => 'Di qué clase de riesgo es.',
    }),
    note: z.string().trim().min(10, {
      error: () => 'Escribe qué está pasando: lo va a leer quien se haga cargo.',
    }),
  })
  .refine((valor) => valor.caseId !== null || valor.supportRequestId !== null, {
    error: () => 'Una marca de riesgo cuelga de un expediente o de un mensaje recibido, nunca de nada.',
    path: ['caseId'],
  });

export type RaiseEmergencyInput = z.input<typeof raiseEmergencySchema>;

export const acknowledgeEmergencySchema = z.object({
  flagId: z.uuid(),
  /**
   * Qué se va a hacer ahora.
   *
   * Hacerse cargo de la urgencia de alguien es un acto, y la facultad pide el
   * motivo. No es la misma frase que se escribe al cerrar —aquella dice qué
   * pasó, esta dice qué se va a hacer— y por eso se guarda en la bitácora del
   * expediente, donde la ve el resto del equipo mientras todavía sirve.
   */
  note: z.string().trim().min(10, {
    error: () => 'Escribe qué vas a hacer ahora: lo lee el resto del equipo mientras todavía sirve.',
  }),
});

export type AcknowledgeEmergencyInput = z.infer<typeof acknowledgeEmergencySchema>;

export const closeEmergencySchema = z.object({
  flagId: z.uuid(),
  resolution: z.string().trim().min(20, {
    error: () => 'Escribe qué se hizo. Cerrar una marca de riesgo sin decir qué pasó no cierra nada.',
  }),
});

export type CloseEmergencyInput = z.infer<typeof closeEmergencySchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Dónde ocurre el asunto de una marca, venga de un expediente o de un mensaje.
 *
 * El territorio no deja de importar porque la fila sea una marca de riesgo: una
 * delegación no se hace cargo de una urgencia de otro territorio, y un recurso
 * sin territorio no se niega, se permite.
 */
function territorioDe(marca: {
  case: { territorialUnit: { path: string } | null } | null;
  supportRequest: { territorialUnit: { path: string } | null } | null;
}): string | null {
  return marca.case?.territorialUnit?.path ?? marca.supportRequest?.territorialUnit?.path ?? null;
}

/** El protocolo publicado, o nada. Nunca uno inventado. */
export async function protocoloDeRiesgo(): Promise<{ id: string; titulo: string; cuerpo: string } | null> {
  const pagina = await db().contentPage.findFirst({
    where: {
      slug: RUTA_DEL_PROTOCOLO_DE_RIESGO,
      status: 'PUBLISHED',
      archivedAt: null,
      currentVersionId: { not: null },
    },
    select: { id: true, currentVersion: { select: { title: true, bodyMarkdown: true } } },
  });
  if (pagina === null || pagina.currentVersion === null) return null;
  return { id: pagina.id, titulo: pagina.currentVersion.title, cuerpo: pagina.currentVersion.bodyMarkdown };
}

export async function raiseEmergency(
  actor: ActorContext,
  input: RaiseEmergencyInput,
): Promise<UseCaseResult<{ flagId: string; protocolo: { titulo: string; cuerpo: string } }>> {
  const parsed = raiseEmergencySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  let legalEntityId: string | null = null;
  let personId: string | null = null;
  let referencia = '';

  if (data.caseId !== null) {
    const expediente = await db().case.findUnique({
      where: { id: data.caseId },
      select: { ...CAMPOS_PARA_DECIDIR, folio: true },
    });
    if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

    const asignada = await estaAsignada(actor, expediente.id);
    const decision = can(actor, 'cases.emergency.raise', recursoDelExpediente(expediente), {
      hasLiveAssignment: () => asignada,
    });
    if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

    legalEntityId = expediente.legalEntityId;
    referencia = expediente.folio;

    const solicitante = await db().caseParticipant.findFirst({
      where: { caseId: expediente.id, removedAt: null, personId: { not: null }, role: 'APPLICANT' },
      select: { personId: true },
    });
    personId = solicitante?.personId ?? null;
  } else {
    const solicitud = await db().supportRequest.findUnique({
      where: { id: data.supportRequestId! },
      select: {
        id: true,
        folio: true,
        legalEntityId: true,
        personId: true,
        territorialUnit: { select: { path: true } },
      },
    });
    if (solicitud === null) return fail(errors.notFound('Ese mensaje no existe.'));

    // Sobre un mensaje que todavía no es expediente no hay asignación posible:
    // deciden la facultad, la entidad y el territorio que la valoración haya
    // resuelto. Sin el territorio, quien está nombrado en otra delegación
    // marcaría riesgos de un sitio que no le toca.
    const decision = can(actor, 'cases.emergency.raise', {
      kind: 'SupportRequest',
      id: solicitud.id,
      legalEntityId: solicitud.legalEntityId,
      territorialPath: solicitud.territorialUnit?.path ?? null,
    });
    if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

    legalEntityId = solicitud.legalEntityId;
    personId = solicitud.personId;
    referencia = solicitud.folio;
  }

  const protocolo = await protocoloDeRiesgo();
  if (protocolo === null) {
    return fail(
      errors.ruleViolation(
        `No hay protocolo de riesgo publicado. Una marca de riesgo sin protocolo que enseñar es una alarma sin salida: publica la página «${RUTA_DEL_PROTOCOLO_DE_RIESGO}» en el gestor de contenidos y vuelve a intentarlo.`,
      ),
    );
  }

  const levantada = await transaction(async (tx) => {
    const fila = await tx.emergencyFlag.create({
      data: {
        caseId: data.caseId,
        supportRequestId: data.supportRequestId,
        personId,
        raisedBy: 'STAFF' satisfies CaseEmergencySource,
        riskKind: data.riskKind,
        protocolShownId: protocolo.id,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    if (data.caseId !== null) {
      await tx.caseEvent.create({
        data: {
          caseId: data.caseId,
          kind: 'EMERGENCY_RAISED',
          actorId: actor.actorId,
          summary: 'Se marcó riesgo inmediato. Atender antes que el resto.',
          payload: { marca: fila.id, riesgo: data.riskKind, nota: data.note },
        },
      });
    }

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_EMERGENCY_RAISED,
      objectKind: 'EmergencyFlag',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId,
      metadata: { referencia, riesgo: data.riskKind, protocolo: protocolo.id },
    });

    return fila;
  });

  return ok({
    flagId: levantada.id,
    protocolo: { titulo: protocolo.titulo, cuerpo: protocolo.cuerpo },
  });
}

/** Alguien se hace cargo de la marca. Hasta aquí, nadie la había visto. */
export async function acknowledgeEmergency(
  actor: ActorContext,
  input: AcknowledgeEmergencyInput,
): Promise<UseCaseResult<{ flagId: string }>> {
  const parsed = acknowledgeEmergencySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const marca = await db().emergencyFlag.findUnique({
    where: { id: data.flagId },
    select: {
      id: true,
      caseId: true,
      acknowledgedAt: true,
      closedAt: true,
      case: { select: { legalEntityId: true, folio: true, territorialUnit: { select: { path: true } } } },
      supportRequest: {
        select: { legalEntityId: true, folio: true, territorialUnit: { select: { path: true } } },
      },
    },
  });
  if (marca === null) return fail(errors.notFound('Esa marca de riesgo no existe.'));
  if (marca.closedAt !== null) return fail(errors.conflict('Esa marca ya se cerró.'));
  if (marca.acknowledgedAt !== null) {
    return fail(errors.conflict('Alguien ya se hizo cargo de esa marca.'));
  }

  const entidad = marca.case?.legalEntityId ?? marca.supportRequest?.legalEntityId ?? null;
  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'cases.emergency.acknowledge', {
    kind: 'EmergencyFlag',
    id: marca.id,
    legalEntityId: entidad,
    territorialPath: territorioDe(marca),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienSeHaceCargo = actor.userId;
  if (quienSeHaceCargo === null || quienSeHaceCargo === undefined) {
    return fail(errors.forbidden('Hacerse cargo de un riesgo es un acto de una persona: exige una cuenta.'));
  }

  await transaction(async (tx) => {
    await tx.emergencyFlag.update({
      where: { id: marca.id },
      data: {
        acknowledgedById: quienSeHaceCargo,
        acknowledgedAt: new Date(),
        updatedByActorId: actor.actorId,
      },
    });

    if (marca.caseId !== null) {
      await tx.caseEvent.create({
        data: {
          caseId: marca.caseId,
          kind: 'EMERGENCY_RAISED',
          actorId: actor.actorId,
          summary: `Alguien se hace cargo del riesgo: ${data.note}`,
          payload: { marca: marca.id, recogida: true },
        },
      });
    }

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_EMERGENCY_ACKNOWLEDGED,
      objectKind: 'EmergencyFlag',
      objectId: marca.id,
      outcome: 'SUCCESS',
      legalEntityId: entidad,
      reason: data.note,
      metadata: { referencia: marca.case?.folio ?? marca.supportRequest?.folio ?? null },
    });
  });

  return ok({ flagId: marca.id });
}

/** Cierra la marca diciendo qué se hizo. Sin eso no se cierra nada. */
export async function closeEmergency(
  actor: ActorContext,
  input: CloseEmergencyInput,
): Promise<UseCaseResult<{ flagId: string }>> {
  const parsed = closeEmergencySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const marca = await db().emergencyFlag.findUnique({
    where: { id: data.flagId },
    select: {
      id: true,
      acknowledgedAt: true,
      closedAt: true,
      case: { select: { legalEntityId: true, folio: true, territorialUnit: { select: { path: true } } } },
      supportRequest: {
        select: { legalEntityId: true, folio: true, territorialUnit: { select: { path: true } } },
      },
    },
  });
  if (marca === null) return fail(errors.notFound('Esa marca de riesgo no existe.'));
  if (marca.closedAt !== null) return fail(errors.conflict('Esa marca ya se cerró.'));
  if (marca.acknowledgedAt === null) {
    return fail(
      errors.conflict(
        'Nadie se ha hecho cargo de esa marca todavía. Hacerse cargo y cerrar son dos actos: el primero dice quién la atiende, el segundo qué pasó.',
      ),
    );
  }

  const entidad = marca.case?.legalEntityId ?? marca.supportRequest?.legalEntityId ?? null;
  const contexto = { ...actor, reason: data.resolution };
  const decision = can(contexto, 'cases.emergency.acknowledge', {
    kind: 'EmergencyFlag',
    id: marca.id,
    legalEntityId: entidad,
    territorialPath: territorioDe(marca),
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  await transaction(async (tx) => {
    await tx.emergencyFlag.update({
      where: { id: marca.id },
      data: { resolution: data.resolution, closedAt: new Date(), updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_EMERGENCY_CLOSED,
      objectKind: 'EmergencyFlag',
      objectId: marca.id,
      outcome: 'SUCCESS',
      legalEntityId: entidad,
      reason: data.resolution,
      metadata: { referencia: marca.case?.folio ?? marca.supportRequest?.folio ?? null },
    });
  });

  return ok({ flagId: marca.id });
}
