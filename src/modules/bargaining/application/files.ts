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
import { freezeConsultationRoster } from '@/modules/assembly';
import { issueDocument } from '@/modules/documents';
import { scheduleVoteProcess } from '@/modules/voting';
import type { BargainingKind, BargainingStatus } from '@prisma-client/enums';

/**
 * Negociación colectiva, consulta y huelga (PRD §9.7; F5-NEG-001 a F5-NEG-003).
 *
 * **Ninguna automatización inicia un procedimiento de huelga.** Es la frase del
 * PRD §24 Fase 5 y aquí se cumple tres veces: el expediente exige la resolución
 * de asamblea que lo habilita, la base lo impone con un `CHECK` —de modo que ni
 * un error de la aplicación ni una consulta directa podrían saltárselo—, y el
 * caso de uso exige además motivo escrito de una persona con facultad. Un
 * emplazamiento a huelga cambia la vida de mucha gente; no puede salir de un
 * trabajo programado.
 *
 * **La consulta tiene su propio padrón congelado.** No es el de la última
 * asamblea ni el padrón de hoy: es el de los agremiados afectados, congelado al
 * abrir la consulta y con su huella. Sin eso, el resultado de una consulta
 * contractual no se puede sostener ante la autoridad.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

export const openBargainingFileSchema = z.object({
  kind: z.enum([
    'COLLECTIVE_AGREEMENT_NEGOTIATION',
    'CONTRACT_REVIEW',
    'WAGE_REVIEW',
    'COLLECTIVE_DISPUTE',
    'STRIKE_PROCEDURE',
  ]),
  territorialUnitId: z.uuid({ error: () => 'Elige la unidad territorial del expediente.' }),
  counterpartOrganizationId: z.uuid().nullable().default(null),
  enablingResolutionId: z.uuid().nullable().default(null),
  authorityCaseNumber: z.string().trim().max(80).nullable().default(null),
  reason: z.string().trim().min(10).max(2000),
});

export type OpenBargainingFileInput = z.infer<typeof openBargainingFileSchema>;

export async function openBargainingFile(
  actor: ActorContext,
  input: OpenBargainingFileInput,
): Promise<UseCaseResult<{ fileId: string; folio: string }>> {
  const parsed = openBargainingFileSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };

  // Abrir un expediente de huelga exige su propio permiso, distinto del de
  // administrar expedientes: no es un tipo más de la misma lista.
  const permiso = data.kind === 'STRIKE_PROCEDURE' ? 'bargaining.strike.file_open' : 'bargaining.file.manage';
  const decision = can(contexto, permiso, { kind: 'BargainingFile' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (data.kind === 'STRIKE_PROCEDURE' && data.enablingResolutionId === null) {
    return fail(
      errors.validation({
        enablingResolutionId: [
          'Un procedimiento de huelga exige el acuerdo de asamblea que lo habilita. Sin él no se abre: ni desde aquí, ni desde ningún otro sitio.',
        ],
      }),
    );
  }

  if (data.enablingResolutionId !== null) {
    const acuerdo = await db().resolution.findUnique({
      where: { id: data.enablingResolutionId },
      select: { outcome: true },
    });
    if (acuerdo === null) return fail(errors.notFound('Ese acuerdo no existe.'));
    if (acuerdo.outcome !== 'APPROVED') {
      return fail(errors.conflict('Ese acuerdo no fue aprobado.'));
    }
  }

  const unidad = await db().territorialUnit.findUnique({
    where: { id: data.territorialUnitId },
    select: { id: true, name: true, dissolvedOn: true },
  });
  if (unidad === null) return fail(errors.notFound('Esa unidad territorial no existe.'));
  if (unidad.dissolvedOn !== null) return fail(errors.conflict(`«${unidad.name}» está disuelta.`));

  const abierto = await transaction(async (tx) => {
    const anio = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`negociacion:${anio}`}))`;
    const usados = await tx.bargainingFile.count({ where: { folio: { startsWith: `NEG-${anio}-` } } });
    const folio = `NEG-${anio}-${String(usados + 1).padStart(4, '0')}`;

    const fila = await tx.bargainingFile.create({
      data: {
        folio,
        kind: data.kind,
        territorialUnitId: unidad.id,
        counterpartOrganizationId: data.counterpartOrganizationId,
        enablingResolutionId: data.enablingResolutionId,
        authorityCaseNumber: data.authorityCaseNumber,
        status: data.kind === 'STRIKE_PROCEDURE' ? 'STRIKE_PROCEDURE' : 'OPEN',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, folio: true },
    });

    await recordAudit(tx, contexto, {
      action:
        data.kind === 'STRIKE_PROCEDURE'
          ? AUDIT_ACTIONS.STRIKE_PROCEDURE_OPENED
          : AUDIT_ACTIONS.BARGAINING_FILE_OPENED,
      objectKind: 'BargainingFile',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: unidad.id,
      reason: data.reason,
      metadata: {
        folio: fila.folio,
        tipo: data.kind,
        acuerdoHabilitante: data.enablingResolutionId,
        expedienteAnteAutoridad: data.authorityCaseNumber,
      },
    });

    return fila;
  });

  return ok({ fileId: abierto.id, folio: abierto.folio });
}

export const assignBargainingCommissionSchema = z.object({
  fileId: z.uuid(),
  personId: z.uuid(),
  officeTermId: z.uuid().nullable().default(null),
});

/** Integra a una persona en la comisión negociadora del expediente. */
export async function assignBargainingCommissionMember(
  actor: ActorContext,
  input: z.infer<typeof assignBargainingCommissionSchema>,
): Promise<UseCaseResult<{ members: number }>> {
  const parsed = assignBargainingCommissionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'bargaining.file.manage', { kind: 'BargainingCommissionMember' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const expediente = await db().bargainingFile.findUnique({
    where: { id: data.fileId },
    select: { id: true, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CONCLUDED' || expediente.status === 'ARCHIVED') {
    return fail(errors.conflict('Ese expediente está cerrado.'));
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

  const yaEsta = await db().bargainingCommissionMember.findUnique({
    where: { fileId_personId: { fileId: expediente.id, personId: persona.id } },
    select: { fileId: true },
  });
  if (yaEsta !== null) return fail(errors.conflict('Esa persona ya integra la comisión negociadora.'));

  await transaction(async (tx) => {
    await tx.bargainingCommissionMember.create({
      data: { fileId: expediente.id, personId: persona.id, officeTermId: data.officeTermId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BARGAINING_COMMISSION_ASSIGNED,
      objectKind: 'BargainingCommissionMember',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      metadata: { folio: expediente.folio, persona: nombreCompleto(persona) },
    });
  });

  const members = await db().bargainingCommissionMember.count({
    where: { fileId: expediente.id, unassignedAt: null },
  });

  return ok({ members });
}

export const addProposalSchema = z.object({
  fileId: z.uuid(),
  summary: z.string().trim().min(20).max(600),
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
  text: z.string().trim().min(50).max(200_000),
});

export type AddProposalInput = z.infer<typeof addProposalSchema>;

/**
 * Añade una propuesta versionada al expediente.
 *
 * Cada propuesta emite su documento y guarda su versión. Las propuestas
 * anteriores no se sustituyen: en una negociación, lo que se ofreció antes
 * importa tanto como lo que se ofrece ahora.
 */
export async function addProposal(
  actor: ActorContext,
  input: AddProposalInput,
): Promise<UseCaseResult<{ proposalId: string; version: number; folio: string }>> {
  const parsed = addProposalSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'bargaining.file.manage', { kind: 'BargainingProposal' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienPropone = actor.userId;
  if (quienPropone === null || quienPropone === undefined) {
    return fail(errors.forbidden('Presentar una propuesta es un acto de una persona: exige una cuenta.'));
  }

  const data = parsed.data;
  const expediente = await db().bargainingFile.findUnique({
    where: { id: data.fileId },
    select: { id: true, folio: true, kind: true, status: true, territorialUnit: { select: { name: true } } },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CONCLUDED' || expediente.status === 'ARCHIVED') {
    return fail(errors.conflict('Ese expediente está cerrado.'));
  }

  const documento = await issueDocument(actor, {
    templateCode: data.templateCode,
    subjectKind: 'BARGAINING_FILE',
    subjectId: expediente.id,
    variables: {
      folio: expediente.folio,
      territorio: expediente.territorialUnit.name,
      resumen: data.summary,
      texto: data.text,
    },
  });
  if (!documento.ok) return fail(documento.error);

  const creada = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`propuesta:${expediente.id}`}))`;
    const ultima = await tx.bargainingProposal.findFirst({
      where: { fileId: expediente.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (ultima?.version ?? 0) + 1;

    const fila = await tx.bargainingProposal.create({
      data: {
        fileId: expediente.id,
        version,
        documentId: documento.data.documentId,
        submittedBy: quienPropone,
        summary: data.summary,
      },
      select: { id: true, version: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.BARGAINING_PROPOSAL_ADDED,
      objectKind: 'BargainingProposal',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: { folio: expediente.folio, version: fila.version, documento: documento.data.folio },
    });

    return fila;
  });

  return ok({ proposalId: creada.id, version: creada.version, folio: documento.data.folio });
}

export const openConsultationSchema = z.object({
  fileId: z.uuid(),
  title: z.string().trim().min(5).max(200),
  opensAt: z.string().trim().min(16).max(40),
  closesAt: z.string().trim().min(16).max(40),
  reason: z.string().trim().min(10).max(2000),
});

export type OpenConsultationInput = z.infer<typeof openConsultationSchema>;

/**
 * Abre la consulta a los agremiados afectados.
 *
 * Congela el padrón de afectados **en este acto**, no antes ni después: el
 * padrón de una consulta es el de quienes están afectados cuando se les
 * pregunta. Después programa la votación secreta sobre ese padrón, con las dos
 * opciones que una consulta contractual admite.
 */
export async function openConsultation(
  actor: ActorContext,
  input: OpenConsultationInput,
): Promise<UseCaseResult<{ voteProcessId: string; rosterEntries: number; rosterHash: string }>> {
  const parsed = openConsultationSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'bargaining.consultation.open', { kind: 'BargainingFile' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().bargainingFile.findUnique({
    where: { id: data.fileId },
    select: {
      id: true,
      folio: true,
      status: true,
      territorialUnitId: true,
      affectedRosterSnapshotId: true,
      territorialUnit: { select: { path: true } },
      consultation: { select: { id: true } },
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.consultation !== null) {
    return fail(errors.conflict('Ese expediente ya tiene una consulta abierta.'));
  }
  if (expediente.status === 'CONCLUDED' || expediente.status === 'ARCHIVED') {
    return fail(errors.conflict('Ese expediente está cerrado.'));
  }

  const version = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { version: true, rules: true },
  });
  if (version === null) return fail(errors.conflict('No hay reglas estatutarias en vigor.'));
  if (leerReglas(version.rules) === null) {
    return fail(errors.conflict(`La versión ${version.version} tiene umbrales incompletos.`));
  }

  const padron = await freezeConsultationRoster(
    contexto,
    expediente.territorialUnit.path,
    version.version,
    expediente.territorialUnitId,
  );
  if (!padron.ok) return fail(padron.error);

  const votacion = await scheduleVoteProcess(contexto, {
    context: 'COLLECTIVE_CONSULTATION',
    assemblyId: null,
    agendaItemId: null,
    electionId: null,
    bargainingFileId: expediente.id,
    title: data.title,
    method: 'SECRET',
    options: [
      { code: 'A_FAVOR', label: 'A favor' },
      { code: 'EN_CONTRA', label: 'En contra' },
    ],
    rosterSnapshotId: padron.data.rosterId,
    opensAt: data.opensAt,
    closesAt: data.closesAt,
  });
  if (!votacion.ok) return fail(votacion.error);

  await transaction(async (tx) => {
    await tx.bargainingFile.update({
      where: { id: expediente.id },
      data: {
        affectedRosterSnapshotId: padron.data.rosterId,
        status: 'CONSULTATION',
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.BARGAINING_CONSULTATION_OPENED,
      objectKind: 'BargainingFile',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      territorialUnitId: expediente.territorialUnitId,
      reason: data.reason,
      metadata: {
        folio: expediente.folio,
        afectados: padron.data.entryCount,
        huellaDelPadron: padron.data.hash,
        votacion: votacion.data.publicId,
      },
    });
  });

  return ok({
    voteProcessId: votacion.data.voteProcessId,
    rosterEntries: padron.data.entryCount,
    rosterHash: padron.data.hash,
  });
}

export const advanceBargainingSchema = z.object({
  fileId: z.uuid(),
  to: z.enum(['OPEN', 'NEGOTIATION', 'CONSULTATION', 'CONCILIATION', 'STRIKE_PROCEDURE', 'CONCLUDED', 'ARCHIVED']),
  reason: z.string().trim().min(10).max(2000),
});

/**
 * Cambia el estado del expediente.
 *
 * Pasar a `STRIKE_PROCEDURE` exige el acuerdo habilitante y el permiso de
 * huelga, igual que abrirlo así desde el principio. Un expediente ordinario que
 * escala a huelga es exactamente el mismo acto institucional, y no puede
 * exigir menos.
 */
export async function advanceBargainingFile(
  actor: ActorContext,
  input: z.infer<typeof advanceBargainingSchema>,
): Promise<UseCaseResult<{ status: BargainingStatus }>> {
  const parsed = advanceBargainingSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const data = parsed.data;
  const contexto = { ...actor, reason: data.reason };
  const permiso = data.to === 'STRIKE_PROCEDURE' ? 'bargaining.strike.file_open' : 'bargaining.file.manage';
  const decision = can(contexto, permiso, { kind: 'BargainingFile' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const expediente = await db().bargainingFile.findUnique({
    where: { id: data.fileId },
    select: {
      id: true,
      folio: true,
      status: true,
      kind: true,
      enablingResolutionId: true,
      territorialUnitId: true,
    },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'ARCHIVED') return fail(errors.conflict('Ese expediente está archivado.'));

  if (data.to === 'STRIKE_PROCEDURE' && expediente.enablingResolutionId === null) {
    return fail(
      errors.conflict(
        'Escalar a procedimiento de huelga exige el acuerdo de asamblea que lo habilita. Regístralo en el expediente antes.',
      ),
    );
  }

  await transaction(async (tx) => {
    await tx.bargainingFile.update({
      where: { id: expediente.id },
      data: {
        status: data.to,
        ...(data.to === 'STRIKE_PROCEDURE' ? { kind: 'STRIKE_PROCEDURE' } : {}),
        ...(data.to === 'CONCLUDED' || data.to === 'ARCHIVED' ? { closedAt: new Date() } : {}),
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, contexto, {
      action:
        data.to === 'STRIKE_PROCEDURE'
          ? AUDIT_ACTIONS.STRIKE_PROCEDURE_OPENED
          : AUDIT_ACTIONS.BARGAINING_FILE_ADVANCED,
      objectKind: 'BargainingFile',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      territorialUnitId: expediente.territorialUnitId,
      reason: data.reason,
      metadata: { folio: expediente.folio, de: expediente.status, a: data.to },
    });
  });

  return ok({ status: data.to });
}

export interface BargainingFileRow {
  readonly id: string;
  readonly folio: string;
  readonly kind: BargainingKind;
  readonly status: BargainingStatus;
  readonly territory: string;
  readonly counterpart: string | null;
  readonly authorityCaseNumber: string | null;
  readonly hasEnablingResolution: boolean;
  readonly commissionMembers: readonly string[];
  readonly proposalCount: number;
  readonly consultation: {
    readonly id: string;
    readonly publicId: string;
    readonly status: string;
    readonly title: string;
  } | null;
  readonly affectedRosterEntries: number | null;
  readonly affectedRosterHash: string | null;
  readonly closedAt: Date | null;
}

export async function bargainingFileList(
  actor: ActorContext,
): Promise<UseCaseResult<readonly BargainingFileRow[]>> {
  const decision = can({ ...actor, reason: 'consulta de expedientes de negociación' }, 'bargaining.file.read', {
    kind: 'BargainingFile',
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().bargainingFile.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      folio: true,
      kind: true,
      status: true,
      authorityCaseNumber: true,
      enablingResolutionId: true,
      closedAt: true,
      territorialUnit: { select: { name: true } },
      counterpartOrganization: { select: { legalName: true } },
      affectedRosterSnapshot: { select: { entryCount: true, hash: true } },
      consultation: { select: { id: true, publicId: true, status: true, title: true } },
      commissionMembers: {
        where: { unassignedAt: null },
        select: {
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      _count: { select: { proposals: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      folio: fila.folio,
      kind: fila.kind,
      status: fila.status,
      territory: fila.territorialUnit.name,
      counterpart: fila.counterpartOrganization?.legalName ?? null,
      authorityCaseNumber: fila.authorityCaseNumber,
      hasEnablingResolution: fila.enablingResolutionId !== null,
      commissionMembers: fila.commissionMembers.map((integrante) => nombreCompleto(integrante.person)),
      proposalCount: fila._count.proposals,
      consultation: fila.consultation,
      affectedRosterEntries: fila.affectedRosterSnapshot?.entryCount ?? null,
      affectedRosterHash: fila.affectedRosterSnapshot?.hash ?? null,
      closedAt: fila.closedAt,
    })),
  );
}

export interface ProposalRow {
  readonly id: string;
  readonly version: number;
  readonly summary: string;
  readonly submittedAt: Date;
  readonly submittedBy: string;
  readonly documentPublicId: string;
  readonly documentFolio: string | null;
}

export async function proposalList(
  actor: ActorContext,
  fileId: string,
): Promise<UseCaseResult<readonly ProposalRow[]>> {
  const decision = can({ ...actor, reason: 'consulta de propuestas' }, 'bargaining.file.read', {
    kind: 'BargainingProposal',
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().bargainingProposal.findMany({
    where: { fileId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      summary: true,
      submittedAt: true,
      document: { select: { publicId: true, folio: true } },
      submittedByUser: {
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
      version: fila.version,
      summary: fila.summary,
      submittedAt: fila.submittedAt,
      submittedBy: nombreCompleto(fila.submittedByUser.person),
      documentPublicId: fila.document.publicId,
      documentFolio: fila.document.folio,
    })),
  );
}
