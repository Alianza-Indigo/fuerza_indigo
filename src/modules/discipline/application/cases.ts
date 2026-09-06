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
import { uploadFile } from '@/platform/files';
import { leerReglas } from '@/modules/governance';
import type { DisciplinaryStatus, EvidenceKind, EvidenceOfferedBy } from '@prisma-client/enums';

/**
 * Procedimiento disciplinario (PRD §9.8; F5-DIS-001, F5-DIS-002).
 *
 * **El debido proceso no es una secuencia sugerida: es la condición para
 * resolver.** La base impide pasar a resolución sin notificación y sin
 * audiencia —o sin constancia de renuncia expresa a ella—, y el caso de uso lo
 * comprueba antes para poder explicarlo con palabras en vez de con un error de
 * restricción. Las dos comprobaciones existen a propósito: la del dominio para
 * que se entienda, la de la base para que no se pueda saltar.
 *
 * **Quien instruye no puede tener interés en el asunto.** Al abrir el
 * expediente se registra la declaración de cada persona que instruye, con su
 * fecha. Sin declaraciones no se abre: un procedimiento disciplinario instruido
 * por alguien con interés es exactamente el abuso que el régimen existe para
 * impedir.
 *
 * **La persona señalada accede a su expediente.** Se registra cuándo se le dio
 * acceso, porque «pudo defenderse» es una afirmación que hay que poder probar.
 *
 * **Ninguna inteligencia artificial impone sanciones ni recomienda
 * culpabilidad.** No hay aquí ninguna llamada a un modelo, y no la habrá: la
 * Fase 10 añade asistencia de redacción a otros módulos, no a este.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

const DIA_EN_MS = 24 * 60 * 60 * 1000;

export const conflictCheckSchema = z.object({
  personId: z.uuid(),
  role: z.string().trim().min(3).max(120),
  hasConflict: z.boolean(),
  statement: z.string().trim().min(10).max(600),
});

export type ConflictCheck = z.infer<typeof conflictCheckSchema>;

export const openDisciplinaryCaseSchema = z.object({
  membershipId: z.uuid({ error: () => 'Elige la membresía de la persona señalada.' }),
  instructingBodyId: z.uuid({ error: () => 'Elige el órgano que instruye.' }),
  allegedFacts: z.string().trim().min(50).max(50_000, {
    error: () => 'Describe los hechos imputados. Sin hechos concretos nadie puede defenderse.',
  }),
  conflictOfInterestChecks: z.array(conflictCheckSchema).min(1, {
    error: () => 'Registra la declaración de conflicto de interés de quienes instruyen. Al menos una.',
  }),
});

export type OpenDisciplinaryCaseInput = z.infer<typeof openDisciplinaryCaseSchema>;

export async function openDisciplinaryCase(
  actor: ActorContext,
  input: OpenDisciplinaryCaseInput,
): Promise<UseCaseResult<{ caseId: string; folio: string }>> {
  const parsed = openDisciplinaryCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: `Apertura de procedimiento disciplinario: ${data.allegedFacts.slice(0, 200)}` };
  const decision = can(contexto, 'discipline.case.open', { kind: 'DisciplinaryCase' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const conConflicto = data.conflictOfInterestChecks.filter((declaracion) => declaracion.hasConflict);
  if (conConflicto.length > 0) {
    return fail(
      errors.conflict(
        `Estas personas declararon tener conflicto de interés: ${conConflicto.map((declaracion) => declaracion.role).join(', ')}. Sustitúyelas antes de abrir el expediente.`,
      ),
    );
  }

  const membresia = await db().membership.findUnique({
    where: { id: data.membershipId },
    select: {
      id: true,
      status: true,
      personId: true,
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
    },
  });
  if (membresia === null) return fail(errors.notFound('Esa membresía no existe.'));

  // Quien instruye no puede ser la persona señalada, aunque haya declarado que
  // no tiene conflicto: la declaración no cura ser juez de la propia causa.
  if (data.conflictOfInterestChecks.some((declaracion) => declaracion.personId === membresia.personId)) {
    return fail(
      errors.forbidden('La persona señalada figura entre quienes instruyen. Nadie instruye su propio procedimiento.'),
    );
  }

  const organo = await db().unionBody.findUnique({
    where: { id: data.instructingBodyId },
    select: { id: true, name: true, status: true, legalEntityId: true },
  });
  if (organo === null) return fail(errors.notFound('Ese órgano no existe.'));
  if (organo.status !== 'ACTIVE') return fail(errors.conflict(`«${organo.name}» no está activo.`));

  const version = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true, rules: true },
  });
  if (version === null) {
    return fail(errors.conflict('No hay reglas estatutarias en vigor. Un procedimiento se instruye conforme a un estatuto.'));
  }
  if (leerReglas(version.rules) === null) {
    return fail(errors.conflict(`La versión ${version.version} tiene umbrales incompletos.`));
  }

  const abierto = await transaction(async (tx) => {
    const anio = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`disciplinario:${anio}`}))`;
    const usados = await tx.disciplinaryCase.count({ where: { folio: { startsWith: `DIS-${anio}-` } } });
    const folio = `DIS-${anio}-${String(usados + 1).padStart(4, '0')}`;

    const fila = await tx.disciplinaryCase.create({
      data: {
        folio,
        membershipId: membresia.id,
        personId: membresia.personId,
        reportedById: actor.userId,
        allegedFacts: data.allegedFacts,
        normativeRuleSetId: version.id,
        instructingBodyId: organo.id,
        conflictOfInterestChecks: data.conflictOfInterestChecks.map((declaracion) => ({
          ...declaracion,
          declaredAt: new Date().toISOString(),
        })),
        status: 'REPORTED',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, folio: true },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_CASE_OPENED,
      objectKind: 'DisciplinaryCase',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: organo.legalEntityId,
      reason: 'Apertura de procedimiento disciplinario',
      metadata: {
        folio: fila.folio,
        organoInstructor: organo.name,
        version: version.version,
        declaraciones: data.conflictOfInterestChecks.length,
      },
    });

    return fila;
  });

  return ok({ caseId: abierto.id, folio: abierto.folio });
}

export const notifyCaseSchema = z.object({
  caseId: z.uuid(),
  /** Fecha y hora de la audiencia. */
  hearingAt: z.string().trim().min(16).max(40),
  note: z.string().trim().min(10).max(2000),
});

/**
 * Notifica a la persona señalada, le da acceso a su expediente y cita a
 * audiencia.
 *
 * Los tres actos van juntos porque separarlos permitiría notificar sin dar
 * acceso, o citar sin haber notificado. La audiencia se cita respetando el
 * plazo de contestación que fija el estatuto: citarla antes deja a la persona
 * sin tiempo para preparar su defensa, que es la forma educada de negársela.
 */
export async function notifyDisciplinaryCase(
  actor: ActorContext,
  input: z.infer<typeof notifyCaseSchema>,
): Promise<UseCaseResult<{ notifiedAt: Date; hearingAt: Date; answerDays: number }>> {
  const parsed = notifyCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'discipline.case.read', { kind: 'DisciplinaryCase' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().disciplinaryCase.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      folio: true,
      status: true,
      notifiedAt: true,
      normativeRuleSet: { select: { version: true, rules: true } },
      instructingBody: { select: { legalEntityId: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.notifiedAt !== null) return fail(errors.conflict('Esa persona ya fue notificada.'));
  if (expediente.status === 'CLOSED' || expediente.status === 'DISMISSED') {
    return fail(errors.conflict('Ese expediente está cerrado.'));
  }

  const reglas = leerReglas(expediente.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(errors.conflict(`La versión ${expediente.normativeRuleSet.version} tiene umbrales incompletos.`));
  }

  const audiencia = new Date(data.hearingAt.length <= 16 ? `${data.hearingAt}:00Z` : data.hearingAt);
  if (Number.isNaN(audiencia.getTime())) {
    return fail(errors.validation({ hearingAt: ['La fecha y hora no son válidas.'] }));
  }

  const notificadoEl = new Date();
  const dias = (audiencia.getTime() - notificadoEl.getTime()) / DIA_EN_MS;
  if (dias < reglas.disciplinaryAnswerDays) {
    return fail(
      errors.conflict(
        `El estatuto da ${reglas.disciplinaryAnswerDays} día(s) para contestar y ofrecer pruebas, y la audiencia queda a ${Math.floor(dias)}. Cítala más tarde: sin tiempo para preparar la defensa no hay defensa.`,
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.disciplinaryCase.update({
      where: { id: expediente.id },
      data: {
        status: 'HEARING_SCHEDULED',
        notifiedAt: notificadoEl,
        memberAccessGrantedAt: notificadoEl,
        hearingScheduledAt: audiencia,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_NOTIFIED,
      objectKind: 'DisciplinaryCase',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.instructingBody.legalEntityId,
      reason: data.note,
      metadata: { folio: expediente.folio, audiencia: audiencia.toISOString(), plazo: reglas.disciplinaryAnswerDays },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_HEARING_SCHEDULED,
      objectKind: 'DisciplinaryCase',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.instructingBody.legalEntityId,
      metadata: { folio: expediente.folio, audiencia: audiencia.toISOString() },
    });
  });

  return ok({ notifiedAt: notificadoEl, hearingAt: audiencia, answerDays: reglas.disciplinaryAnswerDays });
}

export const recordHearingSchema = z.object({
  caseId: z.uuid(),
  outcome: z.enum(['HELD', 'WAIVED']),
  note: z.string().trim().min(20).max(20_000),
});

/**
 * Asienta la audiencia, celebrada o expresamente renunciada.
 *
 * La renuncia es una constancia, no un atajo: alguien tuvo que declararla, y
 * queda escrita con su nota. Sin una de las dos, el expediente no puede llegar
 * a resolución.
 */
export async function recordHearing(
  actor: ActorContext,
  input: z.infer<typeof recordHearingSchema>,
): Promise<UseCaseResult<{ status: DisciplinaryStatus }>> {
  const parsed = recordHearingSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.note };
  const decision = can(contexto, 'discipline.case.read', { kind: 'DisciplinaryCase' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().disciplinaryCase.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      folio: true,
      status: true,
      notifiedAt: true,
      hearingHeldAt: true,
      hearingWaivedAt: true,
      instructingBody: { select: { legalEntityId: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.notifiedAt === null) {
    return fail(errors.conflict('No se ha notificado a la persona señalada. La audiencia va después de la notificación.'));
  }
  if (expediente.hearingHeldAt !== null || expediente.hearingWaivedAt !== null) {
    return fail(errors.conflict('La audiencia de este expediente ya está asentada.'));
  }

  const ahora = new Date();
  await transaction(async (tx) => {
    await tx.disciplinaryCase.update({
      where: { id: expediente.id },
      data: {
        status: 'HEARING_HELD',
        ...(data.outcome === 'HELD' ? { hearingHeldAt: ahora } : { hearingWaivedAt: ahora }),
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_HEARING_HELD,
      objectKind: 'DisciplinaryCase',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.instructingBody.legalEntityId,
      reason: data.note,
      metadata: { folio: expediente.folio, celebrada: data.outcome === 'HELD' },
    });
  });

  return ok({ status: 'HEARING_HELD' });
}

export const offerEvidenceSchema = z.object({
  caseId: z.uuid(),
  offeredBy: z.enum(['INSTRUCTING_BODY', 'MEMBER', 'THIRD_PARTY']),
  kind: z.enum(['DOCUMENT', 'TESTIMONY', 'RECORD', 'OTHER']),
  description: z.string().trim().min(10).max(600),
});

export interface EvidenceFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface OfferEvidenceInput extends z.infer<typeof offerEvidenceSchema> {
  readonly file?: EvidenceFile | null;
}

/** Ofrece una prueba. La persona señalada también ofrece las suyas. */
export async function offerEvidence(
  actor: ActorContext,
  input: OfferEvidenceInput,
): Promise<UseCaseResult<{ evidenceId: string }>> {
  const parsed = offerEvidenceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const permiso = data.offeredBy === 'MEMBER' ? 'discipline.case.read_own' : 'discipline.evidence.manage';
  const decision = can({ ...actor, reason: 'ofrecimiento de prueba' }, permiso, { kind: 'DisciplinaryEvidence' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().disciplinaryCase.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      folio: true,
      status: true,
      personId: true,
      instructingBody: { select: { legalEntityId: true } },
      decision: { select: { id: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.decision !== null) {
    return fail(errors.conflict('El expediente ya está resuelto. Las pruebas se ofrecen antes de resolver.'));
  }

  // Quien ofrece como persona señalada tiene que serlo.
  if (data.offeredBy === 'MEMBER') {
    const quien = actor.userId;
    if (quien === null || quien === undefined) return fail(errors.forbidden('Exige una cuenta.'));
    const cuenta = await db().user.findUnique({ where: { id: quien }, select: { personId: true } });
    if (cuenta === null || cuenta.personId !== expediente.personId) {
      return fail(errors.forbidden('Solo la persona señalada ofrece pruebas en su nombre.'));
    }
  }

  const archivo = input.file ?? null;
  let archivoId: string | null = null;
  if (archivo !== null) {
    const guardado = await uploadFile(actor, {
      legalEntityId: expediente.instructingBody.legalEntityId,
      classification: 'LEGAL_PRIVILEGED',
      contextKind: 'GOVERNANCE',
      contextId: expediente.id,
      originalFileName: archivo.fileName,
      mimeType: archivo.mimeType,
      content: archivo.content,
    });
    if (!guardado.ok) return fail(guardado.error);
    archivoId = guardado.data.fileObjectId;
  }

  const ofrecida = await transaction(async (tx) => {
    const fila = await tx.disciplinaryEvidence.create({
      data: {
        caseId: expediente.id,
        offeredBy: data.offeredBy,
        kind: data.kind,
        description: data.description,
        fileObjectId: archivoId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DISCIPLINARY_EVIDENCE_OFFERED,
      objectKind: 'DisciplinaryEvidence',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.instructingBody.legalEntityId,
      metadata: { folio: expediente.folio, ofrecidaPor: data.offeredBy, tipo: data.kind },
    });

    return fila;
  });

  return ok({ evidenceId: ofrecida.id });
}

export const assessEvidenceSchema = z.object({
  evidenceId: z.uuid(),
  admitted: z.boolean(),
  admissionRationale: z.string().trim().min(20).max(600, {
    error: () => 'Escribe por qué se admite o se desecha. Una prueba desechada sin razón es una defensa negada.',
  }),
});

/** Valora una prueba: admitida o desechada, siempre con razón escrita. */
export async function assessEvidence(
  actor: ActorContext,
  input: z.infer<typeof assessEvidenceSchema>,
): Promise<UseCaseResult<{ admitted: boolean }>> {
  const parsed = assessEvidenceSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.admissionRationale };
  const decision = can(contexto, 'discipline.evidence.manage', { kind: 'DisciplinaryEvidence' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienValora = actor.userId;
  if (quienValora === null || quienValora === undefined) {
    return fail(errors.forbidden('Valorar una prueba es un acto de una persona: exige una cuenta.'));
  }

  const prueba = await db().disciplinaryEvidence.findUnique({
    where: { id: data.evidenceId },
    select: {
      id: true,
      admitted: true,
      case: { select: { id: true, folio: true, instructingBody: { select: { legalEntityId: true } }, decision: { select: { id: true } } } },
    },
  });
  if (prueba === null) return fail(errors.notFound('Esa prueba no existe.'));
  if (prueba.admitted !== null) return fail(errors.conflict('Esa prueba ya está valorada.'));
  if (prueba.case.decision !== null) {
    return fail(errors.conflict('El expediente ya está resuelto. Las pruebas se valoran antes de resolver.'));
  }

  await transaction(async (tx) => {
    await tx.disciplinaryEvidence.update({
      where: { id: prueba.id },
      data: {
        admitted: data.admitted,
        admissionRationale: data.admissionRationale,
        assessedById: quienValora,
        assessedAt: new Date(),
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_EVIDENCE_ASSESSED,
      objectKind: 'DisciplinaryEvidence',
      objectId: prueba.id,
      outcome: 'SUCCESS',
      legalEntityId: prueba.case.instructingBody.legalEntityId,
      reason: data.admissionRationale,
      metadata: { folio: prueba.case.folio, admitida: data.admitted },
    });
  });

  return ok({ admitted: data.admitted });
}

export interface EvidenceRow {
  readonly id: string;
  readonly offeredBy: EvidenceOfferedBy;
  readonly kind: EvidenceKind;
  readonly description: string;
  readonly offeredAt: Date;
  readonly admitted: boolean | null;
  readonly admissionRationale: string | null;
  readonly assessedBy: string | null;
  readonly hasFile: boolean;
}

export async function evidenceList(
  actor: ActorContext,
  caseId: string,
): Promise<UseCaseResult<readonly EvidenceRow[]>> {
  const decision = can({ ...actor, reason: 'consulta de pruebas' }, 'discipline.case.read', {
    kind: 'DisciplinaryEvidence',
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().disciplinaryEvidence.findMany({
    where: { caseId },
    orderBy: { offeredAt: 'asc' },
    select: {
      id: true,
      offeredBy: true,
      kind: true,
      description: true,
      offeredAt: true,
      admitted: true,
      admissionRationale: true,
      fileObjectId: true,
      assessedBy: {
        select: {
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
      offeredBy: fila.offeredBy,
      kind: fila.kind,
      description: fila.description,
      offeredAt: fila.offeredAt,
      admitted: fila.admitted,
      admissionRationale: fila.admissionRationale,
      assessedBy: fila.assessedBy === null ? null : nombreCompleto(fila.assessedBy.person),
      hasFile: fila.fileObjectId !== null,
    })),
  );
}
