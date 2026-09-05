import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { enqueue } from '@/platform/jobs/queue';
import { env } from '@/platform/config/env';
import { logger } from '@/platform/observability/logger';
import { startOfDayInZone } from '@/platform/i18n/format';

/**
 * Revisión humana, aclaración con plazo y resolución fundada (PRD §8.1 pasos
 * 9 a 11; F4-AFI-006).
 *
 * Las tres promesas que este archivo tiene que cumplir literalmente:
 *
 * 1. **Se revisa sin alterar la solicitud original.** No hace falta disciplina:
 *    el resumen enviado lo protege un disparador de la base, y ninguna función
 *    de aquí escribe en los campos de la solicitud.
 * 2. **Se puede requerir aclaración con plazo y mensajería trazable.** El plazo
 *    es una fecha real, el aviso se encola como cualquier otro correo y queda
 *    en `Notification` con su intento de entrega.
 * 3. **La autoridad competente aprueba o rechaza con fundamento y motivo.**
 *    Quien revisa y quien resuelve son permisos distintos, y resolver exige un
 *    texto escrito que se guarda con la resolución.
 *
 * **Lo que este archivo deliberadamente no hace: rechazar solo.** Un plazo
 * vencido no rechaza a nadie. Ver ADR-0080.
 */

const MOTIVO_MINIMO = 20;

export const startReviewSchema = z.object({
  applicationId: z.uuid(),
  note: z
    .string()
    .trim()
    .max(600)
    .default(''),
});

export type StartReviewInput = z.input<typeof startReviewSchema>;

export const requestClarificationSchema = z.object({
  applicationId: z.uuid(),
  request: z
    .string()
    .trim()
    .min(30, {
      error: () =>
        'Explica qué falta y por qué, con treinta caracteres al menos. Quien lo lea tiene que poder actuar sin adivinar.',
    })
    .max(4000),
  /** Fecha límite en formato de calendario. */
  dueOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: () => 'La fecha va como 2027-01-01.' }),
});

export type RequestClarificationInput = z.input<typeof requestClarificationSchema>;

export const answerClarificationSchema = z.object({
  clarificationId: z.uuid(),
  answer: z
    .string()
    .trim()
    .min(10, { error: () => 'Escribe tu respuesta. Con diez caracteres basta para empezar.' })
    .max(4000),
});

export type AnswerClarificationInput = z.infer<typeof answerClarificationSchema>;

export const closeClarificationSchema = z.object({
  clarificationId: z.uuid(),
  closeReason: z
    .string()
    .trim()
    .min(15, {
      error: () => 'Di por qué se sigue adelante sin la aclaración. Mínimo quince caracteres.',
    })
    .max(400),
});

export type CloseClarificationInput = z.infer<typeof closeClarificationSchema>;

export const recordRecommendationSchema = z.object({
  applicationId: z.uuid(),
  recommendation: z.enum(['RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION'], {
    error: () => 'Di qué recomiendas.',
  }),
  rationale: z
    .string()
    .trim()
    .min(MOTIVO_MINIMO, {
      error: () => 'Escribe en qué te apoyas. Una recomendación sin razones no ayuda a quien resuelve.',
    })
    .max(4000),
});

export type RecordRecommendationInput = z.infer<typeof recordRecommendationSchema>;

export const resolveApplicationSchema = z.object({
  applicationId: z.uuid(),
  decision: z.enum(['APPROVED', 'REJECTED'], { error: () => 'Di si se aprueba o se rechaza.' }),
  rationale: z
    .string()
    .trim()
    .min(MOTIVO_MINIMO, {
      error: () =>
        'Escribe el fundamento y el motivo. Una resolución que no se puede explicar no se puede defender ni recurrir.',
    })
    .max(4000),
});

export type ResolveApplicationInput = z.infer<typeof resolveApplicationSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Estados desde los que todavía se puede revisar. */
const EN_TRAMITE = ['SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED'] as const;

interface SolicitudEnRevision {
  readonly id: string;
  readonly folio: string;
  readonly status: string;
  readonly personId: string;
  readonly legalEntityId: string;
  readonly territorialUnitId: string | null;
}

async function solicitudRevisable(
  applicationId: string,
): Promise<UseCaseResult<SolicitudEnRevision>> {
  const solicitud = await db().membershipApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      folio: true,
      status: true,
      personId: true,
      legalEntityId: true,
      territorialUnitId: true,
    },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));
  return ok(solicitud);
}

function contexto(solicitud: SolicitudEnRevision) {
  return {
    kind: 'MembershipApplication' as const,
    id: solicitud.id,
    legalEntityId: solicitud.legalEntityId,
    ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
  };
}

/* -------------------------------------------------------------------------- */
/* Tomar la solicitud                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Quien revisa toma la solicitud y queda registrado quién es.
 *
 * Existe como acto propio, y no como efecto secundario de abrir la pantalla,
 * porque «quién la está revisando» es una pregunta que se hace de verdad —en el
 * equipo y desde fuera— y porque abrir una pantalla no es hacerse cargo de nada.
 */
export async function startReview(
  actor: ActorContext,
  input: StartReviewInput,
): Promise<UseCaseResult<{ applicationId: string }>> {
  const parsed = startReviewSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const encontrada = await solicitudRevisable(parsed.data.applicationId);
  if (!encontrada.ok) return encontrada;
  const solicitud = encontrada.data;

  const decision = can(actor, 'membership.application.review', contexto(solicitud));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para tomar una solicitud necesitas haber iniciado sesión.'));
  }
  const reviewerId = actor.userId;

  if (!(EN_TRAMITE as readonly string[]).includes(solicitud.status)) {
    return fail(
      errors.conflict(
        'Esa solicitud ya no está en trámite.',
        `estado no revisable: ${solicitud.status}`,
      ),
    );
  }
  if (solicitud.status === 'CLARIFICATION_REQUIRED') {
    return fail(
      errors.conflict(
        'Esa solicitud está esperando una aclaración de la persona. Ciérrala o espera la respuesta antes de seguir.',
        'aclaración abierta',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.applicationReview.create({
      data: {
        applicationId: solicitud.id,
        reviewerId,
        action: 'ASSIGNED',
        rationale:
          parsed.data.note === '' ? 'Toma de la solicitud para revisión.' : parsed.data.note,
      },
    });

    if (solicitud.status !== 'UNDER_REVIEW') {
      await tx.membershipApplication.update({
        where: { id: solicitud.id },
        data: { status: 'UNDER_REVIEW', updatedByActorId: actor.actorId, rowVersion: { increment: 1 } },
      });
    }

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_ASSIGNED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      metadata: { folio: solicitud.folio, estadoAnterior: solicitud.status },
    });
  });

  return ok({ applicationId: solicitud.id });
}

/* -------------------------------------------------------------------------- */
/* Aclaración con plazo                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fin del día de la fecha límite, en la zona de quien la fija.
 *
 * El plazo vence **al terminar** ese día y no al empezarlo: quien lee «tienes
 * hasta el 15» entiende que el 15 todavía cuenta, y darle por vencido a las
 * 00:00 de ese día le quita un día entero sin avisar.
 */
function finDelDia(valor: string, zona: string): Date | null {
  const inicio = startOfDayInZone(valor, zona);
  if (inicio === null) return null;
  return new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Requiere una aclaración, con plazo y aviso trazable (PRD §8.1 paso 10).
 *
 * El aviso va por la cola de trabajos, no en línea: si el proveedor de correo
 * está caído, la aclaración ya está pedida y el plazo ya corre; perder el
 * requerimiento por no poder anunciarlo sería perder lo que importa. Lo que sí
 * queda escrito en el acto es **que** se avisó y a quién, para que «mensajería
 * trazable» sea comprobable y no una promesa.
 */
export async function requestClarification(
  actor: ActorContext,
  input: RequestClarificationInput,
): Promise<UseCaseResult<{ clarificationId: string; dueAt: Date }>> {
  const parsed = requestClarificationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const encontrada = await solicitudRevisable(parsed.data.applicationId);
  if (!encontrada.ok) return encontrada;
  const solicitud = encontrada.data;

  const decision = can(actor, 'membership.application.review', contexto(solicitud));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para requerir una aclaración necesitas haber iniciado sesión.'));
  }
  const requestedById = actor.userId;

  if (!(EN_TRAMITE as readonly string[]).includes(solicitud.status)) {
    return fail(
      errors.conflict('Esa solicitud ya no está en trámite.', `estado no revisable: ${solicitud.status}`),
    );
  }

  const dueAt = finDelDia(parsed.data.dueOn, actor.timeZone);
  if (dueAt === null) return fail(errors.validation({ dueOn: ['Esa fecha no existe.'] }));
  if (dueAt.getTime() <= Date.now()) {
    return fail(
      errors.validation({
        dueOn: ['El plazo tiene que terminar después de hoy. Un plazo vencido no da tiempo a nadie.'],
      }),
    );
  }

  const abierta = await db().applicationClarification.findFirst({
    where: { applicationId: solicitud.id, answeredAt: null, closedAt: null },
    select: { id: true, dueAt: true },
  });
  if (abierta !== null) {
    return fail(
      errors.conflict(
        'Ya hay una aclaración abierta en esta solicitud. Espera la respuesta o ciérrala antes de pedir otra.',
        'aclaración abierta duplicada',
      ),
    );
  }

  const persona = await db().person.findUniqueOrThrow({
    where: { id: solicitud.personId },
    select: { givenName: true, primaryEmail: true },
  });
  const entidad = await db().legalEntity.findUniqueOrThrow({
    where: { id: solicitud.legalEntityId },
    select: { shortName: true, contactEmail: true },
  });

  const fechaLegible = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: actor.timeZone,
  }).format(dueAt);

  const creada = await transaction(async (tx) => {
    const aclaracion = await tx.applicationClarification.create({
      data: {
        applicationId: solicitud.id,
        request: parsed.data.request,
        requestedById,
        dueAt,
      },
      select: { id: true, dueAt: true },
    });

    await tx.applicationReview.create({
      data: {
        applicationId: solicitud.id,
        reviewerId: requestedById,
        action: 'INFORMATION_REQUESTED',
        rationale: parsed.data.request,
        dueAt,
      },
    });

    await tx.membershipApplication.update({
      where: { id: solicitud.id },
      data: {
        status: 'CLARIFICATION_REQUIRED',
        clarificationDueAt: dueAt,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_CLARIFICATION_REQUESTED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      reason: parsed.data.request,
      metadata: { folio: solicitud.folio, plazo: dueAt.toISOString() },
    });

    return aclaracion;
  });

  await avisar({
    clarificationId: creada.id,
    personId: solicitud.personId,
    to: persona.primaryEmail,
    displayName: persona.givenName,
    templateCode: 'APPLICATION_CLARIFICATION_REQUESTED',
    correlationId: actor.correlationId,
    variables: {
      displayName: persona.givenName,
      folio: solicitud.folio,
      entityName: entidad.shortName,
      request: parsed.data.request,
      dueDate: fechaLegible,
      applicationUrl: `${env().APP_URL}/mi/afiliacion/${solicitud.id}`,
      contactEmail: entidad.contactEmail,
    },
  });

  return ok({ clarificationId: creada.id, dueAt: creada.dueAt });
}

/**
 * Encola el aviso y anota que se avisó.
 *
 * Se hace fuera de la transacción del acto a propósito: el correo es una
 * consecuencia del acto, no parte de él, y un proveedor caído no debe deshacer
 * una aclaración ya pedida. Que el aviso falle se registra; que el acto ocurra,
 * no depende de él.
 */
async function avisar(input: {
  clarificationId: string;
  personId: string;
  to: string | null;
  displayName: string;
  templateCode: string;
  correlationId: string;
  variables: Record<string, string>;
}): Promise<void> {
  if (input.to === null || input.to === '') {
    logger.info('Solicitud sin correo al que mandar el aviso', {
      module: 'membership',
      correlationId: input.correlationId,
      context: { clarificationId: input.clarificationId },
    });
    return;
  }

  try {
    await enqueue({
      jobType: 'application-notice',
      businessKey: `${input.templateCode}:${input.clarificationId}`,
      payload: { to: input.to, templateCode: input.templateCode, variables: input.variables },
      correlationId: input.correlationId,
    });
    await db().applicationClarification.update({
      where: { id: input.clarificationId },
      data: { notifiedAt: new Date() },
    });
  } catch (error) {
    logger.error('No se pudo encolar el aviso de la solicitud', {
      module: 'membership',
      correlationId: input.correlationId,
      outcome: 'failed',
      context: { clarificationId: input.clarificationId, error: String(error) },
    });
  }
}

/**
 * La persona contesta lo que se le pidió.
 *
 * Contestar devuelve la solicitud a revisión **aunque el plazo haya vencido**.
 * El plazo sirve para que la revisión pueda seguir adelante sin esperar
 * indefinidamente, no para cerrarle la puerta a quien llega tarde: alguien que
 * contesta con dos días de retraso sigue queriendo afiliarse, y descartar su
 * respuesta por el calendario sería castigar la demora en vez de resolver el
 * expediente.
 */
export async function answerClarification(
  actor: ActorContext,
  input: AnswerClarificationInput,
): Promise<UseCaseResult<{ applicationId: string; late: boolean }>> {
  const parsed = answerClarificationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const aclaracion = await db().applicationClarification.findUnique({
    where: { id: parsed.data.clarificationId },
    select: {
      id: true,
      dueAt: true,
      answeredAt: true,
      closedAt: true,
      application: {
        select: {
          id: true,
          folio: true,
          status: true,
          personId: true,
          legalEntityId: true,
          territorialUnitId: true,
        },
      },
    },
  });
  if (aclaracion === null) return fail(errors.notFound('aclaración inexistente'));

  const solicitud = aclaracion.application;
  const propia = solicitud.personId === actor.personId;

  // Contestar es un acto de la persona solicitante. Quien revisa no contesta en
  // su nombre: la respuesta es la prueba de lo que ella dijo, y una respuesta
  // escrita por la otra parte no prueba nada.
  const decision = can(
    actor,
    'membership.application.read_own',
    contexto(solicitud),
    { hasLiveAssignment: () => propia },
  );
  if (!propia || !decision.allowed) {
    return fail(
      errors.forbidden(
        'quien contesta no es la persona solicitante',
        'La aclaración la contesta la persona que hizo la solicitud.',
      ),
    );
  }
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para contestar necesitas haber iniciado sesión.'));
  }
  const answeredById = actor.userId;

  if (aclaracion.answeredAt !== null) {
    return fail(errors.conflict('Esa aclaración ya está contestada.', 'respuesta repetida'));
  }
  if (aclaracion.closedAt !== null) {
    return fail(
      errors.conflict(
        'Esa aclaración se cerró y la revisión siguió adelante. Escribe a la organización si necesitas añadir algo.',
        'aclaración cerrada',
      ),
    );
  }

  const late = aclaracion.dueAt.getTime() < Date.now();

  await transaction(async (tx) => {
    await tx.applicationClarification.update({
      where: { id: aclaracion.id },
      data: { answer: parsed.data.answer, answeredAt: new Date(), answeredById },
    });

    await tx.membershipApplication.update({
      where: { id: solicitud.id },
      data: {
        status: 'UNDER_REVIEW',
        clarificationDueAt: null,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_CLARIFIED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      metadata: { folio: solicitud.folio, fueraDePlazo: late },
    });
  });

  return ok({ applicationId: solicitud.id, late });
}

/**
 * Cierra una aclaración sin respuesta y devuelve la solicitud a revisión.
 *
 * Es la salida honesta cuando el plazo pasó: la revisión sigue adelante con lo
 * que hay, y queda escrito por qué. Lo que **no** hace es resolver: seguir sin
 * la aclaración no equivale a rechazar, y quien resuelve tiene que mirar el
 * expediente igual.
 */
export async function closeClarification(
  actor: ActorContext,
  input: CloseClarificationInput,
): Promise<UseCaseResult<{ applicationId: string }>> {
  const parsed = closeClarificationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const aclaracion = await db().applicationClarification.findUnique({
    where: { id: parsed.data.clarificationId },
    select: {
      id: true,
      answeredAt: true,
      closedAt: true,
      application: {
        select: {
          id: true,
          folio: true,
          status: true,
          personId: true,
          legalEntityId: true,
          territorialUnitId: true,
        },
      },
    },
  });
  if (aclaracion === null) return fail(errors.notFound('aclaración inexistente'));
  const solicitud = aclaracion.application;

  const decision = can(actor, 'membership.application.review', contexto(solicitud));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para cerrar una aclaración necesitas haber iniciado sesión.'));
  }
  const reviewerId = actor.userId;

  if (aclaracion.answeredAt !== null) {
    return fail(
      errors.conflict('Esa aclaración ya está contestada: no hay nada que cerrar.', 'ya contestada'),
    );
  }
  if (aclaracion.closedAt !== null) {
    return fail(errors.conflict('Esa aclaración ya estaba cerrada.', 'cierre repetido'));
  }

  await transaction(async (tx) => {
    await tx.applicationClarification.update({
      where: { id: aclaracion.id },
      data: { closedAt: new Date(), closeReason: parsed.data.closeReason },
    });

    await tx.applicationReview.create({
      data: {
        applicationId: solicitud.id,
        reviewerId,
        action: 'ASSIGNED',
        rationale: `Se cerró la aclaración sin respuesta: ${parsed.data.closeReason}`,
      },
    });

    await tx.membershipApplication.update({
      where: { id: solicitud.id },
      data: {
        status: 'UNDER_REVIEW',
        clarificationDueAt: null,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_ASSIGNED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      reason: parsed.data.closeReason,
      metadata: { folio: solicitud.folio, aclaracionCerradaSinRespuesta: true },
    });
  });

  return ok({ applicationId: solicitud.id });
}

/* -------------------------------------------------------------------------- */
/* Recomendación y resolución                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Quien revisa recomienda; no resuelve.
 *
 * La separación es del PRD §8.1: la Secretaría de Organización revisa (paso 9) y
 * **la autoridad competente** aprueba o rechaza (paso 11). Que sean dos permisos
 * y dos actos distintos es lo que hace que la resolución sea de quien la firma y
 * no de quien preparó el expediente.
 */
export async function recordRecommendation(
  actor: ActorContext,
  input: RecordRecommendationInput,
): Promise<UseCaseResult<{ applicationId: string }>> {
  const parsed = recordRecommendationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const encontrada = await solicitudRevisable(parsed.data.applicationId);
  if (!encontrada.ok) return encontrada;
  const solicitud = encontrada.data;

  const decision = can(actor, 'membership.application.review', contexto(solicitud));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para recomendar necesitas haber iniciado sesión.'));
  }
  const reviewerId = actor.userId;

  if (solicitud.status !== 'UNDER_REVIEW') {
    return fail(
      errors.conflict(
        'Toma la solicitud antes de recomendar sobre ella.',
        `estado no apto para recomendar: ${solicitud.status}`,
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.applicationReview.create({
      data: {
        applicationId: solicitud.id,
        reviewerId,
        action: parsed.data.recommendation,
        rationale: parsed.data.rationale,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.APPLICATION_ASSIGNED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      reason: parsed.data.rationale,
      metadata: { folio: solicitud.folio, recomendacion: parsed.data.recommendation },
    });
  });

  return ok({ applicationId: solicitud.id });
}

/**
 * Resolución fundada (PRD §8.1 paso 11).
 *
 * Tres cosas que no son negociables aquí:
 *
 * - **Hubo revisión humana.** Sin al menos una actuación registrada, resolver
 *   sería marcar una casilla. El PRD §3.2 pide revisión humana y resolución
 *   registrable; esto comprueba lo primero antes de permitir lo segundo.
 * - **No se resuelve con una aclaración abierta.** El plazo que se le dio a la
 *   persona significa algo o no significa nada: resolver mientras corre sería
 *   pedirle que conteste y no esperar la respuesta.
 * - **Quien resuelve escribe por qué.** El fundamento se guarda con la
 *   resolución, no en un comentario aparte que se pierda.
 *
 * Aprobar deja la solicitud en `APPROVED`. Lo que viene después —el cobro
 * cuando hay cuota y la activación con la credencial— es F4-AFI-008, y ocurre
 * cuando el pago se confirma, nunca aquí.
 */
export async function resolveApplication(
  actor: ActorContext,
  input: ResolveApplicationInput,
): Promise<UseCaseResult<{ applicationId: string; status: 'APPROVED' | 'REJECTED' }>> {
  const parsed = resolveApplicationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const encontrada = await solicitudRevisable(parsed.data.applicationId);
  if (!encontrada.ok) return encontrada;
  const solicitud = encontrada.data;

  const decision = can(
    { ...actor, reason: parsed.data.rationale },
    'membership.application.resolve',
    contexto(solicitud),
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  if (actor.userId === null) {
    return fail(errors.unauthenticated('Para resolver necesitas haber iniciado sesión.'));
  }
  const resolvedById = actor.userId;

  if (!(EN_TRAMITE as readonly string[]).includes(solicitud.status)) {
    return fail(
      errors.conflict('Esa solicitud ya está resuelta.', `estado no resoluble: ${solicitud.status}`),
    );
  }

  const abierta = await db().applicationClarification.findFirst({
    where: { applicationId: solicitud.id, answeredAt: null, closedAt: null },
    select: { id: true },
  });
  if (abierta !== null) {
    return fail(
      errors.conflict(
        'Hay una aclaración abierta. Espera la respuesta o ciérrala explicando por qué se sigue sin ella.',
        'resolución con aclaración pendiente',
      ),
    );
  }

  const actuaciones = await db().applicationReview.count({ where: { applicationId: solicitud.id } });
  if (actuaciones === 0) {
    return fail(
      errors.ruleViolation(
        'Esta solicitud no tiene ninguna revisión registrada. Tómala y revísala antes de resolver.',
        'resolución sin revisión humana previa',
      ),
    );
  }

  const persona = await db().person.findUniqueOrThrow({
    where: { id: solicitud.personId },
    select: { givenName: true, primaryEmail: true },
  });
  const entidad = await db().legalEntity.findUniqueOrThrow({
    where: { id: solicitud.legalEntityId },
    select: { shortName: true, contactEmail: true },
  });

  const aprobada = parsed.data.decision === 'APPROVED';
  const ahora = new Date();

  await transaction(async (tx) => {
    await tx.applicationReview.create({
      data: {
        applicationId: solicitud.id,
        reviewerId: resolvedById,
        action: aprobada ? 'APPROVED' : 'REJECTED',
        rationale: parsed.data.rationale,
      },
    });

    await tx.membershipApplication.update({
      where: { id: solicitud.id },
      data: {
        status: aprobada ? 'APPROVED' : 'REJECTED',
        resolutionAt: ahora,
        resolutionReason: parsed.data.rationale,
        resolvedById,
        updatedByActorId: actor.actorId,
        rowVersion: { increment: 1 },
      },
    });

    await recordAudit(tx, actor, {
      action: aprobada ? AUDIT_ACTIONS.APPLICATION_APPROVED : AUDIT_ACTIONS.APPLICATION_REJECTED,
      objectKind: 'MembershipApplication',
      objectId: solicitud.id,
      outcome: 'SUCCESS',
      legalEntityId: solicitud.legalEntityId,
      onBehalfOfPersonId: solicitud.personId,
      ...(solicitud.territorialUnitId === null ? {} : { territorialUnitId: solicitud.territorialUnitId }),
      reason: parsed.data.rationale,
      metadata: { folio: solicitud.folio },
    });
  });

  // El aviso de la resolución no lleva clave de aclaración: su clave de negocio
  // es la solicitud, de modo que reintentar no manda dos veces la misma noticia.
  if (persona.primaryEmail !== null && persona.primaryEmail !== '') {
    try {
      await enqueue({
        jobType: 'application-notice',
        businessKey: `RESOLUTION:${solicitud.id}`,
        payload: {
          to: persona.primaryEmail,
          templateCode: aprobada ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
          variables: {
            displayName: persona.givenName,
            folio: solicitud.folio,
            entityName: entidad.shortName,
            rationale: parsed.data.rationale,
            applicationUrl: `${env().APP_URL}/mi/afiliacion/${solicitud.id}`,
            contactEmail: entidad.contactEmail,
          },
        },
        correlationId: actor.correlationId,
      });
    } catch (error) {
      logger.error('No se pudo encolar el aviso de resolución', {
        module: 'membership',
        correlationId: actor.correlationId,
        outcome: 'failed',
        context: { applicationId: solicitud.id, error: String(error) },
      });
    }
  }

  return ok({ applicationId: solicitud.id, status: aprobada ? 'APPROVED' : 'REJECTED' });
}

/* -------------------------------------------------------------------------- */
/* Plazos vencidos                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Recuerda a quien tiene un plazo vencido que todavía puede contestar.
 *
 * **No rechaza, no cierra y no resuelve nada** (ADR-0080). Lo único que hace un
 * plazo vencido en esta plataforma es hacerse visible: en la bandeja de quien
 * revisa, y en un recordatorio a la persona. Rechazar por silencio sería
 * convertir una dificultad para contestar a tiempo —que en una organización de
 * personas neurodivergentes es previsible y frecuente— en la pérdida de un
 * derecho, y hacerlo además sin que ninguna persona lo decidiera.
 *
 * El recordatorio se manda **una vez**: `remindedAt` lo marca, de modo que el
 * trabajo nocturno no repita el mismo aviso indefinidamente. Un aviso que llega
 * todos los días deja de leerse al tercero.
 */
export async function remindOverdueClarifications(
  actor: ActorContext,
): Promise<UseCaseResult<{ reminded: number }>> {
  const decision = can(actor, 'membership.application.review', { kind: 'MembershipApplication' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const vencidas = await db().applicationClarification.findMany({
    where: {
      answeredAt: null,
      closedAt: null,
      remindedAt: null,
      dueAt: { lt: new Date() },
    },
    take: 200,
    select: {
      id: true,
      dueAt: true,
      request: true,
      application: {
        select: {
          id: true,
          folio: true,
          personId: true,
          legalEntityId: true,
          person: { select: { givenName: true, primaryEmail: true } },
          legalEntity: { select: { shortName: true, contactEmail: true } },
        },
      },
    },
  });

  if (vencidas.length === 0) return ok({ reminded: 0 });

  let avisadas = 0;
  for (const aclaracion of vencidas) {
    const solicitud = aclaracion.application;
    const correo = solicitud.person.primaryEmail;

    // Se marca siempre, haya correo o no: sin correo no hay recordatorio que
    // mandar, y volver a mirarla cada noche solo gastaría trabajo.
    await db().applicationClarification.update({
      where: { id: aclaracion.id },
      data: { remindedAt: new Date() },
    });

    if (correo === null || correo === '') continue;

    try {
      await enqueue({
        jobType: 'application-notice',
        businessKey: `CLARIFICATION_OVERDUE:${aclaracion.id}`,
        payload: {
          to: correo,
          templateCode: 'APPLICATION_CLARIFICATION_OVERDUE',
          variables: {
            displayName: solicitud.person.givenName,
            folio: solicitud.folio,
            entityName: solicitud.legalEntity.shortName,
            request: aclaracion.request,
            applicationUrl: `${env().APP_URL}/mi/afiliacion/${solicitud.id}`,
            contactEmail: solicitud.legalEntity.contactEmail,
          },
        },
        correlationId: actor.correlationId,
      });
      avisadas += 1;
    } catch (error) {
      logger.error('No se pudo encolar el recordatorio de aclaración', {
        module: 'membership',
        correlationId: actor.correlationId,
        outcome: 'failed',
        context: { clarificationId: aclaracion.id, error: String(error) },
      });
    }
  }

  return ok({ reminded: avisadas });
}
