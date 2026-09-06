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
import { leerReglas } from '@/modules/governance/domain';
import { issueDocument } from '@/modules/documents';
import { uploadFile } from '@/platform/files';
import type {
  AgendaItemKind,
  AgendaItemStatus,
  AssemblyModality,
  AssemblyStatus,
  AssemblyType,
  CallOrdinal,
  RequiredMajority,
} from '@prisma-client/enums';

/**
 * Convocatoria, orden del día y sesión de asamblea (PRD §9.4; F5-ASA-001, F5-ASA-002).
 *
 * **La anticipación no se pide: se comprueba.** La versión normativa en vigor
 * al convocar fija cuántos días de antelación exige el estatuto, y la
 * convocatoria se rechaza si no los cumple. Es la diferencia entre un sistema
 * que registra convocatorias y uno que garantiza que fueron válidas: una
 * asamblea convocada con menos días de los debidos es impugnable, y el momento
 * de descubrirlo no puede ser el día de la sesión.
 *
 * **La asamblea guarda la versión con la que se convocó.** Una reforma
 * posterior no cambia el quórum de una asamblea ya convocada. Guardar el
 * identificador de la versión —que es inmutable— y no una copia de sus números
 * hace que el dato no pueda desmentirse.
 *
 * **Primera y segunda convocatoria son documentos distintos.** No es un estado
 * de la misma: cada una tiene su fecha de emisión, su anticipación y su regla
 * de quórum, y el acta dice con cuál se instaló la sesión.
 */

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

const DIA_EN_MS = 24 * 60 * 60 * 1000;

export const conveneAssemblySchema = z.object({
  unionBodyId: z.uuid({ error: () => 'Elige el órgano que sesiona.' }),
  territorialUnitId: z.uuid({ error: () => 'Elige la unidad territorial de la sesión.' }),
  type: z.enum(['ORDINARY', 'EXTRAORDINARY', 'SECTIONAL']),
  modality: z.enum(['IN_PERSON', 'REMOTE', 'HYBRID']),
  venue: z.string().trim().max(400).nullable().default(null),
  /** Instante local de la sesión, en formato `2026-03-01T17:00`. */
  scheduledAt: z.string().trim().min(16).max(40),
  convenedByOfficeTermId: z.uuid().nullable().default(null),
  convenedByPetition: z.boolean().default(false),
});

export type ConveneAssemblyInput = z.infer<typeof conveneAssemblySchema>;

export async function conveneAssembly(
  actor: ActorContext,
  input: ConveneAssemblyInput,
): Promise<UseCaseResult<{ assemblyId: string; publicId: string }>> {
  const parsed = conveneAssemblySchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.assembly.convene', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const cuando = new Date(data.scheduledAt.length <= 16 ? `${data.scheduledAt}:00Z` : data.scheduledAt);
  if (Number.isNaN(cuando.getTime())) {
    return fail(errors.validation({ scheduledAt: ['La fecha y hora no son válidas.'] }));
  }
  if (cuando.getTime() <= Date.now()) {
    return fail(errors.validation({ scheduledAt: ['Una asamblea se convoca para el futuro, no para ayer.'] }));
  }

  if (data.modality !== 'REMOTE' && (data.venue === null || data.venue.trim() === '')) {
    return fail(
      errors.validation({
        venue: ['Una sesión presencial o mixta necesita lugar. Sin él, la convocatoria no dice dónde presentarse.'],
      }),
    );
  }

  const version = await db().normativeRuleSet.findFirst({
    where: { status: 'IN_FORCE' },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, version: true, rules: true },
  });
  if (version === null) {
    return fail(
      errors.conflict('No hay reglas estatutarias en vigor. Una asamblea se convoca conforme a un estatuto vigente.'),
    );
  }
  const reglas = leerReglas(version.rules);
  if (reglas === null) {
    return fail(
      errors.conflict(
        `La versión ${version.version} está en vigor pero le faltan umbrales. No se puede convocar con reglas incompletas.`,
      ),
    );
  }

  const organo = await db().unionBody.findUnique({
    where: { id: data.unionBodyId },
    select: { id: true, status: true, name: true },
  });
  if (organo === null) return fail(errors.notFound('Ese órgano no existe.'));
  if (organo.status !== 'ACTIVE') return fail(errors.conflict(`«${organo.name}» no está activo.`));

  const unidad = await db().territorialUnit.findUnique({
    where: { id: data.territorialUnitId },
    select: { id: true, dissolvedOn: true, name: true },
  });
  if (unidad === null) return fail(errors.notFound('Esa unidad territorial no existe.'));
  if (unidad.dissolvedOn !== null) return fail(errors.conflict(`«${unidad.name}» está disuelta.`));

  if (data.convenedByOfficeTermId !== null) {
    const cargo = await db().officeTerm.findUnique({
      where: { id: data.convenedByOfficeTermId },
      select: { endsOn: true, endedEarlyOn: true, officeDefinition: { select: { name: true } } },
    });
    if (cargo === null) return fail(errors.notFound('Ese periodo de cargo no existe.'));
    if (cargo.endedEarlyOn !== null || cargo.endsOn < new Date()) {
      return fail(errors.conflict(`El periodo de «${cargo.officeDefinition.name}» no está vigente. Un cargo vencido no convoca.`));
    }
  } else if (!data.convenedByPetition) {
    return fail(
      errors.validation({
        convenedByOfficeTermId: [
          'Una asamblea la convoca un cargo en funciones o la petición del porcentaje estatutario de agremiados. Sin ninguna de las dos, no hay quién convoque.',
        ],
      }),
    );
  }

  const publicId = newPublicId();
  const creada = await transaction(async (tx) => {
    const fila = await tx.assembly.create({
      data: {
        publicId,
        unionBodyId: organo.id,
        territorialUnitId: unidad.id,
        type: data.type,
        modality: data.modality,
        venue: data.venue,
        scheduledAt: cuando,
        status: 'PLANNED',
        normativeRuleSetId: version.id,
        convenedByOfficeTermId: data.convenedByOfficeTermId,
        convenedByPetition: data.convenedByPetition,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ASSEMBLY_CONVENED,
      objectKind: 'Assembly',
      objectId: fila.id,
      outcome: 'SUCCESS',
      territorialUnitId: unidad.id,
      metadata: {
        organo: organo.name,
        tipo: data.type,
        cuando: cuando.toISOString(),
        version: version.version,
        porPeticion: data.convenedByPetition,
      },
    });

    return fila;
  });

  return ok({ assemblyId: creada.id, publicId });
}

export const issueCallSchema = z.object({
  assemblyId: z.uuid(),
  ordinal: z.enum(['FIRST', 'SECOND']),
  /** Canales por los que se publica. Al menos uno: publicar en ninguno no es publicar. */
  publishedChannels: z.array(z.string().trim().min(2).max(60)).min(1, {
    error: () => 'Di por dónde se publica la convocatoria. Al menos un canal.',
  }),
  templateCode: z.string().trim().toUpperCase().min(3).max(60),
});

export type IssueCallInput = z.infer<typeof issueCallSchema>;

const NOMBRE_DE_TIPO: Readonly<Record<AssemblyType, string>> = {
  ORDINARY: 'ordinaria',
  EXTRAORDINARY: 'extraordinaria',
  SECTIONAL: 'seccional',
};

const NOMBRE_DE_MODALIDAD: Readonly<Record<AssemblyModality, string>> = {
  IN_PERSON: 'presencial',
  REMOTE: 'a distancia',
  HYBRID: 'mixta',
};

/**
 * Emite una convocatoria y su documento.
 *
 * La segunda convocatoria solo se emite si ya se emitió la primera: no es una
 * alternativa a convocar, es lo que ocurre cuando la primera no reúne quórum, y
 * emitirla sola dejaría a la asamblea instalándose con «los presentes» sin haber
 * intentado antes la mitad más uno.
 */
export async function issueCall(
  actor: ActorContext,
  input: IssueCallInput,
): Promise<UseCaseResult<{ callId: string; noticeDays: number; folio: string }>> {
  const parsed = issueCallSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.assembly.convene', { kind: 'AssemblyCall' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const asamblea = await db().assembly.findUnique({
    where: { id: data.assemblyId },
    select: {
      id: true,
      publicId: true,
      type: true,
      modality: true,
      venue: true,
      scheduledAt: true,
      status: true,
      normativeRuleSet: { select: { version: true, rules: true } },
      unionBody: { select: { name: true, legalEntity: { select: { legalName: true } } } },
      territorialUnit: { select: { name: true } },
      calls: { select: { ordinal: true } },
      agendaItems: { orderBy: { position: 'asc' }, select: { position: true, title: true } },
    },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.status === 'CANCELLED') return fail(errors.conflict('Esa asamblea está cancelada.'));
  if (asamblea.status === 'CLOSED' || asamblea.status === 'PUBLISHED') {
    return fail(errors.conflict('Esa asamblea ya se celebró.'));
  }

  const reglas = leerReglas(asamblea.normativeRuleSet.rules);
  if (reglas === null) {
    return fail(
      errors.conflict(
        `La versión ${asamblea.normativeRuleSet.version} con la que se convocó tiene umbrales incompletos.`,
      ),
    );
  }

  const yaEmitidas = new Set(asamblea.calls.map((call) => call.ordinal));
  if (yaEmitidas.has(data.ordinal)) {
    return fail(errors.conflict('Esa convocatoria ya se emitió.'));
  }
  if (data.ordinal === 'SECOND' && !yaEmitidas.has('FIRST')) {
    return fail(
      errors.conflict(
        'No se emite la segunda convocatoria sin la primera: la segunda existe porque la primera no reunió quórum.',
      ),
    );
  }

  if (asamblea.agendaItems.length === 0) {
    return fail(
      errors.conflict(
        'La convocatoria lleva el orden del día. Añade al menos un punto antes de convocar: convocar sin decir a qué es convocar a nada.',
      ),
    );
  }

  const noticeDays =
    asamblea.type === 'EXTRAORDINARY' ? reglas.assemblyNoticeDaysExtraordinary : reglas.assemblyNoticeDaysOrdinary;
  const emitidaEl = new Date();
  const diasDeAnticipacion = (asamblea.scheduledAt.getTime() - emitidaEl.getTime()) / DIA_EN_MS;

  if (diasDeAnticipacion < noticeDays) {
    return fail(
      errors.conflict(
        `El estatuto exige ${noticeDays} día(s) de anticipación para una asamblea ${NOMBRE_DE_TIPO[asamblea.type]} y faltan ${Math.floor(diasDeAnticipacion)}. Una asamblea convocada fuera de plazo es impugnable.`,
      ),
    );
  }

  const quorumRule = data.ordinal === 'FIRST' ? reglas.firstCallQuorum : reglas.secondCallQuorum;

  const ordenDelDia = asamblea.agendaItems
    .map((punto) => `${punto.position}. ${punto.title}`)
    .join('\n');

  const documento = await issueDocument(actor, {
    templateCode: data.templateCode,
    subjectKind: 'ASSEMBLY_CALL',
    subjectId: asamblea.id,
    variables: {
      entidad: asamblea.unionBody.legalEntity.legalName,
      organo: asamblea.unionBody.name,
      territorio: asamblea.territorialUnit.name,
      tipoDeAsamblea: NOMBRE_DE_TIPO[asamblea.type],
      convocatoria: data.ordinal === 'FIRST' ? 'primera' : 'segunda',
      fechaDeSesion: asamblea.scheduledAt.toISOString(),
      modalidad: NOMBRE_DE_MODALIDAD[asamblea.modality],
      lugar: asamblea.venue ?? 'Sesión a distancia',
      ordenDelDia,
      quorum:
        quorumRule === 'HALF_PLUS_ONE'
          ? 'la mitad más uno del padrón aplicable'
          : 'los agremiados presentes',
      anticipacion: String(noticeDays),
      versionNormativa: asamblea.normativeRuleSet.version,
    },
  });
  if (!documento.ok) return fail(documento.error);

  const emitida = await transaction(async (tx) => {
    const fila = await tx.assemblyCall.create({
      data: {
        assemblyId: asamblea.id,
        ordinal: data.ordinal,
        issuedAt: emitidaEl,
        validFrom: emitidaEl,
        noticeDays,
        quorumRule,
        publishedChannels: data.publishedChannels,
        documentId: documento.data.documentId,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.assembly.update({
      where: { id: asamblea.id },
      data: {
        status: data.ordinal === 'FIRST' ? 'CALLED' : 'SECOND_CALL',
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: data.ordinal === 'FIRST' ? AUDIT_ACTIONS.ASSEMBLY_CONVENED : AUDIT_ACTIONS.ASSEMBLY_SECOND_CALL,
      objectKind: 'AssemblyCall',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: {
        asamblea: asamblea.publicId,
        convocatoria: data.ordinal,
        anticipacion: noticeDays,
        quorum: quorumRule,
        canales: data.publishedChannels,
        folio: documento.data.folio,
      },
    });

    return fila;
  });

  return ok({ callId: emitida.id, noticeDays, folio: documento.data.folio });
}

export const addAgendaItemSchema = z.object({
  assemblyId: z.uuid(),
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(20_000),
  kind: z.enum(['INFORMATIVE', 'DELIBERATIVE', 'ELECTIVE', 'STATUTE_REFORM', 'FINANCIAL_REPORT', 'DISSOLUTION']),
});

export type AddAgendaItemInput = z.infer<typeof addAgendaItemSchema>;

/**
 * Añade un punto al orden del día.
 *
 * La mayoría exigida **no se elige**: se deduce del tipo de punto y de la
 * versión normativa con la que se convocó. Dejarla a criterio de quien redacta
 * el orden del día permitiría aprobar una reforma estatutaria por mayoría
 * simple sin que nadie lo notara hasta la impugnación.
 */
export async function addAgendaItem(
  actor: ActorContext,
  input: AddAgendaItemInput,
): Promise<UseCaseResult<{ agendaItemId: string; position: number; requiredMajority: RequiredMajority }>> {
  const parsed = addAgendaItemSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.agenda.manage', { kind: 'AgendaItem' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const data = parsed.data;
  const asamblea = await db().assembly.findUnique({
    where: { id: data.assemblyId },
    select: { id: true, status: true, calls: { select: { id: true } } },
  });
  if (asamblea === null) return fail(errors.notFound('Esa asamblea no existe.'));
  if (asamblea.calls.length > 0) {
    return fail(
      errors.conflict(
        'La convocatoria ya salió con el orden del día. Añadir un punto después dejaría a quien la leyó sin saber a qué se le convocó.',
      ),
    );
  }
  if (asamblea.status !== 'PLANNED') {
    return fail(errors.conflict('El orden del día se cierra al convocar.'));
  }

  const requiredMajority: RequiredMajority =
    data.kind === 'STATUTE_REFORM'
      ? 'QUALIFIED_TWO_THIRDS'
      : data.kind === 'DISSOLUTION'
        ? 'QUALIFIED_STATUTORY'
        : 'SIMPLE';

  const creado = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`orden:${asamblea.id}`}))`;
    const ultimo = await tx.agendaItem.findFirst({
      where: { assemblyId: asamblea.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (ultimo?.position ?? 0) + 1;

    const fila = await tx.agendaItem.create({
      data: {
        assemblyId: asamblea.id,
        position,
        title: data.title,
        description: data.description,
        kind: data.kind,
        requiredMajority,
        status: 'PENDING',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true, position: true },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AGENDA_ITEM_ADDED,
      objectKind: 'AgendaItem',
      objectId: fila.id,
      outcome: 'SUCCESS',
      metadata: { asamblea: asamblea.id, posicion: fila.position, tipo: data.kind, mayoria: requiredMajority },
    });

    return fila;
  });

  return ok({ agendaItemId: creado.id, position: creado.position, requiredMajority });
}

export const attachAgendaDocumentSchema = z.object({ agendaItemId: z.uuid() });

export interface AgendaDocumentFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface AttachAgendaDocumentInput extends z.infer<typeof attachAgendaDocumentSchema> {
  readonly file: AgendaDocumentFile;
}

/**
 * Adjunta un documento previo a un punto del orden del día (PRD §9.4).
 *
 * El documento **se sube aquí**, en el mismo acto. Los documentos previos son
 * lo que permite llegar a la asamblea sabiendo qué se va a discutir, y hacerlos
 * pasar antes por otra pantalla convertía la preparación de una sesión en dos
 * trámites cuando es uno.
 */
export async function attachAgendaDocument(
  actor: ActorContext,
  input: AttachAgendaDocumentInput,
): Promise<UseCaseResult<{ attached: true }>> {
  const parsed = attachAgendaDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can(actor, 'assembly.agenda.manage', { kind: 'AgendaItemDocument' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const punto = await db().agendaItem.findUnique({
    where: { id: parsed.data.agendaItemId },
    select: {
      id: true,
      assemblyId: true,
      status: true,
      assembly: { select: { unionBody: { select: { legalEntityId: true } } } },
    },
  });
  if (punto === null) return fail(errors.notFound('Ese punto del orden del día no existe.'));
  if (punto.status === 'VOTED' || punto.status === 'WITHDRAWN') {
    return fail(errors.conflict('Ese punto ya se resolvió. Los documentos previos se adjuntan antes de la sesión.'));
  }

  const guardado = await uploadFile(actor, {
    legalEntityId: punto.assembly.unionBody.legalEntityId,
    classification: 'INTERNAL',
    contextKind: 'GOVERNANCE',
    contextId: punto.assemblyId,
    originalFileName: input.file.fileName,
    mimeType: input.file.mimeType,
    content: input.file.content,
  });
  if (!guardado.ok) return fail(guardado.error);

  await transaction(async (tx) => {
    await tx.agendaItemDocument.create({
      data: { agendaItemId: punto.id, fileObjectId: guardado.data.fileObjectId },
    });
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AGENDA_ITEM_UPDATED,
      objectKind: 'AgendaItem',
      objectId: punto.id,
      outcome: 'SUCCESS',
      metadata: { asamblea: punto.assemblyId, documentoAdjunto: guardado.data.fileObjectId },
    });
  });

  return ok({ attached: true });
}

export interface AssemblyRow {
  readonly id: string;
  readonly publicId: string;
  readonly bodyName: string;
  readonly territory: string;
  readonly type: AssemblyType;
  readonly modality: AssemblyModality;
  readonly venue: string | null;
  readonly scheduledAt: Date;
  readonly status: AssemblyStatus;
  readonly normativeVersion: string;
  readonly convenedByPetition: boolean;
  readonly agendaItemCount: number;
  readonly calls: readonly { readonly ordinal: CallOrdinal; readonly issuedAt: Date; readonly noticeDays: number }[];
  readonly rosterFrozen: boolean;
  readonly quorumDeclaredAt: Date | null;
}

export async function assemblyList(
  actor: ActorContext,
  filters: { readonly territorialUnitId?: string } = {},
): Promise<UseCaseResult<readonly AssemblyRow[]>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().assembly.findMany({
    where: filters.territorialUnitId === undefined ? {} : { territorialUnitId: filters.territorialUnitId },
    orderBy: { scheduledAt: 'desc' },
    take: 200,
    select: {
      id: true,
      publicId: true,
      type: true,
      modality: true,
      venue: true,
      scheduledAt: true,
      status: true,
      convenedByPetition: true,
      quorumDeclaredAt: true,
      unionBody: { select: { name: true } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      calls: { orderBy: { issuedAt: 'asc' }, select: { ordinal: true, issuedAt: true, noticeDays: true } },
      rosterSnapshot: { select: { id: true } },
      _count: { select: { agendaItems: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      bodyName: fila.unionBody.name,
      territory: fila.territorialUnit.name,
      type: fila.type,
      modality: fila.modality,
      venue: fila.venue,
      scheduledAt: fila.scheduledAt,
      status: fila.status,
      normativeVersion: fila.normativeRuleSet.version,
      convenedByPetition: fila.convenedByPetition,
      agendaItemCount: fila._count.agendaItems,
      calls: fila.calls,
      rosterFrozen: fila.rosterSnapshot !== null,
      quorumDeclaredAt: fila.quorumDeclaredAt,
    })),
  );
}

export interface AgendaItemRow {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly kind: AgendaItemKind;
  readonly requiredMajority: RequiredMajority;
  readonly status: AgendaItemStatus;
  readonly documentCount: number;
}

export async function agendaItems(
  actor: ActorContext,
  assemblyId: string,
): Promise<UseCaseResult<readonly AgendaItemRow[]>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'AgendaItem' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().agendaItem.findMany({
    where: { assemblyId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      title: true,
      description: true,
      kind: true,
      requiredMajority: true,
      status: true,
      _count: { select: { documents: true } },
    },
  });

  return ok(
    filas.map((fila) => ({
      id: fila.id,
      position: fila.position,
      title: fila.title,
      description: fila.description,
      kind: fila.kind,
      requiredMajority: fila.requiredMajority,
      status: fila.status,
      documentCount: fila._count.documents,
    })),
  );
}

export interface AssemblyDetail extends AssemblyRow {
  readonly legalEntityId: string;
  readonly minutesDocumentId: string | null;
  readonly publicationLevel: string;
  readonly closedAt: Date | null;
  readonly convenedBy: string | null;
  readonly callDetails: readonly {
    readonly id: string;
    readonly ordinal: CallOrdinal;
    readonly issuedAt: Date;
    readonly noticeDays: number;
    readonly quorumRule: string;
    readonly channels: readonly string[];
    readonly documentId: string | null;
  }[];
}

/** Una asamblea por su identificador público, con lo que la pantalla necesita. */
export async function assemblyDetail(
  actor: ActorContext,
  publicId: string,
): Promise<UseCaseResult<AssemblyDetail>> {
  const decision = can(actor, 'assembly.assembly.read', { kind: 'Assembly' });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const fila = await db().assembly.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      type: true,
      modality: true,
      venue: true,
      scheduledAt: true,
      status: true,
      convenedByPetition: true,
      quorumDeclaredAt: true,
      minutesDocumentId: true,
      publicationLevel: true,
      closedAt: true,
      unionBody: { select: { name: true, legalEntityId: true } },
      territorialUnit: { select: { name: true } },
      normativeRuleSet: { select: { version: true } },
      convenedByOfficeTerm: { select: { officeDefinition: { select: { name: true } } } },
      calls: {
        orderBy: { issuedAt: 'asc' },
        select: {
          id: true,
          ordinal: true,
          issuedAt: true,
          noticeDays: true,
          quorumRule: true,
          publishedChannels: true,
          documentId: true,
        },
      },
      rosterSnapshot: { select: { id: true } },
      _count: { select: { agendaItems: true } },
    },
  });
  if (fila === null) return fail(errors.notFound('Esa asamblea no existe.'));

  return ok({
    id: fila.id,
    publicId: fila.publicId,
    bodyName: fila.unionBody.name,
    territory: fila.territorialUnit.name,
    type: fila.type,
    modality: fila.modality,
    venue: fila.venue,
    scheduledAt: fila.scheduledAt,
    status: fila.status,
    normativeVersion: fila.normativeRuleSet.version,
    convenedByPetition: fila.convenedByPetition,
    agendaItemCount: fila._count.agendaItems,
    calls: fila.calls.map((call) => ({
      ordinal: call.ordinal,
      issuedAt: call.issuedAt,
      noticeDays: call.noticeDays,
    })),
    rosterFrozen: fila.rosterSnapshot !== null,
    quorumDeclaredAt: fila.quorumDeclaredAt,
    legalEntityId: fila.unionBody.legalEntityId,
    minutesDocumentId: fila.minutesDocumentId,
    publicationLevel: fila.publicationLevel,
    closedAt: fila.closedAt,
    convenedBy: fila.convenedByOfficeTerm?.officeDefinition.name ?? null,
    callDetails: fila.calls.map((call) => ({
      id: call.id,
      ordinal: call.ordinal,
      issuedAt: call.issuedAt,
      noticeDays: call.noticeDays,
      quorumRule: call.quorumRule,
      channels: call.publishedChannels,
      documentId: call.documentId,
    })),
  });
}
