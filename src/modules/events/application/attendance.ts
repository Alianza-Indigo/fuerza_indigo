import { z } from 'zod';
import type { EventModality, EventRegistrationStatus } from '@prisma-client/enums';
import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { formatDate } from '@/platform/i18n/format';
import { emitirDocumento, variablesDeclaradas } from '@/modules/documents';

/**
 * Asistencia, evaluación y constancias de un evento (PRD §16.3, Fase 9 criterio 5).
 *
 * La constancia se emite como un `GeneratedDocument`: el mismo folio bajo
 * cerrojo, la misma huella y la misma inmutabilidad que un acta. No se compone al
 * abrirla —eso cambiaría cuando cambiaran los datos—, se emite una vez y se
 * archiva. Es **verificable** por una ruta pública que la reconoce por su código,
 * y **revocable**: la revocación deja marca en la inscripción, no borra la fila, y
 * la ruta de verificación la refleja en vivo. La base impide revocar una
 * constancia que nunca se emitió.
 */

const MODALIDAD: Record<EventModality, string> = {
  IN_PERSON: 'presencial',
  REMOTE: 'en línea',
  HYBRID: 'híbrida',
};

/**
 * Registra la asistencia y, si se aporta, la evaluación de quien participó.
 *
 * Asistir o no asistir son los dos únicos desenlaces de quien tenía lugar; la
 * lista de espera y las inscripciones canceladas no participan, y por eso no se
 * les registra asistencia.
 */
export const registerAttendanceSchema = z.object({
  registrationId: z.uuid(),
  attended: z.boolean(),
  evaluationScore: z.number().int().min(0).max(100).nullable().optional(),
});
export type RegisterAttendanceInput = z.input<typeof registerAttendanceSchema>;

const PARTICIPAN: EventRegistrationStatus[] = ['REGISTERED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW'];

export async function registerAttendance(
  actor: ActorContext,
  input: RegisterAttendanceInput,
): Promise<UseCaseResult<{ status: EventRegistrationStatus }>> {
  const parsed = registerAttendanceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation({ form: ['Datos de asistencia inválidos.'] }));
  const data = parsed.data;

  const registro = await db().eventRegistration.findUnique({
    where: { id: data.registrationId },
    select: { id: true, status: true, attendanceAt: true, event: { select: { legalEntityId: true } }, personId: true },
  });
  if (registro === null) return fail(errors.notFound('Esa inscripción no existe.'));

  const decision = can(actor, 'events.attendance.register', {
    kind: 'EventRegistration',
    legalEntityId: registro.event.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (!PARTICIPAN.includes(registro.status)) {
    return fail(errors.conflict('Solo se registra la asistencia de quien tenía lugar en el evento.'));
  }

  const status: EventRegistrationStatus = data.attended ? 'ATTENDED' : 'NO_SHOW';
  const attendanceAt = data.attended ? (registro.attendanceAt ?? new Date()) : null;

  await transaction(async (tx) => {
    await tx.eventRegistration.update({
      where: { id: registro.id },
      data: {
        status,
        attendanceAt,
        ...(data.evaluationScore === undefined ? {} : { evaluationScore: data.evaluationScore }),
      },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_ATTENDANCE_REGISTERED,
      objectKind: 'EventRegistration',
      objectId: registro.id,
      outcome: 'SUCCESS',
      legalEntityId: registro.event.legalEntityId,
      onBehalfOfPersonId: registro.personId,
      metadata: { status, evaluationScore: data.evaluationScore ?? null },
    });
  });

  return ok({ status });
}

/**
 * Emite la constancia de participación de una inscripción.
 *
 * Solo se certifica a quien asistió, con la plantilla que el evento nombra y que
 * tiene que estar publicada. Las variables de la plantilla se llenan con los
 * datos del evento y de la persona; si la plantilla pide un dato que el evento no
 * provee, no se emite —una constancia con un hueco no prueba nada—.
 */
export async function issueConstancy(
  actor: ActorContext,
  input: { registrationId: string },
): Promise<UseCaseResult<{ documentId: string; publicId: string; folio: string }>> {
  const parsed = z.object({ registrationId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail(errors.validation({ registrationId: ['Identificador de inscripción inválido.'] }));
  const registrationId = parsed.data.registrationId;

  const registro = await db().eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      attendanceAt: true,
      evaluationScore: true,
      constancyDocumentId: true,
      person: { select: { givenName: true, familyName: true } },
      event: {
        select: {
          legalEntityId: true,
          title: true,
          startsAt: true,
          endsAt: true,
          modality: true,
          venue: true,
          issuesConstancy: true,
          constancyTemplate: { select: { code: true } },
        },
      },
    },
  });
  if (registro === null) return fail(errors.notFound('Esa inscripción no existe.'));

  const decision = can(actor, 'events.constancy.issue', {
    kind: 'EventRegistration',
    legalEntityId: registro.event.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (!registro.event.issuesConstancy || registro.event.constancyTemplate === null) {
    return fail(errors.conflict('Este evento no emite constancias.'));
  }
  if (registro.attendanceAt === null) {
    return fail(errors.ruleViolation('No se puede certificar la participación de quien no asistió.'));
  }
  if (registro.constancyDocumentId !== null) {
    return fail(errors.conflict('Esta inscripción ya tiene constancia.'));
  }

  // Se resuelve la versión publicada por su código, no la fila que el evento
  // fijó al configurarse: si desde entonces se publicó otra versión, la
  // constancia se emite con la vigente, y la fila fijada pudo quedar retirada.
  const codigo = registro.event.constancyTemplate.code;
  const plantilla = await db().documentTemplate.findFirst({
    where: { code: codigo, status: 'PUBLISHED' },
    select: { variables: true },
  });
  if (plantilla === null) {
    return fail(errors.conflict('La plantilla de la constancia no tiene una versión publicada.'));
  }

  // El contexto trae todo lo que el evento sabe; se entrega solo lo que la
  // plantilla declara, ni de más (lo rechazaría la emisión) ni de menos.
  const contexto: Record<string, string> = {
    participante: `${registro.person.givenName} ${registro.person.familyName}`,
    evento: registro.event.title,
    modalidad: MODALIDAD[registro.event.modality],
    inicia: formatDate(registro.event.startsAt),
    concluye: formatDate(registro.event.endsAt),
    sede: registro.event.venue ?? '',
    calificacion: registro.evaluationScore === null ? '' : String(registro.evaluationScore),
  };
  const declaradas = variablesDeclaradas(plantilla.variables);
  const faltan = declaradas.filter((nombre) => !(nombre in contexto));
  if (faltan.length > 0) {
    return fail(
      errors.conflict(
        `La plantilla de constancia pide datos que el evento no provee: ${faltan.join(', ')}. Revisa la plantilla.`,
      ),
    );
  }
  const variables = Object.fromEntries(declaradas.map((nombre) => [nombre, contexto[nombre] ?? '']));

  const emitida = await emitirDocumento(actor, {
    templateCode: registro.event.constancyTemplate.code,
    subjectKind: 'EVENT_REGISTRATION',
    subjectId: registrationId,
    variables,
  });
  if (!emitida.ok) return fail(emitida.error);

  await transaction(async (tx) => {
    await tx.eventRegistration.update({
      where: { id: registrationId },
      data: { constancyDocumentId: emitida.data.documentId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_CONSTANCY_ISSUED,
      objectKind: 'EventRegistration',
      objectId: registrationId,
      outcome: 'SUCCESS',
      legalEntityId: registro.event.legalEntityId,
      metadata: { documentId: emitida.data.documentId, folio: emitida.data.folio },
    });
  });

  return ok({ documentId: emitida.data.documentId, publicId: emitida.data.publicId, folio: emitida.data.folio });
}

/**
 * Revoca una constancia ya emitida.
 *
 * Revocar exige motivo: una constancia revocada sin explicación no se puede
 * defender ante quien la presentó. La marca queda en la inscripción y el
 * documento pasa a cancelado; la ruta de verificación deja de reconocerla como
 * válida en el acto. La base impide revocar una que nunca se emitió.
 */
export async function revokeConstancy(
  actor: ActorContext,
  input: { registrationId: string },
): Promise<UseCaseResult<{ revoked: boolean }>> {
  const parsed = z.object({ registrationId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail(errors.validation({ registrationId: ['Identificador de inscripción inválido.'] }));
  const registrationId = parsed.data.registrationId;

  const registro = await db().eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      constancyDocumentId: true,
      constancyRevokedAt: true,
      event: { select: { legalEntityId: true } },
    },
  });
  if (registro === null) return fail(errors.notFound('Esa inscripción no existe.'));

  const decision = can(actor, 'events.constancy.revoke', {
    kind: 'EventRegistration',
    legalEntityId: registro.event.legalEntityId,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (registro.constancyDocumentId === null) {
    return fail(errors.conflict('Esta inscripción no tiene constancia que revocar.'));
  }
  if (registro.constancyRevokedAt !== null) {
    return fail(errors.conflict('Esta constancia ya está revocada.'));
  }

  const motivo = actor.reason ?? '';
  const documentId = registro.constancyDocumentId;
  await transaction(async (tx) => {
    await tx.eventRegistration.update({ where: { id: registrationId }, data: { constancyRevokedAt: new Date() } });
    await tx.generatedDocument.update({
      where: { id: documentId },
      data: { status: 'CANCELLED', cancelReason: motivo, updatedByActorId: actor.actorId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.EVENT_CONSTANCY_REVOKED,
      objectKind: 'EventRegistration',
      objectId: registrationId,
      outcome: 'SUCCESS',
      legalEntityId: registro.event.legalEntityId,
      reason: motivo,
      metadata: { documentId },
    });
  });

  return ok({ revoked: true });
}

export interface ConstancyVerification {
  readonly folio: string | null;
  readonly issuedAt: Date;
  readonly eventTitle: string;
  readonly participantName: string;
  readonly revoked: boolean;
  readonly revokedAt: Date | null;
}

/**
 * Verifica una constancia por su código público.
 *
 * Ruta pública, sin sesión: el código de 22 caracteres impreso en la constancia
 * es la llave, y quien la presenta la comparte a propósito. Se responde qué
 * evento certifica, a quién y si sigue vigente —la revocación se lee en vivo de
 * la inscripción, no de una copia—. Un código que no corresponde a ninguna
 * constancia de evento responde «no encontrada», nunca el detalle de otro
 * documento.
 */
export async function verifyConstancy(publicId: string): Promise<UseCaseResult<ConstancyVerification>> {
  const parsed = z.string().trim().min(10).max(30).safeParse(publicId);
  if (!parsed.success) return fail(errors.notFound('No encontramos ninguna constancia con ese código.'));

  const documento = await db().generatedDocument.findFirst({
    where: { publicId: parsed.data, subjectKind: 'EVENT_REGISTRATION' },
    select: { folio: true, issuedAt: true, subjectId: true },
  });
  if (documento === null) return fail(errors.notFound('No encontramos ninguna constancia con ese código.'));

  const registro = await db().eventRegistration.findUnique({
    where: { id: documento.subjectId },
    select: {
      constancyRevokedAt: true,
      person: { select: { givenName: true, familyName: true } },
      event: { select: { title: true } },
    },
  });
  if (registro === null) return fail(errors.notFound('No encontramos ninguna constancia con ese código.'));

  return ok({
    folio: documento.folio,
    issuedAt: documento.issuedAt,
    eventTitle: registro.event.title,
    participantName: `${registro.person.givenName} ${registro.person.familyName}`,
    revoked: registro.constancyRevokedAt !== null,
    revokedAt: registro.constancyRevokedAt,
  });
}

export interface RosterRow {
  readonly registrationId: string;
  readonly personName: string;
  readonly status: EventRegistrationStatus;
  readonly attended: boolean;
  readonly evaluationScore: number | null;
  readonly constancyPublicId: string | null;
  readonly constancyRevoked: boolean;
}

/** El padrón de un evento para registrar asistencia y gestionar constancias. */
export async function eventRoster(actor: ActorContext, eventId: string): Promise<UseCaseResult<readonly RosterRow[]>> {
  const evento = await db().event.findUnique({ where: { id: eventId }, select: { legalEntityId: true } });
  if (evento === null) return fail(errors.notFound('Ese evento no existe.'));

  const decision = can(actor, 'events.registration.read', { kind: 'EventRegistration', legalEntityId: evento.legalEntityId });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().eventRegistration.findMany({
    where: { eventId, status: { not: 'CANCELLED' } },
    orderBy: [{ status: 'asc' }, { registeredAt: 'asc' }],
    select: {
      id: true,
      status: true,
      attendanceAt: true,
      evaluationScore: true,
      constancyRevokedAt: true,
      person: { select: { givenName: true, familyName: true } },
      constancyDocument: { select: { publicId: true } },
    },
  });

  return ok(
    filas.map((f) => ({
      registrationId: f.id,
      personName: `${f.person.givenName} ${f.person.familyName}`,
      status: f.status,
      attended: f.attendanceAt !== null,
      evaluationScore: f.evaluationScore,
      constancyPublicId: f.constancyDocument?.publicId ?? null,
      constancyRevoked: f.constancyRevokedAt !== null,
    })),
  );
}
