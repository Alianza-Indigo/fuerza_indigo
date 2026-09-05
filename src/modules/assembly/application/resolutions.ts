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
import { alcanzaMayoria, leerReglas, type MajorityRule } from '@/modules/governance';
import { issueDocument } from '@/modules/documents';
import { uploadFile } from '@/platform/files';
import type {
  FollowUpStatus,
  PublicationLevel,
  RequiredMajority,
  ResolutionOutcome,
} from '@prisma-client/enums';

/**
 * Resoluciones, actas y seguimiento de acuerdos (PRD §9.4; F5-ASA-006, F5-ASA-007).
 *
 * **El resultado no se escribe: se lee del escrutinio.** Asentar una resolución
 * exige el proceso de votación escrutado del punto, y de él salen los votos.
 * Dejar que quien redacta el acta teclee «aprobado» convertiría el acta en la
 * opinión de quien la redacta.
 *
 * **La mayoría exigida la fija el punto, no quien asienta.** Un punto de reforma
 * estatutaria nace con mayoría calificada, y el asiento comprueba que se
 * alcanzó. Si no se alcanzó, la resolución se asienta igualmente, pero como
 * rechazada: lo que no se puede es declarar aprobado lo que no llegó.
 *
 * **El acta se publica con nivel.** Reservada, para agremiados o pública en
 * versión pertinente. Publicar por omisión el texto íntegro de una sesión donde
 * se trató un caso disciplinario expondría a personas que no eligieron estar
 * ahí.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Traducción de la mayoría del punto a la regla de la versión normativa. */
function reglaDeMayoria(
  exigida: RequiredMajority,
  reglas: { statuteAmendmentMajority: MajorityRule; dissolutionMajority: MajorityRule; ordinaryMajority: MajorityRule },
  esDisolucion: boolean,
): MajorityRule {
  if (exigida === 'SIMPLE') return reglas.ordinaryMajority;
  if (exigida === 'QUALIFIED_TWO_THIRDS') return reglas.statuteAmendmentMajority;
  return esDisolucion ? reglas.dissolutionMajority : reglas.statuteAmendmentMajority;
}

export const recordResolutionSchema = z.object({
  agendaItemId: z.uuid(),
  voteProcessId: z.uuid().nullable().default(null),
  text: z.string().trim().min(20).max(50_000),
  effectiveFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  publicationLevel: z.enum(['RESERVED', 'MEMBERS_ONLY', 'PUBLIC_REDACTED']),
  followUpOwnerId: z.uuid().nullable().default(null),
  followUpDueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export type RecordResolutionInput = z.infer<typeof recordResolutionSchema>;

export interface RecordedResolution {
  readonly resolutionId: string;
  readonly number: string;
  readonly outcome: ResolutionOutcome;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly requiredMajority: MajorityRule;
}

export async function recordResolution(
  actor: ActorContext,
  input: RecordResolutionInput,
): Promise<UseCaseResult<RecordedResolution>> {
  const parsed = recordResolutionSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.resolution.record', { kind: 'Resolution' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;

  const punto = await db().agendaItem.findUnique({
    where: { id: data.agendaItemId },
    select: {
      id: true,
      title: true,
      kind: true,
      requiredMajority: true,
      status: true,
      assembly: {
        select: {
          id: true,
          publicId: true,
          status: true,
          quorumDeclaredAt: true,
          scheduledAt: true,
          territorialUnitId: true,
          unionBody: { select: { id: true, code: true, name: true } },
          normativeRuleSet: { select: { version: true, rules: true } },
        },
      },
    },
  });
  if (punto === null) return fail(errors.notFound('Ese punto del orden del día no existe.'));
  if (punto.status === 'VOTED') return fail(errors.conflict('Ese punto ya tiene resolución asentada.'));
  if (punto.assembly.quorumDeclaredAt === null) {
    return fail(
      errors.conflict('La sesión no está instalada. Sin quórum declarado no hay asamblea que resuelva nada.'),
    );
  }
  if (punto.assembly.status !== 'IN_SESSION') {
    return fail(errors.conflict('La sesión no está abierta.'));
  }

  const reglas = leerReglas(punto.assembly.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(errors.conflict('La versión normativa de la sesión tiene umbrales incompletos.'));
  }

  const necesitaVotacion =
    punto.kind !== 'INFORMATIVE' && punto.kind !== 'FINANCIAL_REPORT';

  let outcome: ResolutionOutcome = 'APPROVED';
  let votesFor = 0;
  let votesAgainst = 0;
  const requiredMajority = reglaDeMayoria(punto.requiredMajority, reglas, punto.kind === 'DISSOLUTION');

  if (necesitaVotacion) {
    if (data.voteProcessId === null) {
      return fail(
        errors.validation({
          voteProcessId: [
            'Un punto deliberativo, electivo, de reforma o de disolución se resuelve con una votación escrutada. Escruta primero y vuelve.',
          ],
        }),
      );
    }

    const proceso = await db().voteProcess.findUnique({
      where: { id: data.voteProcessId },
      select: { id: true, status: true, agendaItemId: true, results: true, resolution: { select: { id: true } } },
    });
    if (proceso === null) return fail(errors.notFound('Ese proceso de votación no existe.'));
    if (proceso.agendaItemId !== punto.id) {
      return fail(errors.conflict('Esa votación no corresponde a este punto del orden del día.'));
    }
    if (proceso.resolution !== null) {
      return fail(errors.conflict('Esa votación ya respalda otra resolución.'));
    }
    if (proceso.status !== 'TALLIED' && proceso.status !== 'CERTIFIED') {
      return fail(errors.conflict('Esa votación todavía no está escrutada.'));
    }

    const bruto = proceso.results;
    const opciones =
      typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto) && Array.isArray((bruto as Record<string, unknown>)['byOption'])
        ? ((bruto as Record<string, unknown>)['byOption'] as unknown[])
        : [];
    const emitidas =
      typeof bruto === 'object' && bruto !== null && !Array.isArray(bruto)
        ? Number((bruto as Record<string, unknown>)['totalBallots'] ?? 0)
        : 0;

    for (const opcion of opciones) {
      if (typeof opcion !== 'object' || opcion === null) continue;
      const fila = opcion as Record<string, unknown>;
      const codigo = typeof fila['code'] === 'string' ? fila['code'] : '';
      const votos = typeof fila['votes'] === 'number' ? fila['votes'] : 0;
      if (codigo === 'A_FAVOR' || codigo === 'FOR' || codigo === 'SI') votesFor += votos;
      if (codigo === 'EN_CONTRA' || codigo === 'AGAINST' || codigo === 'NO') votesAgainst += votos;
    }

    outcome = alcanzaMayoria(requiredMajority, votesFor, votesAgainst, emitidas) ? 'APPROVED' : 'REJECTED';
  }

  const publicId = newPublicId();
  const anio = punto.assembly.scheduledAt.getUTCFullYear();

  const asentada = await transaction(async (tx) => {
    // Serie de resoluciones por órgano y año, bajo cerrojo: dos asientos del
    // mismo segundo no pueden reclamar el mismo número.
    const serie = `${punto.assembly.unionBody.code}-${anio}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`resolucion:${serie}`}))`;
    const usados = await tx.resolution.count({ where: { number: { startsWith: `${serie}-` } } });
    const number = `${serie}-${String(usados + 1).padStart(4, '0')}`;

    const fila = await tx.resolution.create({
      data: {
        publicId,
        assemblyId: punto.assembly.id,
        agendaItemId: punto.id,
        number,
        text: data.text,
        outcome,
        voteProcessId: data.voteProcessId,
        effectiveFrom: data.effectiveFrom === null ? null : new Date(`${data.effectiveFrom}T00:00:00.000Z`),
        followUpOwnerId: data.followUpOwnerId,
        followUpDueAt: data.followUpDueOn === null ? null : new Date(`${data.followUpDueOn}T23:59:59.999Z`),
        followUpStatus: data.followUpOwnerId === null ? 'NOT_REQUIRED' : 'PENDING',
        publicationLevel: data.publicationLevel,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, number: true },
    });

    await tx.agendaItem.update({
      where: { id: punto.id },
      data: { status: 'VOTED', updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.RESOLUTION_RECORDED,
      objectKind: 'Resolution',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: punto.assembly.territorialUnitId,
      metadata: {
        asamblea: punto.assembly.publicId,
        punto: punto.title,
        numero: fila.number,
        resultado: outcome,
        aFavor: votesFor,
        enContra: votesAgainst,
        mayoriaExigida: requiredMajority,
        publicacion: data.publicationLevel,
      },
    });

    return fila;
  });

  return ok({
    resolutionId: asentada.id,
    number: asentada.number ?? '',
    outcome,
    votesFor,
    votesAgainst,
    requiredMajority,
  });
}

export const publishMinutesSchema = z.object({
  assemblyId: z.uuid(),
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
  publicationLevel: z.enum(['RESERVED', 'MEMBERS_ONLY', 'PUBLIC_REDACTED']),
  narrative: z.string().trim().min(50).max(200_000),
});

export type PublishMinutesInput = z.infer<typeof publishMinutesSchema>;

/**
 * Cierra la sesión y publica su acta.
 *
 * El acta se compone del relato de la sesión, del cálculo de quórum tal como se
 * declaró, de la lista de asistencia y de las resoluciones con su resultado. No
 * se puede publicar con puntos pendientes: un acta que deja puntos sin resolver
 * ni diferir describe una sesión que no terminó.
 */
export async function publishMinutes(
  actor: ActorContext,
  input: PublishMinutesInput,
): Promise<UseCaseResult<{ folio: string; resolutions: number }>> {
  const parsed = publishMinutesSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.minutes.publish', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const asamblea = await db().assembly.findUnique({
    where: { id: data.assemblyId },
    select: {
      id: true,
      publicId: true,
      status: true,
      scheduledAt: true,
      venue: true,
      quorumDeclaredAt: true,
      quorumBase: true,
      quorumPresent: true,
      territorialUnitId: true,
      minutesDocumentId: true,
      unionBody: { select: { name: true, legalEntity: { select: { legalName: true } } } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      callUsed: { select: { ordinal: true, quorumRule: true } },
      quorumDeclaredBy: {
        select: {
          person: {
            select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true, preferredName: true },
          },
        },
      },
      agendaItems: { orderBy: { position: 'asc' }, select: { position: true, title: true, status: true } },
      resolutions: { orderBy: { number: 'asc' }, select: { number: true, text: true, outcome: true } },
      rosterSnapshot: { select: { hash: true, entryCount: true } },
      _count: { select: { attendances: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.minutesDocumentId !== null) {
    return fail(errors.conflict('Esta asamblea ya tiene acta publicada.'));
  }
  if (asamblea.quorumDeclaredAt === null) {
    return fail(errors.conflict('La sesión nunca se instaló. No hay acta que levantar.'));
  }
  if (asamblea.status !== 'IN_SESSION') {
    return fail(errors.conflict('La sesión no está abierta.'));
  }

  const pendientes = asamblea.agendaItems.filter(
    (punto) => punto.status === 'PENDING' || punto.status === 'IN_DISCUSSION',
  );
  if (pendientes.length > 0) {
    return fail(
      errors.conflict(
        `Quedan puntos sin resolver: ${pendientes.map((punto) => `${punto.position}. ${punto.title}`).join('; ')}. Resuélvelos o difiérelos antes de cerrar.`,
      ),
    );
  }

  const documento = await issueDocument(actor, {
    templateCode: data.templateCode,
    subjectKind: 'ASSEMBLY',
    subjectId: asamblea.id,
    variables: {
      entidad: asamblea.unionBody.legalEntity.legalName,
      organo: asamblea.unionBody.name,
      territorio: asamblea.territorialUnit.name,
      fechaDeSesion: asamblea.scheduledAt.toISOString(),
      lugar: asamblea.venue ?? 'Sesión a distancia',
      convocatoria: asamblea.callUsed?.ordinal === 'SECOND' ? 'segunda' : 'primera',
      reglaDeQuorum:
        asamblea.callUsed?.quorumRule === 'THOSE_PRESENT'
          ? 'los agremiados presentes'
          : 'la mitad más uno del padrón aplicable',
      padronBase: String(asamblea.quorumBase ?? asamblea.rosterSnapshot?.entryCount ?? 0),
      presentes: String(asamblea.quorumPresent ?? asamblea._count.attendances),
      huellaDelPadron: asamblea.rosterSnapshot?.hash ?? '',
      quorumDeclaradoPor:
        asamblea.quorumDeclaredBy === null ? '' : nombreCompleto(asamblea.quorumDeclaredBy.person),
      ordenDelDia: asamblea.agendaItems.map((punto) => `${punto.position}. ${punto.title}`).join('\n'),
      relato: data.narrative,
      resoluciones: asamblea.resolutions
        .map((resolucion) => `${resolucion.number ?? ''} (${resolucion.outcome}): ${resolucion.text}`)
        .join('\n\n'),
      versionNormativa: asamblea.normativeRuleSet.version,
    },
  });
  if (!documento.ok) return fail(documento.error);

  await transaction(async (tx) => {
    await tx.assembly.update({
      where: { id: asamblea.id },
      data: {
        status: 'PUBLISHED',
        closedAt: new Date(),
        minutesDocumentId: documento.data.documentId,
        publicationLevel: data.publicationLevel,
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ASSEMBLY_CLOSED,
      objectKind: 'Assembly',
      objectId: asamblea.id,
      outcome: 'SUCCESS',
      territorialUnitId: asamblea.territorialUnitId,
      metadata: { asamblea: asamblea.publicId, resoluciones: asamblea.resolutions.length },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.MINUTES_PUBLISHED,
      objectKind: 'Assembly',
      objectId: asamblea.id,
      outcome: 'SUCCESS',
      territorialUnitId: asamblea.territorialUnitId,
      metadata: { asamblea: asamblea.publicId, folio: documento.data.folio, publicacion: data.publicationLevel },
    });
  });

  return ok({ folio: documento.data.folio, resolutions: asamblea.resolutions.length });
}

export const updateFollowUpSchema = z.object({
  resolutionId: z.uuid(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']),
  note: z.string().trim().min(10).max(2000),
});

export interface FollowUpEvidence {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface UpdateFollowUpInput extends z.infer<typeof updateFollowUpSchema> {
  /**
   * Documento que acredita el cumplimiento. Se **sube aquí**, en el mismo acto:
   * pedir que se hubiera subido antes y elegirlo de una lista obligaba a pasar
   * por otra pantalla, y quien lleva el seguimiento de un acuerdo tiene el
   * documento delante, no en un acervo.
   */
  readonly evidence?: FollowUpEvidence | null;
}

/**
 * Actualiza el seguimiento de un acuerdo (F5-ASA-007).
 *
 * Dar por cumplido un acuerdo exige evidencia. Sin ella, «cumplido» es una
 * afirmación de quien lleva el seguimiento sobre su propio trabajo, y el
 * seguimiento de acuerdos deja de servir para lo único que sirve: saber qué
 * acordó la asamblea y qué se hizo con ello.
 */
export async function updateFollowUp(
  actor: ActorContext,
  input: UpdateFollowUpInput,
): Promise<UseCaseResult<{ status: FollowUpStatus }>> {
  const parsed = updateFollowUpSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.followup.manage', { kind: 'Resolution' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const evidencia = input.evidence ?? null;

  const resolucion = await db().resolution.findUnique({
    where: { id: data.resolutionId },
    select: {
      id: true,
      number: true,
      followUpStatus: true,
      followUpOwnerId: true,
      outcome: true,
      assembly: { select: { unionBody: { select: { legalEntityId: true } } } },
    },
  });
  if (resolucion === null) return fail(errors.notFound('Esa resolución no existe.'));
  if (resolucion.outcome !== 'APPROVED') {
    return fail(errors.conflict('Solo se da seguimiento a lo que la asamblea aprobó.'));
  }
  if (resolucion.followUpOwnerId === null) {
    return fail(errors.conflict('Esa resolución no tiene responsable de seguimiento asignado.'));
  }
  if (data.status === 'COMPLETED' && evidencia === null) {
    return fail(
      errors.validation({
        evidence: ['Dar por cumplido un acuerdo exige evidencia. Adjunta el documento que lo acredita.'],
      }),
    );
  }

  let evidenciaId: string | null = null;
  if (evidencia !== null) {
    const guardado = await uploadFile(actor, {
      legalEntityId: resolucion.assembly.unionBody.legalEntityId,
      classification: 'INTERNAL',
      contextKind: 'GOVERNANCE',
      contextId: resolucion.id,
      originalFileName: evidencia.fileName,
      mimeType: evidencia.mimeType,
      content: evidencia.content,
    });
    if (!guardado.ok) return fail(guardado.error);
    evidenciaId = guardado.data.fileObjectId;
  }

  await transaction(async (tx) => {
    await tx.resolution.update({
      where: { id: resolucion.id },
      data: { followUpStatus: data.status, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, { ...actor, reason: data.note }, {
      action: AUDIT_ACTIONS.RESOLUTION_FOLLOW_UP_UPDATED,
      objectKind: 'Resolution',
      objectId: resolucion.id,
      outcome: 'SUCCESS',
      reason: data.note,
      metadata: {
        numero: resolucion.number,
        de: resolucion.followUpStatus,
        a: data.status,
        evidencia: evidenciaId,
      },
    });
  });

  return ok({ status: data.status });
}

export interface ResolutionRow {
  readonly id: string;
  readonly publicId: string;
  readonly number: string | null;
  readonly text: string;
  readonly outcome: ResolutionOutcome;
  readonly effectiveFrom: Date | null;
  readonly publicationLevel: PublicationLevel;
  readonly followUpStatus: FollowUpStatus;
  readonly followUpDueAt: Date | null;
  readonly followUpOwner: string | null;
  readonly agendaItemTitle: string | null;
  readonly assemblyPublicId: string;
  readonly assemblyScheduledAt: Date;
}

export async function resolutionList(
  actor: ActorContext,
  filters: { readonly assemblyId?: string; readonly pendingFollowUp?: boolean } = {},
): Promise<UseCaseResult<readonly ResolutionRow[]>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Resolution' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().resolution.findMany({
    where: {
      ...(filters.assemblyId === undefined ? {} : { assemblyId: filters.assemblyId }),
      ...(filters.pendingFollowUp === true ? { followUpStatus: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      publicId: true,
      number: true,
      text: true,
      outcome: true,
      effectiveFrom: true,
      publicationLevel: true,
      followUpStatus: true,
      followUpDueAt: true,
      agendaItem: { select: { title: true } },
      assembly: { select: { publicId: true, scheduledAt: true } },
      followUpOwner: {
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
      publicId: fila.publicId,
      number: fila.number,
      text: fila.text,
      outcome: fila.outcome,
      effectiveFrom: fila.effectiveFrom,
      publicationLevel: fila.publicationLevel,
      followUpStatus: fila.followUpStatus,
      followUpDueAt: fila.followUpDueAt,
      followUpOwner: fila.followUpOwner === null ? null : nombreCompleto(fila.followUpOwner.person),
      agendaItemTitle: fila.agendaItem?.title ?? null,
      assemblyPublicId: fila.assembly.publicId,
      assemblyScheduledAt: fila.assembly.scheduledAt,
    })),
  );
}
