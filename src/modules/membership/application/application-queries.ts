import { db } from '@/platform/db/client';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import type { ApplicationStatus, MembershipCategory } from '@prisma-client/enums';

/**
 * Consultas de solicitudes (PRD §8.1).
 *
 * Separadas de los casos de uso a propósito: leer no cambia nada y no comparte
 * ni transacción ni auditoría con lo que sí cambia.
 *
 * La lectura de lo propio y la de la cola de revisión son **permisos
 * distintos**, no la misma consulta con un filtro. Si fueran la misma, un
 * descuido en el filtro convertiría la pantalla de «mis solicitudes» en el
 * expediente de todo el mundo.
 */

export interface ApplicationRow {
  readonly id: string;
  readonly folio: string;
  readonly status: ApplicationStatus;
  readonly category: MembershipCategory;
  readonly membershipType: string;
  readonly legalEntity: string;
  readonly personName: string;
  readonly personPublicId: string;
  readonly territory: string | null;
  readonly submittedAt: Date | null;
  readonly clarificationDueAt: Date | null;
  readonly documents: { readonly total: number; readonly pending: number; readonly rejected: number };
}

function nombre(persona: {
  givenName: string;
  middleName: string | null;
  familyName: string;
  secondFamilyName: string | null;
}): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

const SELECCION = {
  id: true,
  folio: true,
  status: true,
  category: true,
  submittedAt: true,
  clarificationDueAt: true,
  membershipType: { select: { name: true } },
  legalEntity: { select: { shortName: true } },
  territorialUnit: { select: { name: true } },
  person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, publicId: true } },
  documents: { select: { status: true } },
} as const;

type FilaCruda = {
  id: string;
  folio: string;
  status: ApplicationStatus;
  category: MembershipCategory;
  submittedAt: Date | null;
  clarificationDueAt: Date | null;
  membershipType: { name: string };
  legalEntity: { shortName: string };
  territorialUnit: { name: string } | null;
  person: {
    givenName: string;
    middleName: string | null;
    familyName: string;
    secondFamilyName: string | null;
    publicId: string;
  };
  documents: { status: string }[];
};

function aFila(fila: FilaCruda): ApplicationRow {
  return {
    id: fila.id,
    folio: fila.folio,
    status: fila.status,
    category: fila.category,
    membershipType: fila.membershipType.name,
    legalEntity: fila.legalEntity.shortName,
    personName: nombre(fila.person),
    personPublicId: fila.person.publicId,
    territory: fila.territorialUnit?.name ?? null,
    submittedAt: fila.submittedAt,
    clarificationDueAt: fila.clarificationDueAt,
    documents: {
      total: fila.documents.length,
      pending: fila.documents.filter((documento) => documento.status === 'SUBMITTED').length,
      rejected: fila.documents.filter((documento) => documento.status === 'REJECTED').length,
    },
  };
}

/** Las solicitudes de quien pregunta. */
export async function myApplications(actor: ActorContext): Promise<UseCaseResult<ApplicationRow[]>> {
  if (actor.personId === null) return ok([]);

  const decision = can(
    actor,
    'membership.application.read_own',
    { kind: 'MembershipApplication' },
    { hasLiveAssignment: () => true },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().membershipApplication.findMany({
    where: { personId: actor.personId },
    orderBy: { createdAt: 'desc' },
    select: SELECCION,
  });
  return ok(filas.map(aFila));
}

/** La cola de revisión. */
export async function applicationQueue(
  actor: ActorContext,
  filtros: { status?: ApplicationStatus; category?: MembershipCategory; query?: string } = {},
): Promise<UseCaseResult<ApplicationRow[]>> {
  const decision = can(actor, 'membership.application.read', {
    kind: 'MembershipApplication',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const texto = (filtros.query ?? '').trim();
  const filas = await db().membershipApplication.findMany({
    where: {
      ...(filtros.status === undefined ? {} : { status: filtros.status }),
      ...(filtros.category === undefined ? {} : { category: filtros.category }),
      ...(texto === ''
        ? {}
        : {
            OR: [
              { folio: { contains: texto, mode: 'insensitive' as const } },
              { person: { familyName: { contains: texto, mode: 'insensitive' as const } } },
              { person: { givenName: { contains: texto, mode: 'insensitive' as const } } },
            ],
          }),
    },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: SELECCION,
  });
  return ok(filas.map(aFila));
}

export interface ApplicationDetail extends ApplicationRow {
  readonly personId: string;
  readonly membershipTypeId: string;
  /** Hace falta en la pantalla: sin entidad, el motor no concede ningún alcance. */
  readonly legalEntityId: string;
  readonly acceptedRuleSetVersion: string;
  /** Lo enviado, tal como se envió. Nulo mientras siga en borrador. */
  readonly originalSummary: unknown;
  readonly autosavedDraft: unknown;
  readonly occupation: string | null;
  readonly workRelationKind: string | null;
  readonly neurodivergentContactStatement: string | null;
  readonly otherUnionMembership: string | null;
  readonly otherUnionClarification: string | null;
  readonly honoraryProfile: string | null;
  readonly resolutionAt: Date | null;
  readonly resolutionReason: string | null;
  readonly resolvedBy: string | null;
  readonly documentList: readonly {
    readonly id: string;
    readonly kind: string;
    readonly status: string;
    readonly fileObjectId: string;
    readonly fileName: string;
    readonly reviewNote: string | null;
    readonly reviewedAt: Date | null;
  }[];
  /**
   * Las aclaraciones pedidas, con su plazo y su respuesta.
   *
   * El estado se deduce de las fechas y no se guarda: una columna de estado
   * junto a las fechas que lo determinan es una columna que puede mentir.
   */
  readonly clarifications: readonly {
    readonly id: string;
    readonly request: string;
    readonly requestedBy: string;
    readonly requestedAt: Date;
    readonly dueAt: Date;
    readonly answer: string | null;
    readonly answeredAt: Date | null;
    readonly notifiedAt: Date | null;
    readonly closedAt: Date | null;
    readonly closeReason: string | null;
    readonly state: 'PENDING' | 'OVERDUE' | 'ANSWERED' | 'CLOSED';
  }[];
  readonly reviews: readonly {
    readonly id: string;
    readonly action: string;
    readonly rationale: string;
    readonly reviewer: string;
    readonly dueAt: Date | null;
    readonly createdAt: Date;
  }[];
}

/**
 * Detalle de una solicitud.
 *
 * Quien la presentó la ve entera; quien revisa, también. La diferencia está en
 * el permiso que abre la puerta, no en lo que se devuelve: ocultarle a alguien
 * su propio expediente no protege a nadie.
 */
export async function applicationDetail(
  actor: ActorContext,
  input: { applicationId: string },
): Promise<UseCaseResult<ApplicationDetail>> {
  const solicitud = await db().membershipApplication.findUnique({
    where: { id: input.applicationId },
    select: {
      ...SELECCION,
      personId: true,
      membershipTypeId: true,
      legalEntityId: true,
      originalSummary: true,
      autosavedDraft: true,
      workRelationKind: true,
      neurodivergentContactStatement: true,
      otherUnionMembership: true,
      otherUnionClarification: true,
      honoraryProfile: true,
      resolutionAt: true,
      resolutionReason: true,
      occupation: { select: { name: true } },
      acceptedRuleSet: { select: { version: true } },
      resolvedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
      documents: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          documentKind: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          fileObjectId: true,
          fileObject: { select: { originalFileName: true } },
        },
      },
      reviews: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          action: true,
          rationale: true,
          dueAt: true,
          createdAt: true,
          reviewer: { select: { person: { select: { givenName: true, familyName: true } } } },
        },
      },
      clarifications: {
        orderBy: { requestedAt: 'asc' },
        select: {
          id: true,
          request: true,
          requestedAt: true,
          dueAt: true,
          answer: true,
          answeredAt: true,
          notifiedAt: true,
          closedAt: true,
          closeReason: true,
          requestedBy: { select: { person: { select: { givenName: true, familyName: true } } } },
        },
      },
    },
  });
  if (solicitud === null) return fail(errors.notFound('solicitud inexistente'));

  const propia = solicitud.personId === actor.personId;
  const decision = can(
    actor,
    propia ? 'membership.application.read_own' : 'membership.application.read',
    { kind: 'MembershipApplication', id: solicitud.id, legalEntityId: solicitud.legalEntityId },
    { hasLiveAssignment: () => propia },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return ok({
    ...aFila(solicitud as unknown as FilaCruda),
    personId: solicitud.personId,
    membershipTypeId: solicitud.membershipTypeId,
    legalEntityId: solicitud.legalEntityId,
    acceptedRuleSetVersion: solicitud.acceptedRuleSet.version,
    originalSummary: solicitud.originalSummary,
    autosavedDraft: solicitud.autosavedDraft,
    occupation: solicitud.occupation?.name ?? null,
    workRelationKind: solicitud.workRelationKind,
    neurodivergentContactStatement: solicitud.neurodivergentContactStatement,
    otherUnionMembership: solicitud.otherUnionMembership,
    otherUnionClarification: solicitud.otherUnionClarification,
    honoraryProfile: solicitud.honoraryProfile,
    resolutionAt: solicitud.resolutionAt,
    resolutionReason: solicitud.resolutionReason,
    resolvedBy:
      solicitud.resolvedBy === null
        ? null
        : `${solicitud.resolvedBy.person.givenName} ${solicitud.resolvedBy.person.familyName}`,
    documentList: solicitud.documents.map((documento) => ({
      id: documento.id,
      kind: documento.documentKind,
      status: documento.status,
      fileObjectId: documento.fileObjectId,
      fileName: documento.fileObject.originalFileName,
      reviewNote: documento.reviewNote,
      reviewedAt: documento.reviewedAt,
    })),
    clarifications: solicitud.clarifications.map((aclaracion) => ({
      id: aclaracion.id,
      request: aclaracion.request,
      requestedBy: `${aclaracion.requestedBy.person.givenName} ${aclaracion.requestedBy.person.familyName}`,
      requestedAt: aclaracion.requestedAt,
      dueAt: aclaracion.dueAt,
      answer: aclaracion.answer,
      answeredAt: aclaracion.answeredAt,
      notifiedAt: aclaracion.notifiedAt,
      closedAt: aclaracion.closedAt,
      closeReason: aclaracion.closeReason,
      state:
        aclaracion.answeredAt !== null
          ? ('ANSWERED' as const)
          : aclaracion.closedAt !== null
            ? ('CLOSED' as const)
            : aclaracion.dueAt.getTime() < Date.now()
              ? ('OVERDUE' as const)
              : ('PENDING' as const),
    })),
    reviews: solicitud.reviews.map((revision) => ({
      id: revision.id,
      action: revision.action,
      rationale: revision.rationale,
      reviewer: `${revision.reviewer.person.givenName} ${revision.reviewer.person.familyName}`,
      dueAt: revision.dueAt,
      createdAt: revision.createdAt,
    })),
  });
}

/** Especialidades del catálogo, para el paso de actividad. */
export async function specialtyOptions(
  actor: ActorContext,
): Promise<UseCaseResult<{ id: string; code: string; name: string; kind: string }[]>> {
  const decision = can(actor, 'membership.type.read', { kind: 'SpecialtyCatalog' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().specialtyCatalog.findMany({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true, kind: true },
  });
  return ok(filas);
}
