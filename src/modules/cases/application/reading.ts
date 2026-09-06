import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain, territorialReach } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { nombreCompleto } from '@/platform/i18n/person-name';
import type {
  CaseAssignmentRole,
  CaseDomain,
  CaseMessageAudience,
  CaseMembershipQuality,
  CaseOutcome,
  CaseParticipantRole,
  CasePriority,
  CaseRiskKind,
  CaseStatus,
  CaseDocumentKind,
  CaseTaskStatus,
  FileClassification,
  ReferralStatus,
  SupportRequestType,
} from '@prisma-client/enums';
import type { Prisma } from '@prisma-client/client';
import { compartimentoDe } from '../domain/access';
import { ALCANCE_DE_LECTURA, type ClaseDeLectura } from '../domain/audience';
import { filtroTerritorial } from './assignment';
import { acusesDe, claseDeLectura, registrarAcuses } from './messages';

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
  readonly equipo: readonly {
    /** Identificador de la asignación: es lo que releva, no la persona. */
    readonly id: string;
    /** Quién es, para encomendarle tareas. */
    readonly usuarioId: string;
    readonly nombre: string;
    readonly rol: CaseAssignmentRole;
  }[];
  readonly participantes: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly papel: CaseParticipantRole;
    readonly calidad: CaseMembershipQuality;
    readonly veElExpediente: boolean;
  }[];
  /**
   * Con qué clase de lectura se está viendo. La pantalla la necesita para no
   * ofrecer lo que el módulo va a rechazar: escribir una nota reservada, por
   * ejemplo, a quien no puede volver a abrirla.
   */
  readonly lectura: ClaseDeLectura;
  /**
   * Seguimiento de las canalizaciones (PRD §10.4, requisito 5).
   *
   * Se ve **el estado**, no lo que se dijo dentro: quien envió sabe si la
   * aceptaron, la devolvieron o sigue esperando, y eso no le da acceso a nada
   * que no viajara.
   */
  /**
   * Marcas de riesgo inmediato vivas o cerradas (PRD §10.3).
   *
   * Se le enseñan también a quien es parte: saber que la organización tomó en
   * serio lo que contó, y qué hizo, es lo mínimo que se le debe.
   */
  readonly riesgos: readonly {
    readonly id: string;
    readonly clase: CaseRiskKind;
    readonly levantadaEl: Date;
    readonly recogidaPor: string | null;
    readonly recogidaEl: Date | null;
    readonly resolucion: string | null;
    readonly cerradaEl: Date | null;
  }[];
  readonly canalizaciones: readonly {
    readonly id: string;
    readonly estado: ReferralStatus;
    readonly haciaEntidad: string;
    readonly destinatarioExterno: string | null;
    readonly motivo: string;
    readonly explicacion: string;
    readonly camposCompartidos: readonly string[];
    readonly archivosCompartidos: number;
    readonly enviadaEl: Date | null;
    readonly aceptadaEl: Date | null;
    readonly motivoDeDevolucion: string | null;
  }[];
  readonly documentos: readonly {
    readonly id: string;
    readonly archivoId: string;
    readonly clase: CaseDocumentKind;
    readonly descripcion: string;
    readonly clasificacion: FileClassification;
    readonly nombreDeArchivo: string;
    readonly visibleParaLaPersona: boolean;
    /** Abrirlo exige escribir por qué (PRD §10.3). */
    readonly exigeMotivo: boolean;
  }[];
  readonly comunicaciones: readonly {
    readonly id: string;
    readonly audiencia: CaseMessageAudience;
    readonly autor: string | null;
    readonly cuerpo: string;
    readonly enviadaEl: Date;
    readonly corregidaEl: Date | null;
    /** Cuántas personas la han acusado. Cero no es lo mismo que no enviada. */
    readonly acuses: number;
    /** Quién la escribió puede corregirla mientras nadie la haya leído. */
    readonly corregible: boolean;
  }[];
  readonly tareas: readonly {
    readonly id: string;
    readonly titulo: string;
    readonly descripcion: string | null;
    readonly responsable: string | null;
    readonly responsableId: string | null;
    readonly plazo: Date | null;
    readonly estado: CaseTaskStatus;
    /** Se deriva al leer: un plazo vencido no se guarda, se compara. */
    readonly vencida: boolean;
    readonly motivo: string | null;
    readonly terminadaEl: Date | null;
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

  // El territorio se filtra **en la consulta**, con el mismo alcance que
  // comprueba el detalle. Traer los expedientes de fuera para descartarlos
  // después sería traerlos igual, y bastaría un descuido en la pantalla para
  // que se vieran.
  const territorio = filtroTerritorial(territorialReach(actor, 'cases.case.read'));

  const filas = await db().case.findMany({
    where: {
      domain: { in: dominios },
      assignments: { some: { userId, unassignedAt: null } },
      ...(territorio ?? {}),
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
      territorialUnit: { select: { name: true, path: true } },
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
      tasks: {
        orderBy: [
          { status: 'asc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          title: true,
          description: true,
          dueAt: true,
          status: true,
          blockerNote: true,
          completedAt: true,
          assigneeId: true,
          assignee: {
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
      assignments: {
        where: { unassignedAt: null },
        orderBy: { assignedAt: 'asc' },
        select: {
          id: true,
          userId: true,
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

  // Quién es quien pregunta respecto de este expediente: lo lleva, es parte de
  // él, o ninguna de las dos. De eso salen tanto el permiso de entrar como qué
  // comunicaciones alcanza, y sale de un solo sitio para que no puedan
  // discrepar: un expediente que se abre y unas notas que no se recortan sería
  // exactamente el fallo que la separación de audiencias existe para impedir.
  const clase = await claseDeLectura(actor, fila);

  // Fuera de alcance e inexistente responden igual: decir «existe pero no es
  // tuyo» confirmaría que hay un expediente sobre alguien.
  if (clase === null) return fail(errors.notFound('Ese expediente no existe.'));
  const parte = clase === 'PERSONA';

  const riesgos = await db().emergencyFlag.findMany({
    where: { caseId: fila.id },
    orderBy: { raisedAt: 'desc' },
    select: {
      id: true,
      riskKind: true,
      raisedAt: true,
      acknowledgedAt: true,
      resolution: true,
      closedAt: true,
      acknowledgedBy: {
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
  });

  // Las canalizaciones solo se le enseñan a quien lleva el expediente: para la
  // persona, el estado de un trámite entre áreas es ruido, y lo que necesita
  // saber se le comunica.
  const canalizaciones = parte
    ? []
    : await db().referral.findMany({
        where: { caseId: fila.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          externalRecipient: true,
          reason: true,
          explanationShownToPerson: true,
          sharedFields: true,
          sentAt: true,
          acceptedAt: true,
          returnReason: true,
          toLegalEntity: { select: { shortName: true } },
          _count: { select: { sharedFiles: true } },
        },
      });

  // Los documentos también se recortan en la consulta. A quien es parte solo se
  // le traen los que se le enseñan: un documento de trabajo interno no está en
  // su expediente para que lo lea, está para que el equipo trabaje.
  const documentos = await db().caseDocument.findMany({
    where: {
      caseId: fila.id,
      removedAt: null,
      ...(parte ? { visibleToPerson: true } : {}),
    },
    orderBy: { addedAt: 'desc' },
    select: {
      id: true,
      kind: true,
      description: true,
      visibleToPerson: true,
      fileObject: { select: { id: true, classification: true, originalFileName: true } },
    },
  });

  // Las comunicaciones se piden aparte y **filtradas en la consulta**. Traerlas
  // todas para tachar después las reservadas sería traerlas igual.
  const comunicaciones = await db().caseMessage.findMany({
    where: { caseId: fila.id, audience: { in: [...ALCANCE_DE_LECTURA[clase]] } },
    orderBy: { sentAt: 'desc' },
    take: 200,
    select: {
      id: true,
      audience: true,
      body: true,
      sentAt: true,
      editedAt: true,
      authorId: true,
      readReceipts: true,
      author: {
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
  });

  // Quien es parte deja acuse de lo que se le dirigió, por el hecho de leerlo.
  // Un acuse que dependiera de pulsar «enterado» probaría que pulsó, no que se
  // le dijo.
  if (parte && actor.personId !== null && actor.personId !== undefined) {
    await registrarAcuses(actor.personId, comunicaciones);
  }

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
      id: asignacion.id,
      usuarioId: asignacion.userId,
      nombre: nombreCompleto(asignacion.user.person),
      rol: asignacion.assignmentRole,
    })),
    lectura: clase,
    riesgos: riesgos.map((marca) => ({
      id: marca.id,
      clase: marca.riskKind,
      levantadaEl: marca.raisedAt,
      recogidaPor: marca.acknowledgedBy === null ? null : nombreCompleto(marca.acknowledgedBy.person),
      recogidaEl: marca.acknowledgedAt,
      resolucion: marca.resolution,
      cerradaEl: marca.closedAt,
    })),
    canalizaciones: canalizaciones.map((canalizacion) => ({
      id: canalizacion.id,
      estado: canalizacion.status,
      haciaEntidad: canalizacion.toLegalEntity.shortName,
      destinatarioExterno: canalizacion.externalRecipient,
      motivo: canalizacion.reason,
      explicacion: canalizacion.explanationShownToPerson,
      camposCompartidos: canalizacion.sharedFields,
      archivosCompartidos: canalizacion._count.sharedFiles,
      enviadaEl: canalizacion.sentAt,
      aceptadaEl: canalizacion.acceptedAt,
      motivoDeDevolucion: canalizacion.returnReason,
    })),
    documentos: documentos.map((documento) => ({
      id: documento.id,
      archivoId: documento.fileObject.id,
      clase: documento.kind,
      descripcion: documento.description,
      clasificacion: documento.fileObject.classification,
      nombreDeArchivo: documento.fileObject.originalFileName,
      visibleParaLaPersona: documento.visibleToPerson,
      // Quien es parte abre lo suyo sin explicar por qué. La autorización
      // expresa que el PRD §10.3 exige es la del personal que mira el
      // diagnóstico de otra persona.
      exigeMotivo: documento.kind === 'MEDICAL_OR_CLINICAL' && !parte,
    })),
    comunicaciones: comunicaciones.map((mensaje) => ({
      id: mensaje.id,
      audiencia: mensaje.audience,
      autor: mensaje.author === null ? null : nombreCompleto(mensaje.author.person),
      cuerpo: mensaje.body,
      enviadaEl: mensaje.sentAt,
      corregidaEl: mensaje.editedAt,
      acuses: acusesDe(mensaje.readReceipts).length,
      corregible:
        mensaje.authorId !== null &&
        mensaje.authorId === (actor.userId ?? null) &&
        acusesDe(mensaje.readReceipts).length === 0,
    })),
    tareas: fila.tasks.map((tarea) => ({
      id: tarea.id,
      titulo: tarea.title,
      descripcion: tarea.description,
      responsable: tarea.assignee === null ? null : nombreCompleto(tarea.assignee.person),
      responsableId: tarea.assigneeId,
      plazo: tarea.dueAt,
      estado: tarea.status,
      // Vencida es una comparación, no una columna: una columna guardada
      // envejecería mal y habría que ir a actualizarla con un trabajo nocturno,
      // que abriría una ventana en la que la pantalla dice que hay tiempo.
      vencida:
        tarea.dueAt !== null &&
        tarea.dueAt.getTime() < Date.now() &&
        tarea.status !== 'DONE' &&
        tarea.status !== 'CANCELLED',
      motivo: tarea.blockerNote,
      terminadaEl: tarea.completedAt,
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
