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
import { nombreCompleto } from '@/platform/i18n/person-name';
import { leerReglas } from '@/modules/governance';
import { issueDocument } from '@/modules/documents';
import type { ElectionStatus } from '@prisma-client/enums';

/**
 * Proceso electoral: comisión, calendario y convocatoria
 * (PRD §9.6; F5-ELE-001, F5-ELE-002).
 *
 * **La Comisión Electoral se integra antes de convocar.** Un proceso convocado
 * sin comisión no tiene quién valide planillas ni resuelva incidencias, y quien
 * acabe haciéndolo lo hará sin haber declarado que no tiene candidatura. Por eso
 * la convocatoria exige la comisión completa según el estatuto y con la
 * declaración de cada integrante.
 *
 * **El calendario es una lista de etapas con fecha, y se guarda entero.** No es
 * un adorno: la impugnación de un proceso electoral suele apoyarse en un plazo,
 * y el plazo tiene que constar desde el principio y no reconstruirse después.
 *
 * **El estado avanza en un solo sentido.** Se puede anular, pero no se puede
 * retroceder de «resultados declarados» a «registro abierto»: eso permitiría
 * inscribir una planilla después de conocer los resultados.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_EN_MS = 24 * 60 * 60 * 1000;

/** Etapas del calendario electoral. Cada una con su fecha de inicio. */
export const etapaSchema = z.object({
  code: z.enum(['CALL', 'REGISTRATION', 'REVIEW', 'CAMPAIGN', 'VOTING', 'TALLY', 'RESULTS', 'CHALLENGES']),
  label: z.string().trim().min(3).max(120),
  startsOn: z.string().trim().regex(FECHA, { error: () => 'La fecha va como 2026-01-01.' }),
});

export type EtapaElectoral = z.infer<typeof etapaSchema>;

export const NOMBRE_DE_ETAPA: Readonly<Record<EtapaElectoral['code'], string>> = {
  CALL: 'Convocatoria',
  REGISTRATION: 'Registro de planillas',
  REVIEW: 'Revisión de requisitos',
  CAMPAIGN: 'Campaña',
  VOTING: 'Jornada de votación',
  TALLY: 'Escrutinio',
  RESULTS: 'Declaración de resultados',
  CHALLENGES: 'Impugnaciones',
};

export const createElectionSchema = z.object({
  unionBodyId: z.uuid({ error: () => 'Elige el órgano que se renueva.' }),
  territorialUnitId: z.uuid({ error: () => 'Elige la unidad territorial del proceso.' }),
  name: z.string().trim().min(5).max(200),
  calendar: z.array(etapaSchema).min(2, {
    error: () => 'Un calendario electoral necesita al menos la convocatoria y la jornada.',
  }),
});

export type CreateElectionInput = z.infer<typeof createElectionSchema>;

export async function createElection(
  actor: ActorContext,
  input: CreateElectionInput,
): Promise<UseCaseResult<{ electionId: string; publicId: string }>> {
  const parsed = createElectionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.election.manage', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  // El calendario tiene que ir hacia adelante. Un registro que abre después de
  // la jornada no es un error de captura: es un proceso que nadie puede seguir.
  const ordenadas = [...data.calendar].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const desordenado = data.calendar.some((etapa, indice) => etapa.code !== ordenadas[indice]?.code);
  if (desordenado) {
    return fail(
      errors.validation({
        calendar: ['Las etapas no van en orden de fecha. Ordénalas: un registro que abre tras la jornada no se puede cumplir.'],
      }),
    );
  }

  const version = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true, rules: true },
  });
  if (version === null) {
    return fail(errors.conflict('No hay reglas estatutarias en vigor. Una elección se convoca conforme a un estatuto.'));
  }
  if (leerReglas(version.rules) === null) {
    return fail(errors.conflict(`La versión ${version.version} está en vigor pero le faltan umbrales.`));
  }

  const organo = await db().unionBody.findUnique({
    where: { id: data.unionBodyId },
    select: { id: true, name: true, status: true },
  });
  if (organo === null) return fail(errors.notFound('Ese órgano no existe.'));
  if (organo.status !== 'ACTIVE') return fail(errors.conflict(`«${organo.name}» no está activo.`));

  const publicId = newPublicId();
  const creada = await transaction(async (tx) => {
    const fila = await tx.election.create({
      data: {
        publicId,
        unionBodyId: organo.id,
        territorialUnitId: data.territorialUnitId,
        name: data.name,
        calendar: data.calendar,
        status: 'PLANNED',
        normativeRuleSetId: version.id,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ELECTION_CREATED,
      objectKind: 'Election',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: data.territorialUnitId,
      metadata: { nombre: data.name, organo: organo.name, version: version.version, etapas: data.calendar.length },
    });

    return fila;
  });

  return ok({ electionId: creada.id, publicId });
}

export const assignCommissionSchema = z.object({
  electionId: z.uuid(),
  personId: z.uuid(),
  officeTermId: z.uuid().nullable().default(null),
  /** Declaración de no tener candidatura incompatible. */
  noCandidacyDeclared: z.boolean(),
});

export type AssignCommissionInput = z.infer<typeof assignCommissionSchema>;

/**
 * Integra a una persona en la Comisión Electoral.
 *
 * La declaración de no tener candidatura no es una casilla de trámite: sin ella
 * la integración no se registra. Quien valida planillas no puede ser quien las
 * presenta, y que conste con fecha es lo que permite auditarlo después.
 */
export async function assignCommissionMember(
  actor: ActorContext,
  input: AssignCommissionInput,
): Promise<UseCaseResult<{ assigned: true; members: number }>> {
  const parsed = assignCommissionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.election.manage', { kind: 'ElectionCommissionMember' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  if (!data.noCandidacyDeclared) {
    return fail(
      errors.validation({
        noCandidacyDeclared: [
          'Sin la declaración de no tener candidatura no se integra la comisión. Quien valida planillas no puede presentarlas.',
        ],
      }),
    );
  }

  const eleccion = await db().election.findUnique({
    where: { id: data.electionId },
    select: { id: true, publicId: true, status: true },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  if (eleccion.status !== 'PLANNED') {
    return fail(errors.conflict('La comisión se integra antes de convocar.'));
  }

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
  if (persona === null) return fail(errors.notFound('Esa persona no está en el registro.'));

  const yaEsta = await db().electionCommissionMember.findUnique({
    where: { electionId_personId: { electionId: eleccion.id, personId: persona.id } },
    select: { electionId: true },
  });
  if (yaEsta !== null) return fail(errors.conflict('Esa persona ya integra la comisión de este proceso.'));

  const enPlanilla = await db().slateMember.findFirst({
    where: { personId: persona.id, slate: { electionId: eleccion.id } },
    select: { slateId: true },
  });
  if (enPlanilla !== null) {
    return fail(
      errors.conflict('Esa persona ya figura en una planilla de este proceso. No puede integrar la comisión que la revisa.'),
    );
  }

  await transaction(async (tx) => {
    await tx.electionCommissionMember.create({
      data: {
        electionId: eleccion.id,
        personId: persona.id,
        officeTermId: data.officeTermId,
        noCandidacyDeclared: true,
        declaredAt: new Date(),
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ELECTION_COMMISSION_ASSIGNED,
      objectKind: 'ElectionCommissionMember',
      objectId: eleccion.id,
      outcome: 'SUCCESS',
      metadata: { eleccion: eleccion.publicId, persona: nombreCompleto(persona) },
    });
  });

  const members = await db().electionCommissionMember.count({
    where: { electionId: eleccion.id, unassignedAt: null },
  });

  return ok({ assigned: true, members });
}

export const issueElectionCallSchema = z.object({
  electionId: z.uuid(),
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
});

/**
 * Emite la convocatoria a elecciones.
 *
 * Comprueba tres cosas antes: que la comisión esté integrada con el número de
 * plazas que fija el estatuto, que todas hayan declarado no tener candidatura,
 * y que la anticipación de la convocatoria alcance el mínimo estatutario
 * respecto de la jornada.
 */
export async function issueElectionCall(
  actor: ActorContext,
  input: z.infer<typeof issueElectionCallSchema>,
): Promise<UseCaseResult<{ folio: string; noticeDays: number }>> {
  const parsed = issueElectionCallSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'election.election.manage', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const eleccion = await db().election.findUnique({
    where: { id: parsed.data.electionId },
    select: {
      id: true,
      publicId: true,
      name: true,
      status: true,
      calendar: true,
      callDocumentId: true,
      territorialUnitId: true,
      unionBody: { select: { name: true, legalEntity: { select: { legalName: true } } } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true, rules: true } },
      commissionMembers: {
        where: { unassignedAt: null },
        select: {
          noCandidacyDeclared: true,
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
    },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));
  if (eleccion.callDocumentId !== null) return fail(errors.conflict('Esa convocatoria ya se emitió.'));
  if (eleccion.status !== 'PLANNED') return fail(errors.conflict('Ese proceso ya no está en preparación.'));

  const reglas = leerReglas(eleccion.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(errors.conflict(`La versión ${eleccion.normativeRuleSet.version} tiene umbrales incompletos.`));
  }

  const integrantes = eleccion.commissionMembers;
  if (integrantes.length < reglas.electoralCommissionSeats) {
    return fail(
      errors.conflict(
        `El estatuto exige ${reglas.electoralCommissionSeats} integrantes en la Comisión Electoral y hay ${integrantes.length}. Un proceso sin comisión completa no tiene quién valide ni quién resuelva.`,
      ),
    );
  }
  const sinDeclarar = integrantes.filter((integrante) => !integrante.noCandidacyDeclared);
  if (sinDeclarar.length > 0) {
    return fail(
      errors.conflict(
        `Falta la declaración de no tener candidatura de: ${sinDeclarar.map((integrante) => nombreCompleto(integrante.person)).join(', ')}.`,
      ),
    );
  }

  const etapas = etapaSchema.array().safeParse(eleccion.calendar);
  if (!etapas.success) return fail(errors.conflict('El calendario del proceso no es legible.'));
  const jornada = etapas.data.find((etapa) => etapa.code === 'VOTING');
  if (jornada === undefined) {
    return fail(errors.conflict('El calendario no tiene jornada de votación. No se convoca a una fecha que no existe.'));
  }

  const emitidaEl = new Date();
  const dias = (new Date(`${jornada.startsOn}T00:00:00.000Z`).getTime() - emitidaEl.getTime()) / DIA_EN_MS;
  if (dias < reglas.electionCallNoticeDays) {
    return fail(
      errors.conflict(
        `El estatuto exige ${reglas.electionCallNoticeDays} día(s) de anticipación a la jornada y faltan ${Math.floor(dias)}.`,
      ),
    );
  }

  const documento = await issueDocument(actor, {
    templateCode: parsed.data.templateCode,
    subjectKind: 'ELECTION',
    subjectId: eleccion.id,
    variables: {
      entidad: eleccion.unionBody.legalEntity.legalName,
      organo: eleccion.unionBody.name,
      territorio: eleccion.territorialUnit.name,
      proceso: eleccion.name,
      calendario: etapas.data
        .map((etapa) => `${NOMBRE_DE_ETAPA[etapa.code]}: ${etapa.startsOn}`)
        .join('\n'),
      comisionElectoral: integrantes.map((integrante) => nombreCompleto(integrante.person)).join(', '),
      jornada: jornada.startsOn,
      anticipacion: String(reglas.electionCallNoticeDays),
      proporcionalidad: String(reglas.genderProportionalityMinPercent),
      versionNormativa: eleccion.normativeRuleSet.version,
    },
  });
  if (!documento.ok) return fail(documento.error);

  await transaction(async (tx) => {
    await tx.election.update({
      where: { id: eleccion.id },
      data: { status: 'CALL_ISSUED', callDocumentId: documento.data.documentId, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ELECTION_CALL_ISSUED,
      objectKind: 'Election',
      objectId: eleccion.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      metadata: {
        eleccion: eleccion.publicId,
        folio: documento.data.folio,
        anticipacion: reglas.electionCallNoticeDays,
        comision: integrantes.length,
      },
    });
  });

  return ok({ folio: documento.data.folio, noticeDays: reglas.electionCallNoticeDays });
}

/** Estados a los que se puede pasar desde cada estado. Sin marcha atrás. */
const AVANCE: Readonly<Record<ElectionStatus, readonly ElectionStatus[]>> = {
  PLANNED: ['CALL_ISSUED', 'ANNULLED'],
  CALL_ISSUED: ['REGISTRATION_OPEN', 'ANNULLED'],
  REGISTRATION_OPEN: ['CAMPAIGN', 'ANNULLED'],
  CAMPAIGN: ['VOTING', 'ANNULLED'],
  VOTING: ['TALLYING', 'ANNULLED'],
  TALLYING: ['RESULTS_DECLARED', 'ANNULLED'],
  RESULTS_DECLARED: ['CHALLENGED', 'CLOSED', 'ANNULLED'],
  CHALLENGED: ['CLOSED', 'ANNULLED'],
  CLOSED: [],
  ANNULLED: [],
};

export const advanceElectionSchema = z.object({
  electionId: z.uuid(),
  to: z.enum([
    'CALL_ISSUED',
    'REGISTRATION_OPEN',
    'CAMPAIGN',
    'VOTING',
    'TALLYING',
    'RESULTS_DECLARED',
    'CHALLENGED',
    'CLOSED',
    'ANNULLED',
  ]),
  reason: z.string().trim().min(10).max(2000),
});

/**
 * Avanza el proceso a la etapa siguiente.
 *
 * No hay marcha atrás. Volver de «resultados declarados» a «registro abierto»
 * permitiría inscribir una planilla después de conocer los resultados, que es
 * la forma más simple de vaciar una elección de sentido. Un proceso que se
 * tuerce se anula, y la anulación consta con su motivo.
 */
export async function advanceElection(
  actor: ActorContext,
  input: z.infer<typeof advanceElectionSchema>,
): Promise<UseCaseResult<{ status: ElectionStatus }>> {
  const parsed = advanceElectionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'election.election.manage', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const eleccion = await db().election.findUnique({
    where: { id: data.electionId },
    select: { id: true, publicId: true, status: true, territorialUnitId: true },
  });
  if (eleccion === null) return fail(errors.notFound('Ese proceso electoral no existe.'));

  const permitidos = AVANCE[eleccion.status];
  if (!permitidos.includes(data.to)) {
    return fail(
      errors.conflict(
        permitidos.length === 0
          ? 'Ese proceso está terminado: no admite más cambios de etapa.'
          : `Desde «${eleccion.status}» solo se puede pasar a: ${permitidos.join(', ')}. El proceso electoral no retrocede.`,
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.election.update({
      where: { id: eleccion.id },
      data: { status: data.to, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.ELECTION_ADVANCED,
      objectKind: 'Election',
      objectId: eleccion.id,
      outcome: 'SUCCESS',
      territorialUnitId: eleccion.territorialUnitId,
      reason: data.reason,
      metadata: { eleccion: eleccion.publicId, de: eleccion.status, a: data.to },
    });
  });

  return ok({ status: data.to });
}

export interface ElectionRow {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly bodyName: string;
  readonly territory: string;
  readonly status: ElectionStatus;
  readonly calendar: readonly EtapaElectoral[];
  readonly commissionMembers: readonly { readonly name: string; readonly declared: boolean }[];
  readonly slateCount: number;
  readonly rosterPublishedAt: Date | null;
  readonly callIssued: boolean;
  readonly normativeVersion: string;
  readonly openIncidents: number;
}

export async function electionList(actor: ActorContext): Promise<UseCaseResult<readonly ElectionRow[]>> {
  const decision = can(actor, 'voting.process.read', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().election.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      publicId: true,
      name: true,
      status: true,
      calendar: true,
      callDocumentId: true,
      rosterPublishedAt: true,
      unionBody: { select: { name: true } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      commissionMembers: {
        where: { unassignedAt: null },
        select: {
          noCandidacyDeclared: true,
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      _count: { select: { slates: true } },
      incidents: { where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } }, select: { id: true } },
    },
  });

  return ok(
    filas.map((fila) => {
      const etapas = etapaSchema.array().safeParse(fila.calendar);
      return {
        id: fila.id,
        publicId: fila.publicId,
        name: fila.name,
        bodyName: fila.unionBody.name,
        territory: fila.territorialUnit.name,
        status: fila.status,
        calendar: etapas.success ? etapas.data : [],
        commissionMembers: fila.commissionMembers.map((integrante) => ({
          name: nombreCompleto(integrante.person),
          declared: integrante.noCandidacyDeclared,
        })),
        slateCount: fila._count.slates,
        rosterPublishedAt: fila.rosterPublishedAt,
        callIssued: fila.callDocumentId !== null,
        normativeVersion: fila.normativeRuleSet.version,
        openIncidents: fila.incidents.length,
      };
    }),
  );
}

export interface ElectionDetail extends ElectionRow {
  readonly unionBodyId: string;
  readonly territorialUnitId: string;
  readonly voteProcess: {
    readonly id: string;
    readonly publicId: string;
    readonly status: string;
    readonly title: string;
  } | null;
  readonly nextStates: readonly ElectionStatus[];
}

export async function electionDetail(
  actor: ActorContext,
  publicId: string,
): Promise<UseCaseResult<ElectionDetail>> {
  const decision = can(actor, 'voting.process.read', { kind: 'Election' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fila = await db().election.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      name: true,
      status: true,
      calendar: true,
      callDocumentId: true,
      rosterPublishedAt: true,
      unionBodyId: true,
      territorialUnitId: true,
      unionBody: { select: { name: true } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      commissionMembers: {
        where: { unassignedAt: null },
        select: {
          noCandidacyDeclared: true,
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      voteProcess: { select: { id: true, publicId: true, status: true, title: true } },
      _count: { select: { slates: true } },
      incidents: { where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } }, select: { id: true } },
    },
  });
  if (fila === null) return fail(errors.notFound('Ese proceso electoral no existe.'));

  const etapas = etapaSchema.array().safeParse(fila.calendar);

  return ok({
    id: fila.id,
    publicId: fila.publicId,
    name: fila.name,
    bodyName: fila.unionBody.name,
    territory: fila.territorialUnit.name,
    status: fila.status,
    calendar: etapas.success ? etapas.data : [],
    commissionMembers: fila.commissionMembers.map((integrante) => ({
      name: nombreCompleto(integrante.person),
      declared: integrante.noCandidacyDeclared,
    })),
    slateCount: fila._count.slates,
    rosterPublishedAt: fila.rosterPublishedAt,
    callIssued: fila.callDocumentId !== null,
    normativeVersion: fila.normativeRuleSet.version,
    openIncidents: fila.incidents.length,
    unionBodyId: fila.unionBodyId,
    territorialUnitId: fila.territorialUnitId,
    voteProcess: fila.voteProcess,
    nextStates: AVANCE[fila.status],
  });
}
