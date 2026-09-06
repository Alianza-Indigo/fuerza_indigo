import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import type {
  CaseDomain,
  CaseMembershipQuality,
  CaseOutcome,
  CaseParticipantRole,
  CasePriority,
  CaseStatus,
  CaseTaskStatus,
  SupportRequestType,
} from '@prisma-client/enums';
import type { Prisma } from '@prisma-client/client';
import { compartimentoDe } from '../domain/access';
import { esParteDelExpediente, estaAsignada } from './assignment';

/**
 * Lectura de expedientes (PRD §10.2, §10.3).
 *
 * Dos lecturas distintas y no una con variantes:
 *
 *  · **La de quien lo lleva.** Exige facultad, compartimento y asignación viva.
 *    La lista solo trae los expedientes a su cargo; para quien tiene la
 *    facultad y ninguno asignado, sale **vacía**, no prohibida. Prohibir sería
 *    responderle «no tienes autorización» a quien simplemente no lleva nada.
 *  · **La de quien es parte.** Es sobre lo suyo, así que no pregunta por
 *    compartimento: los compartimentos separan áreas de la organización entre
 *    sí, no a una persona de su propio expediente. Y no ve lo reservado.
 */

export interface CaseRow {
  readonly id: string;
  readonly publicId: string;
  readonly folio: string;
  readonly caseType: SupportRequestType;
  readonly domain: CaseDomain;
  readonly priority: CasePriority;
  readonly status: CaseStatus;
  readonly openedAt: Date;
  readonly dueAt: Date | null;
  readonly legalEntityShortName: string;
  readonly solicitante: string | null;
  readonly tareasPendientes: number;
}

export interface CaseDetail extends CaseRow {
  readonly originalSummary: string;
  readonly humanAssessment: string | null;
  readonly firstResponseAt: Date | null;
  readonly closedAt: Date | null;
  readonly closeOutcome: CaseOutcome | null;
  readonly closeReason: string | null;
  readonly reopenCount: number;
  readonly territorio: string | null;
  readonly folioDeLaSolicitud: string | null;
  readonly equipo: readonly { readonly nombre: string; readonly rol: string }[];
  readonly participantes: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly papel: CaseParticipantRole;
    readonly calidad: CaseMembershipQuality;
    readonly veElExpediente: boolean;
  }[];
}

const CAMPOS_DE_FILA = {
  id: true,
  publicId: true,
  folio: true,
  caseType: true,
  domain: true,
  priority: true,
  status: true,
  openedAt: true,
  dueAt: true,
  legalEntity: { select: { shortName: true } },
  participants: {
    where: { role: 'APPLICANT' as const, removedAt: null },
    select: {
      role: true,
      externalName: true,
      person: {
        select: {
          givenName: true,
          middleName: true,
          familyName: true,
          secondFamilyName: true,
          preferredName: true,
        },
      },
    },
  },
  _count: {
    select: {
      tasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] satisfies CaseTaskStatus[] } } },
    },
  },
} as const satisfies Prisma.CaseSelect;

type FilaCruda = {
  id: string;
  publicId: string;
  folio: string;
  caseType: SupportRequestType;
  domain: CaseDomain;
  priority: CasePriority;
  status: CaseStatus;
  openedAt: Date;
  dueAt: Date | null;
  legalEntity: { shortName: string };
  participants: {
    role: CaseParticipantRole;
    externalName: string | null;
    person: {
      givenName: string;
      middleName: string | null;
      familyName: string;
      secondFamilyName: string | null;
      preferredName: string | null;
    } | null;
  }[];
  _count: { tasks: number };
};

function aFila(fila: FilaCruda): CaseRow {
  // Se busca por papel y no por posición. En la lista la consulta ya filtra a
  // quien pidió la ayuda, pero el detalle trae a **todos** los participantes,
  // y ahí el primero de la lista es el primero que se agregó, que no tiene por
  // qué ser el solicitante.
  const solicitante = fila.participants.find((participante) => participante.role === 'APPLICANT');
  return {
    id: fila.id,
    publicId: fila.publicId,
    folio: fila.folio,
    caseType: fila.caseType,
    domain: fila.domain,
    priority: fila.priority,
    status: fila.status,
    openedAt: fila.openedAt,
    dueAt: fila.dueAt,
    legalEntityShortName: fila.legalEntity.shortName,
    solicitante:
      solicitante === undefined
        ? null
        : solicitante.person !== null
          ? nombreCompleto(solicitante.person)
          : solicitante.externalName,
    tareasPendientes: fila._count.tasks,
  };
}

/**
 * Orden de la lista: lo que más daño hace si no se atiende, primero.
 *
 * No es por novedad ni por folio. Primero lo crítico, después lo que tiene un
 * plazo encima, y dentro de eso lo más antiguo: quien lleva más tiempo
 * esperando es quien peor lo está pasando. Una lista ordenada por novedad
 * entierra exactamente los expedientes que llevan meses parados.
 */
const ORDEN = [
  { priority: 'desc' as const },
  { dueAt: { sort: 'asc' as const, nulls: 'last' as const } },
  { openedAt: 'asc' as const },
];

export async function caseList(actor: ActorContext): Promise<UseCaseResult<readonly CaseRow[]>> {
  const userId = actor.userId;
  if (userId === null || userId === undefined) return ok([]);

  // Se pregunta por cada compartimento que el actor tenga: un expediente
  // sindical y uno social no se mezclan ni siquiera para contarlos.
  const dominios: CaseDomain[] = [];
  if (actor.compartments.has('UNION')) dominios.push('UNION_DEFENSE');
  if (actor.compartments.has('SOCIAL')) dominios.push('SOCIAL_ATTENTION');
  if (dominios.length === 0) return ok([]);

  const decision = can(
    actor,
    'cases.case.read',
    { kind: 'Case', compartment: compartimentoDe(dominios[0]!) },
    { hasLiveAssignment: () => true },
  );
  // Sin la facultad se niega; con la facultad y sin expedientes a cargo la
  // consulta de abajo devuelve una lista vacía, que es la respuesta correcta.
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().case.findMany({
    where: {
      domain: { in: dominios },
      assignments: { some: { userId, unassignedAt: null } },
    },
    orderBy: ORDEN,
    take: 200,
    select: CAMPOS_DE_FILA,
  });

  return ok(filas.map(aFila));
}

/**
 * Un expediente, por su identificador público.
 *
 * Se busca por `publicId` y no por `id` porque es lo que viaja en la dirección:
 * el identificador interno no se expone, para que nadie pueda deducir cuántos
 * expedientes hay ni acertar el siguiente (docs/DATA_MODEL.md §3).
 */
export async function caseDetail(actor: ActorContext, publicId: string): Promise<UseCaseResult<CaseDetail>> {
  const fila = await db().case.findUnique({
    where: { publicId },
    select: {
      ...CAMPOS_DE_FILA,
      legalEntityId: true,
      originalSummary: true,
      humanAssessment: true,
      firstResponseAt: true,
      closedAt: true,
      closeOutcome: true,
      closeReason: true,
      reopenCount: true,
      territorialUnit: { select: { name: true } },
      supportRequest: { select: { folio: true } },
      participants: {
        where: { removedAt: null },
        orderBy: { addedAt: 'asc' },
        select: {
          id: true,
          role: true,
          membershipQuality: true,
          externalName: true,
          canViewCase: true,
          person: {
            select: {
              givenName: true,
              middleName: true,
              familyName: true,
              secondFamilyName: true,
              preferredName: true,
            },
          },
        },
      },
      assignments: {
        where: { unassignedAt: null },
        select: {
          assignmentRole: true,
          user: {
            select: {
              person: {
                select: {
                  givenName: true,
                  middleName: true,
                  familyName: true,
                  secondFamilyName: true,
                  preferredName: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (fila === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, fila.id);
  const parte = await esParteDelExpediente(actor, fila.id);

  // Quien es parte lee lo suyo por su propia facultad. No se le pide
  // compartimento: los compartimentos separan áreas entre sí, no a una persona
  // de su propio expediente.
  const decision = parte
    ? can(
        actor,
        'cases.case.read_own',
        { kind: 'Case', id: fila.id, legalEntityId: fila.legalEntityId },
        { hasLiveAssignment: () => true },
      )
    : can(
        actor,
        'cases.case.read',
        {
          kind: 'Case',
          id: fila.id,
          legalEntityId: fila.legalEntityId,
          compartment: compartimentoDe(fila.domain),
        },
        { hasLiveAssignment: () => asignada },
      );

  // Fuera de alcance e inexistente responden igual: decir «existe pero no es
  // tuyo» confirmaría que hay un expediente sobre alguien.
  if (!decision.allowed) return fail(errors.notFound('Ese expediente no existe.'));

  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_READ,
      objectKind: 'Case',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: fila.legalEntityId,
      metadata: { folio: fila.folio, comoParte: parte },
    });
  });

  return ok({
    ...aFila(fila),
    originalSummary: fila.originalSummary,
    humanAssessment: fila.humanAssessment,
    firstResponseAt: fila.firstResponseAt,
    closedAt: fila.closedAt,
    closeOutcome: fila.closeOutcome,
    closeReason: fila.closeReason,
    reopenCount: fila.reopenCount,
    territorio: fila.territorialUnit?.name ?? null,
    folioDeLaSolicitud: fila.supportRequest?.folio ?? null,
    equipo: fila.assignments.map((asignacion) => ({
      nombre: nombreCompleto(asignacion.user.person),
      rol: asignacion.assignmentRole,
    })),
    participantes: fila.participants.map((participante) => ({
      id: participante.id,
      nombre:
        participante.person !== null
          ? nombreCompleto(participante.person)
          : (participante.externalName ?? 'Sin nombre'),
      papel: participante.role,
      calidad: participante.membershipQuality,
      veElExpediente: participante.canViewCase,
    })),
  });
}
