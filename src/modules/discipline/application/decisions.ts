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
import { issueDocument } from '@/modules/documents';
import { bodiesWithLiveOffice } from './assignment';
import type { AppealStatus, DisciplinaryOutcome, DisciplinaryStatus } from '@prisma-client/enums';

/**
 * Resolución, sanción, recurso y restitución (PRD §9.8; F5-DIS-003).
 *
 * **La sanción se ejecuta sobre la membresía, no sobre una etiqueta.** Una
 * suspensión de derechos escribe `politicalRightsSuspendedUntil`, que es lo que
 * el padrón congelado consulta al decidir quién vota. Guardarla solo en el
 * expediente disciplinario habría dejado a la persona sancionada votando.
 *
 * **Restituir devuelve lo que se quitó.** Cuando el recurso revoca la
 * resolución, la suspensión se levanta en el mismo acto y queda constancia de
 * cuándo. Una restitución que exige un trámite aparte es una restitución que
 * alguien olvida.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

const DIA_EN_MS = 24 * 60 * 60 * 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const issueDecisionSchema = z
  .object({
    caseId: z.uuid(),
    decidedByBodyId: z.uuid(),
    outcome: z.enum(['NO_LIABILITY', 'WARNING', 'SUSPENSION_OF_RIGHTS', 'EXPULSION', 'OTHER_STATUTORY']),
    rationale: z.string().trim().min(100).max(100_000, {
      error: () => 'Funda la resolución. Sin razones escritas no es una resolución: es una orden.',
    }),
    sanctionStartsOn: z.string().trim().regex(FECHA).nullable().default(null),
    sanctionEndsOn: z.string().trim().regex(FECHA).nullable().default(null),
    templateCode: z.string().trim().toUpperCase().min(3).max(60),
  })
  .refine(
    (valor) =>
      valor.outcome !== 'SUSPENSION_OF_RIGHTS' ||
      (valor.sanctionStartsOn !== null && valor.sanctionEndsOn !== null),
    {
      error: () => 'Una suspensión tiene principio y fin. Una suspensión indefinida es una expulsión sin decirlo.',
      path: ['sanctionEndsOn'],
    },
  );

export type IssueDecisionInput = z.infer<typeof issueDecisionSchema>;

const NOMBRE_DE_RESULTADO: Readonly<Record<DisciplinaryOutcome, string>> = {
  NO_LIABILITY: 'sin responsabilidad',
  WARNING: 'amonestación',
  SUSPENSION_OF_RIGHTS: 'suspensión de derechos',
  EXPULSION: 'expulsión',
  OTHER_STATUTORY: 'otra sanción estatutaria',
};

export async function issueDisciplinaryDecision(
  actor: ActorContext,
  input: IssueDecisionInput,
): Promise<UseCaseResult<{ decisionId: string; folio: string; appealDeadlineAt: Date }>> {
  const parsed = issueDecisionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.rationale.slice(0, 400) };
  const decision = can(contexto, 'discipline.decision.issue', { kind: 'DisciplinaryDecision' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().disciplinaryCase.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      folio: true,
      status: true,
      personId: true,
      membershipId: true,
      allegedFacts: true,
      notifiedAt: true,
      hearingHeldAt: true,
      hearingWaivedAt: true,
      normativeRuleSet: { select: { version: true, rules: true } },
      instructingBody: { select: { name: true, legalEntityId: true, legalEntity: { select: { legalName: true } } } },
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
      decision: { select: { id: true } },
      evidence: { select: { admitted: true, description: true, admissionRationale: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.decision !== null) return fail(errors.conflict('Ese expediente ya está resuelto.'));

  // Debido proceso. La base lo impone también con un `CHECK`; aquí se comprueba
  // antes para poder decirlo con palabras.
  if (expediente.notifiedAt === null) {
    return fail(
      errors.conflict('No se ha notificado a la persona señalada. Sin notificación no hay resolución que valga.'),
    );
  }
  if (expediente.hearingHeldAt === null && expediente.hearingWaivedAt === null) {
    return fail(
      errors.conflict(
        'No consta ni la audiencia celebrada ni su renuncia expresa. Resolver ahora sería resolver sin oír.',
      ),
    );
  }

  const sinValorar = expediente.evidence.filter((prueba) => prueba.admitted === null).length;
  if (sinValorar > 0) {
    return fail(
      errors.conflict(
        `Quedan ${sinValorar} prueba(s) sin valorar. Resolver dejándolas fuera sin decir por qué es negar la defensa por omisión.`,
      ),
    );
  }

  const reglas = leerReglas(expediente.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(errors.conflict(`La versión ${expediente.normativeRuleSet.version} tiene umbrales incompletos.`));
  }

  const organo = await db().unionBody.findUnique({
    where: { id: data.decidedByBodyId },
    select: { id: true, name: true, status: true },
  });
  if (organo === null) return fail(errors.notFound('Ese órgano no existe.'));
  if (organo.status !== 'ACTIVE') return fail(errors.conflict(`«${organo.name}» no está activo.`));

  const decididoEl = new Date();
  const plazoDeRecurso = new Date(decididoEl.getTime() + reglas.disciplinaryAppealDays * DIA_EN_MS);

  const documento = await issueDocument(contexto, {
    templateCode: data.templateCode,
    subjectKind: 'DISCIPLINARY_CASE',
    subjectId: expediente.id,
    variables: {
      entidad: expediente.instructingBody.legalEntity.legalName,
      folio: expediente.folio,
      persona: nombreCompleto(expediente.person),
      organoInstructor: expediente.instructingBody.name,
      organoResolutor: organo.name,
      hechos: expediente.allegedFacts,
      pruebas: expediente.evidence
        .map(
          (prueba) =>
            `${prueba.admitted === true ? 'Admitida' : 'Desechada'}: ${prueba.description} — ${prueba.admissionRationale ?? ''}`,
        )
        .join('\n'),
      resultado: NOMBRE_DE_RESULTADO[data.outcome],
      fundamento: data.rationale,
      sancionDesde: data.sanctionStartsOn ?? 'No aplica',
      sancionHasta: data.sanctionEndsOn ?? 'No aplica',
      plazoDeRecurso: String(reglas.disciplinaryAppealDays),
      versionNormativa: expediente.normativeRuleSet.version,
    },
  });
  if (!documento.ok) return fail(documento.error);

  const dictada = await transaction(async (tx) => {
    const fila = await tx.disciplinaryDecision.create({
      data: {
        caseId: expediente.id,
        decidedByBodyId: organo.id,
        decidedAt: decididoEl,
        outcome: data.outcome,
        sanctionStartsOn: data.sanctionStartsOn === null ? null : new Date(`${data.sanctionStartsOn}T00:00:00.000Z`),
        sanctionEndsOn: data.sanctionEndsOn === null ? null : new Date(`${data.sanctionEndsOn}T00:00:00.000Z`),
        rationale: data.rationale,
        documentId: documento.data.documentId,
        appealDeadlineAt: plazoDeRecurso,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.disciplinaryCase.update({
      where: { id: expediente.id },
      data: { status: 'DECIDED', updatedByActorId: actor.actorId },
    });

    // La sanción se ejecuta sobre la membresía. Es lo que el padrón congelado
    // lee al decidir quién vota, así que dejarla solo en el expediente habría
    // dejado votando a quien tiene los derechos suspendidos.
    if (data.outcome === 'SUSPENSION_OF_RIGHTS' && data.sanctionEndsOn !== null) {
      await tx.membership.update({
        where: { id: expediente.membershipId },
        data: {
          politicalRightsSuspendedUntil: new Date(`${data.sanctionEndsOn}T23:59:59.999Z`),
          status: 'DISCIPLINARY_PROCESS',
          updatedByActorId: actor.actorId,
        },
      });
    }
    if (data.outcome === 'EXPULSION') {
      await tx.membership.update({
        where: { id: expediente.membershipId },
        data: {
          status: 'STATUS_LOSS',
          endedAt: decididoEl,
          endReason: 'EXPULSION',
          updatedByActorId: actor.actorId,
        },
      });
    }

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_DECIDED,
      objectKind: 'DisciplinaryDecision',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.instructingBody.legalEntityId,
      reason: 'Resolución disciplinaria fundada',
      metadata: {
        folio: expediente.folio,
        resultado: data.outcome,
        organoResolutor: organo.name,
        documento: documento.data.folio,
        plazoDeRecurso: plazoDeRecurso.toISOString(),
      },
    });

    return fila;
  });

  return ok({ decisionId: dictada.id, folio: documento.data.folio, appealDeadlineAt: plazoDeRecurso });
}

export const fileAppealSchema = z.object({
  decisionId: z.uuid(),
  grounds: z.string().trim().min(50).max(50_000, {
    error: () => 'Escribe los agravios: qué de la resolución se recurre y por qué.',
  }),
});

/**
 * Interpone el recurso.
 *
 * Lo interpone **la persona sancionada**, y se comprueba: un recurso presentado
 * por otra persona en su nombre, sin representación acreditada, no es su
 * recurso. Fuera de plazo tampoco se admite, y el plazo lo fijó la resolución
 * conforme al estatuto.
 */
export async function fileAppeal(
  actor: ActorContext,
  input: z.infer<typeof fileAppealSchema>,
): Promise<UseCaseResult<{ appealId: string }>> {
  const parsed = fileAppealSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const quienRecurre = actor.userId;
  if (quienRecurre === null || quienRecurre === undefined) {
    return fail(errors.forbidden('Recurrir es un acto personal: exige una cuenta.'));
  }

  const resolucion = await db().disciplinaryDecision.findUnique({
    where: { id: data.decisionId },
    select: {
      id: true,
      appealDeadlineAt: true,
      case: { select: { id: true, folio: true, personId: true, status: true, instructingBody: { select: { legalEntityId: true } } } },
      appeals: { select: { id: true, status: true } },
    },
  });
  if (resolucion === null) return fail(errors.notFound('Esa resolución no existe.'));

  // «Lo propio» es la asignación que exige el permiso: se recurre la resolución
  // que recayó sobre una misma, no la de otra persona.
  const decision = can(
    { ...actor, reason: 'interposición de recurso' },
    'discipline.case.read_own',
    { kind: 'Appeal', legalEntityId: resolucion.case.instructingBody.legalEntityId },
    { hasLiveAssignment: () => actor.personId !== null && actor.personId === resolucion.case.personId },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const cuenta = await db().user.findUnique({ where: { id: quienRecurre }, select: { personId: true } });
  if (cuenta === null) return fail(errors.notFound('No se encontró a la persona titular de la cuenta.'));
  if (cuenta.personId !== resolucion.case.personId) {
    return fail(errors.forbidden('El recurso lo interpone la persona sancionada.'));
  }

  if (resolucion.appeals.length > 0) {
    return fail(errors.conflict('Ya interpusiste recurso contra esta resolución.'));
  }
  if (resolucion.appealDeadlineAt !== null && new Date() > resolucion.appealDeadlineAt) {
    return fail(
      errors.conflict(
        `El plazo para recurrir venció el ${resolucion.appealDeadlineAt.toISOString().slice(0, 10)}.`,
      ),
    );
  }

  const interpuesto = await transaction(async (tx) => {
    const fila = await tx.appeal.create({
      data: {
        decisionId: resolucion.id,
        filedById: quienRecurre,
        grounds: data.grounds,
        status: 'FILED',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.disciplinaryCase.update({
      where: { id: resolucion.case.id },
      data: { status: 'APPEALED', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.DISCIPLINARY_APPEAL_FILED,
      objectKind: 'Appeal',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: resolucion.case.instructingBody.legalEntityId,
      metadata: { folio: resolucion.case.folio },
    });

    return fila;
  });

  return ok({ appealId: interpuesto.id });
}

export const resolveAppealSchema = z.object({
  appealId: z.uuid(),
  status: z.enum(['ADMITTED', 'INADMISSIBLE', 'RESOLVED_CONFIRMED', 'RESOLVED_MODIFIED', 'RESOLVED_REVOKED']),
  resolutionText: z.string().trim().min(50).max(50_000),
  resolvedByAssemblyId: z.uuid().nullable().default(null),
});

/**
 * Resuelve el recurso.
 *
 * Si lo revoca, **restituye en el mismo acto**: levanta la suspensión de
 * derechos y devuelve la membresía a activa. Restituir en un trámite aparte es
 * restituir tarde, y a veces nunca.
 */
export async function resolveAppeal(
  actor: ActorContext,
  input: z.infer<typeof resolveAppealSchema>,
): Promise<UseCaseResult<{ status: AppealStatus; rightsRestored: boolean }>> {
  const parsed = resolveAppealSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.resolutionText.slice(0, 400) };
  const decision = can(contexto, 'discipline.appeal.resolve', { kind: 'Appeal' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const recurso = await db().appeal.findUnique({
    where: { id: data.appealId },
    select: {
      id: true,
      status: true,
      decision: {
        select: {
          outcome: true,
          case: {
            select: {
              id: true,
              folio: true,
              membershipId: true,
              instructingBody: { select: { legalEntityId: true } },
            },
          },
        },
      },
    },
  });
  if (recurso === null) return fail(errors.notFound('Ese recurso no existe.'));
  if (recurso.status.startsWith('RESOLVED') || recurso.status === 'INADMISSIBLE') {
    return fail(errors.conflict('Ese recurso ya está resuelto.'));
  }

  const revoca = data.status === 'RESOLVED_REVOKED';
  const ahora = new Date();

  await transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: recurso.id },
      data: {
        status: data.status,
        resolutionText: data.resolutionText,
        resolvedByAssemblyId: data.resolvedByAssemblyId,
        resolvedAt: ahora,
        ...(revoca ? { rightsRestoredAt: ahora } : {}),
        updatedByActorId: actor.actorId,
      },
    });

    if (revoca) {
      await tx.membership.update({
        where: { id: recurso.decision.case.membershipId },
        data: {
          politicalRightsSuspendedUntil: null,
          status: 'ACTIVE',
          endedAt: null,
          endReason: null,
          updatedByActorId: actor.actorId,
        },
      });

      await recordAudit(tx, contexto, {
        action: AUDIT_ACTIONS.DISCIPLINARY_RIGHTS_RESTORED,
        objectKind: 'Membership',
        objectId: recurso.decision.case.membershipId,
        outcome: 'SUCCESS',
        legalEntityId: recurso.decision.case.instructingBody.legalEntityId,
        reason: 'Revocación de la resolución disciplinaria en recurso',
        metadata: { folio: recurso.decision.case.folio },
      });
    }

    if (data.status.startsWith('RESOLVED')) {
      await tx.disciplinaryCase.update({
        where: { id: recurso.decision.case.id },
        data: { status: 'CLOSED', closedAt: ahora, updatedByActorId: actor.actorId },
      });
    }

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.DISCIPLINARY_APPEAL_RESOLVED,
      objectKind: 'Appeal',
      objectId: recurso.id,
      outcome: 'SUCCESS',
      legalEntityId: recurso.decision.case.instructingBody.legalEntityId,
      reason: data.resolutionText.slice(0, 400),
      metadata: { folio: recurso.decision.case.folio, resultado: data.status, restituye: revoca },
    });
  });

  return ok({ status: data.status, rightsRestored: revoca });
}

export interface DisciplinaryCaseRow {
  readonly id: string;
  readonly folio: string;
  readonly personName: string;
  readonly status: DisciplinaryStatus;
  readonly reportedAt: Date;
  readonly notifiedAt: Date | null;
  readonly hearingScheduledAt: Date | null;
  readonly hearingHeldAt: Date | null;
  readonly hearingWaivedAt: Date | null;
  readonly memberAccessGrantedAt: Date | null;
  readonly instructingBody: string;
  readonly normativeVersion: string;
  readonly evidenceCount: number;
  readonly unassessedEvidence: number;
  readonly decision: {
    readonly id: string;
    readonly outcome: DisciplinaryOutcome;
    readonly decidedAt: Date;
    readonly appealDeadlineAt: Date | null;
    readonly rationale: string;
    readonly appeals: readonly { readonly id: string; readonly status: AppealStatus; readonly grounds: string }[];
  } | null;
  /** Puede resolverse: hay notificación y audiencia o renuncia. */
  readonly dueProcessComplete: boolean;
}

/**
 * Los expedientes que instruye quien pregunta, y ninguno más.
 *
 * Sin cargo vivo en ningún órgano instructor la lista sale **vacía**, no
 * prohibida: no es que no puedas mirar, es que no instruyes nada. Prohibir sería
 * decirle «no tienes autorización» a quien simplemente no tiene expedientes, y
 * una pantalla que la navegación ofrece no debe recibir a nadie con una
 * negativa.
 */
export async function disciplinaryCaseList(
  actor: ActorContext,
): Promise<UseCaseResult<readonly DisciplinaryCaseRow[]>> {
  const organos = await bodiesWithLiveOffice(actor);
  const decision = can(
    { ...actor, reason: 'consulta de procedimientos disciplinarios' },
    'discipline.case.read',
    { kind: 'DisciplinaryCase' },
    { hasLiveAssignment: () => organos.length > 0 },
  );
  if (!decision.allowed) {
    if (decision.reason === 'SIN_ASIGNACION') return ok([]);
    return fail(errors.forbidden(explain(decision.reason!)));
  }

  const filas = await db().disciplinaryCase.findMany({
    where: { instructingBodyId: { in: [...organos] } },
    orderBy: { reportedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      folio: true,
      status: true,
      reportedAt: true,
      notifiedAt: true,
      hearingScheduledAt: true,
      hearingHeldAt: true,
      hearingWaivedAt: true,
      memberAccessGrantedAt: true,
      instructingBody: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      person: {
        select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
      },
      evidence: { select: { admitted: true } },
      decision: {
        select: {
          id: true,
          outcome: true,
          decidedAt: true,
          appealDeadlineAt: true,
          rationale: true,
          appeals: { select: { id: true, status: true, grounds: true } },
        },
      },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      folio: fila.folio,
      personName: nombreCompleto(fila.person),
      status: fila.status,
      reportedAt: fila.reportedAt,
      notifiedAt: fila.notifiedAt,
      hearingScheduledAt: fila.hearingScheduledAt,
      hearingHeldAt: fila.hearingHeldAt,
      hearingWaivedAt: fila.hearingWaivedAt,
      memberAccessGrantedAt: fila.memberAccessGrantedAt,
      instructingBody: fila.instructingBody.name,
      normativeVersion: fila.normativeRuleSet.version,
      evidenceCount: fila.evidence.length,
      unassessedEvidence: fila.evidence.filter((prueba) => prueba.admitted === null).length,
      decision: fila.decision,
      dueProcessComplete:
        fila.notifiedAt !== null && (fila.hearingHeldAt !== null || fila.hearingWaivedAt !== null),
    })),
  );
}
