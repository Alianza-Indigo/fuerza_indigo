import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction, type Tx } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import type { MembershipCategory, MembershipStatus } from '@prisma-client/enums';
import { nombreCompleto } from '@/platform/i18n/person-name';

/**
 * Padrones separados (PRD §7.1; F4-PAD-001, F4-PAD-002, F4-PAD-004).
 *
 * La regla que gobierna este archivo entero es una línea del PRD §7.1: «ningún
 * padrón se construirá mediante una vista que mezcle categorías sin mostrar su
 * calidad exacta». Por eso hay **una consulta por padrón** y cada una filtra por
 * su categoría en la base, en vez de una función con un parámetro `categoria`
 * que devuelva lo que le pidan. La diferencia no es estilística: una consulta
 * parametrizada acaba invocándose sin filtro el día que alguien quiera «ver
 * todo», y ese día el padrón sindical incluye afiliados honorarios.
 *
 * El padrón de beneficiarios protegidos vive aparte, en `beneficiaries.ts`, y
 * también por eso: sus filas no son membresías y ocultan la necesidad inicial.
 */

export interface RosterRow {
  readonly membershipId: string;
  readonly memberNumber: string;
  readonly personId: string;
  readonly personName: string;
  readonly membershipType: string;
  readonly status: MembershipStatus;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;
  readonly territory: string | null;
  readonly section: string | null;
  readonly occupation: string | null;
  /** La calidad exacta, dicha en cada fila y no solo en el título. */
  readonly category: MembershipCategory;
  /** Si esta fila entra en el padrón que se remite a autoridades. */
  readonly appearsInAuthorityRoster: boolean;
}

export interface RosterFilters {
  readonly status?: MembershipStatus;
  readonly territorialUnitId?: string;
  readonly query?: string;
}

const SELECCION = {
  id: true,
  memberNumber: true,
  personId: true,
  category: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  membershipType: { select: { name: true, appearsInAuthorityRoster: true } },
  territorialUnit: { select: { name: true } },
  section: { select: { name: true } },
  person: {
    select: {
      givenName: true,
      middleName: true,
      familyName: true,
      secondFamilyName: true,
      applications: {
        where: { status: 'ACTIVATED' },
        take: 1,
        orderBy: { submittedAt: 'desc' },
        select: { occupation: { select: { name: true } } },
      },
    },
  },
} as const;

type FilaCruda = {
  id: string;
  memberNumber: string;
  personId: string;
  category: MembershipCategory;
  status: MembershipStatus;
  startedAt: Date;
  expiresAt: Date | null;
  membershipType: { name: string; appearsInAuthorityRoster: boolean };
  territorialUnit: { name: string } | null;
  section: { name: string } | null;
  person: {
    givenName: string;
    middleName: string | null;
    familyName: string;
    secondFamilyName: string | null;
    applications: { occupation: { name: string } | null }[];
  };
};

function aFila(fila: FilaCruda): RosterRow {
  return {
    membershipId: fila.id,
    memberNumber: fila.memberNumber,
    personId: fila.personId,
    personName: nombreCompleto(fila.person),
    membershipType: fila.membershipType.name,
    status: fila.status,
    startedAt: fila.startedAt,
    expiresAt: fila.expiresAt,
    territory: fila.territorialUnit?.name ?? null,
    section: fila.section?.name ?? null,
    occupation: fila.person.applications[0]?.occupation?.name ?? null,
    category: fila.category,
    appearsInAuthorityRoster: fila.membershipType.appearsInAuthorityRoster,
  };
}

function condiciones(filtros: RosterFilters) {
  const texto = (filtros.query ?? '').trim();
  return {
    ...(filtros.status === undefined ? {} : { status: filtros.status }),
    ...(filtros.territorialUnitId === undefined ? {} : { territorialUnitId: filtros.territorialUnitId }),
    ...(texto === ''
      ? {}
      : {
          OR: [
            { memberNumber: { contains: texto, mode: 'insensitive' as const } },
            { person: { familyName: { contains: texto, mode: 'insensitive' as const } } },
            { person: { givenName: { contains: texto, mode: 'insensitive' as const } } },
          ],
        }),
  };
}

function autorizarLectura(actor: ActorContext): UseCaseResult<true> {
  const decision = can(actor, 'membership.roster.read', {
    kind: 'Membership',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));
  return ok(true);
}

/**
 * Padrón de agremiados (F4-PAD-001).
 *
 * Solo `UNION_MEMBER`. La categoría se filtra en la base y no se recibe por
 * parámetro: no existe forma de llamar a esta función y obtener otra cosa.
 */
export async function unionRoster(
  actor: ActorContext,
  filtros: RosterFilters = {},
): Promise<UseCaseResult<RosterRow[]>> {
  const permitido = autorizarLectura(actor);
  if (!permitido.ok) return permitido;

  const filas = await db().membership.findMany({
    where: { category: 'UNION_MEMBER', ...condiciones(filtros) },
    orderBy: [{ memberNumber: 'asc' }],
    take: 500,
    select: SELECCION,
  });
  return ok(filas.map((fila) => aFila(fila)));
}

/** Padrón de afiliados honorarios (F4-PAD-002). Solo `HONORARY_AFFILIATE`. */
export async function honoraryRoster(
  actor: ActorContext,
  filtros: RosterFilters = {},
): Promise<UseCaseResult<RosterRow[]>> {
  const permitido = autorizarLectura(actor);
  if (!permitido.ok) return permitido;

  const filas = await db().membership.findMany({
    where: { category: 'HONORARY_AFFILIATE', ...condiciones(filtros) },
    orderBy: [{ memberNumber: 'asc' }],
    take: 500,
    select: SELECCION,
  });
  return ok(filas.map((fila) => aFila(fila)));
}

/**
 * El padrón que se remite a la autoridad laboral.
 *
 * Es el más estrecho de los tres, y a propósito: solo membresías **activas** de
 * una calidad que declara `appearsInAuthorityRoster`. El criterio del PRD §24
 * —«solo agremiados elegibles aparecen en el padrón sindical correspondiente»—
 * se cumple aquí y no en la pantalla, porque una pantalla se puede llamar con
 * otros filtros y una función no.
 *
 * Una afiliación honoraria nunca entra, aunque su calidad marcara la casilla:
 * el PRD §3.3 dice que un afiliado honorario «no aparece como agremiado ante
 * autoridades», y el modelo lo garantiza con una comprobación en base. Aquí se
 * filtra además por categoría para que la consulta diga lo mismo que la regla.
 */
export async function authorityRoster(actor: ActorContext): Promise<UseCaseResult<RosterRow[]>> {
  const permitido = autorizarLectura(actor);
  if (!permitido.ok) return permitido;

  const filas = await db().membership.findMany({
    where: {
      category: 'UNION_MEMBER',
      status: 'ACTIVE',
      membershipType: { appearsInAuthorityRoster: true },
    },
    orderBy: [{ memberNumber: 'asc' }],
    take: 2000,
    select: SELECCION,
  });
  return ok(filas.map((fila) => aFila(fila)));
}

/* -------------------------------------------------------------------------- */
/* Exportación auditada                                                       */
/* -------------------------------------------------------------------------- */

export const exportRosterSchema = z.object({
  roster: z.enum(['UNION', 'HONORARY', 'AUTHORITY'], { error: () => 'Di qué padrón quieres exportar.' }),
  reason: z
    .string()
    .trim()
    .min(20, {
      error: () =>
        'Escribe para qué se va a usar. Un padrón exportado sale del sistema y deja de estar protegido por él.',
    })
    .max(600),
});

export type ExportRosterInput = z.infer<typeof exportRosterSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Escapa un campo para un archivo separado por comas. */
function campo(valor: string | number | null): string {
  if (valor === null) return '';
  const texto = typeof valor === 'string' ? valor : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Exporta un padrón, con motivo escrito y asiento de auditoría.
 *
 * El motivo no es burocracia: un padrón exportado es una lista de personas que
 * sale del sistema y deja de estar protegida por él. Quien la saca tiene que
 * poder decir para qué, y quien revise después tiene que poder leerlo.
 *
 * **La calidad exacta va en cada fila**, no solo en el nombre del archivo. Un
 * CSV se renombra, se recorta y se pega en otro; la columna no.
 */
export async function exportRoster(
  actor: ActorContext,
  input: ExportRosterInput,
): Promise<UseCaseResult<{ fileName: string; content: string; rows: number }>> {
  const parsed = exportRosterSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const decision = can({ ...actor, reason: parsed.data.reason }, 'membership.roster.export', {
    kind: 'Membership',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const lectura =
    parsed.data.roster === 'UNION'
      ? await unionRoster(actor)
      : parsed.data.roster === 'HONORARY'
        ? await honoraryRoster(actor)
        : await authorityRoster(actor);
  if (!lectura.ok) return lectura;

  const encabezado = [
    'numero_de_miembro',
    'nombre',
    'calidad_exacta',
    'tipo_de_membresia',
    'estado',
    'alta',
    'vigencia',
    'territorio',
    'seccion',
    'oficio_o_profesion',
    'aparece_ante_autoridades',
  ].join(',');

  const cuerpo = lectura.data.map((fila) =>
    [
      campo(fila.memberNumber),
      campo(fila.personName),
      campo(fila.category),
      campo(fila.membershipType),
      campo(fila.status),
      campo(fila.startedAt.toISOString().slice(0, 10)),
      campo(fila.expiresAt === null ? 'sin vencimiento' : fila.expiresAt.toISOString().slice(0, 10)),
      campo(fila.territory),
      campo(fila.section),
      campo(fila.occupation),
      campo(fila.appearsInAuthorityRoster ? 'si' : 'no'),
    ].join(','),
  );

  // El asiento se escribe **antes** de devolver el archivo: un fallo entre las
  // dos cosas dejaría una lista de personas fuera del sistema sin constancia
  // de que salió.
  await transaction(async (tx) => {
    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.ROSTER_EXPORTED,
      objectKind: 'Membership',
      objectId: parsed.data.roster,
      outcome: 'SUCCESS',
      reason: parsed.data.reason,
      metadata: { padron: parsed.data.roster, filas: lectura.data.length },
    });
  });

  const nombreDeArchivo = {
    UNION: 'padron-de-agremiados',
    HONORARY: 'padron-de-afiliados-honorarios',
    AUTHORITY: 'padron-sindical-ante-la-autoridad',
  }[parsed.data.roster];

  return ok({
    fileName: `${nombreDeArchivo}-${new Date().toISOString().slice(0, 10)}.csv`,
    // Con marca de orden de bytes: sin ella una hoja de cálculo rompe los
    // acentos, y un padrón con los apellidos mal escritos no sirve para nada.
    content: `﻿${encabezado}\n${cuerpo.join('\n')}\n`,
    rows: lectura.data.length,
  });
}

/* -------------------------------------------------------------------------- */
/* Expediente ante la autoridad laboral (PRD §8.1 paso 14, §9.7)              */
/* -------------------------------------------------------------------------- */

/**
 * Abre el expediente de cumplimiento de un alta o una baja.
 *
 * Se llama **dentro de la transacción del hecho**, no en un repaso posterior.
 * Si se hiciera después, existiría un intervalo en el que la obligación ya
 * nació y no consta en ninguna parte, y ese intervalo es exactamente donde se
 * pierden los trámites.
 *
 * Solo se abre para calidades que sí aparecen ante autoridades. Una afiliación
 * honoraria no genera expediente porque no genera obligación: el PRD §3.3 dice
 * que no aparece como agremiado ante autoridades, y abrirle un trámite sería
 * prepararse para informar algo que no hay que informar.
 *
 * Es idempotente por el índice único `(membershipId, kind)`: una membresía tiene
 * un alta y, si llega, una baja.
 */
export async function openAuthorityFiling(
  tx: Tx,
  actor: ActorContext,
  input: {
    membershipId: string;
    personId: string;
    legalEntityId: string;
    kind: 'ROSTER_ADDITION' | 'ROSTER_REMOVAL';
    occurredAt: Date;
  },
): Promise<{ opened: boolean }> {
  const membresia = await tx.membership.findUnique({
    where: { id: input.membershipId },
    select: { category: true, membershipType: { select: { appearsInAuthorityRoster: true } } },
  });
  if (membresia === null) return { opened: false };
  if (membresia.category !== 'UNION_MEMBER' || !membresia.membershipType.appearsInAuthorityRoster) {
    return { opened: false };
  }

  const existente = await tx.labourAuthorityFiling.findUnique({
    where: { membershipId_kind: { membershipId: input.membershipId, kind: input.kind } },
    select: { id: true },
  });
  if (existente !== null) return { opened: false };

  const creado = await tx.labourAuthorityFiling.create({
    data: {
      publicId: newPublicId(20),
      legalEntityId: input.legalEntityId,
      membershipId: input.membershipId,
      personId: input.personId,
      kind: input.kind,
      occurredAt: input.occurredAt,
      createdByActorId: actor.actorId,
      updatedByActorId: actor.actorId,
    },
    select: { id: true },
  });

  await recordAudit(tx, actor, {
    action: AUDIT_ACTIONS.AUTHORITY_FILING_OPENED,
    objectKind: 'LabourAuthorityFiling',
    objectId: creado.id,
    outcome: 'SUCCESS',
    legalEntityId: input.legalEntityId,
    onBehalfOfPersonId: input.personId,
    metadata: { movimiento: input.kind, ocurrioEl: input.occurredAt.toISOString() },
  });

  return { opened: true };
}

export interface FilingRow {
  readonly id: string;
  readonly publicId: string;
  readonly personName: string;
  readonly memberNumber: string;
  readonly kind: 'ROSTER_ADDITION' | 'ROSTER_REMOVAL';
  readonly status: string;
  readonly occurredAt: Date;
  readonly preparedAt: Date | null;
  readonly submittedAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly authorityReference: string | null;
  readonly notes: string | null;
  /** Días transcurridos desde el hecho sin que el trámite haya terminado. */
  readonly daysOpen: number | null;
}

export async function authorityFilings(
  actor: ActorContext,
  filtros: { status?: string } = {},
): Promise<UseCaseResult<FilingRow[]>> {
  const decision = can(actor, 'membership.roster.read', {
    kind: 'LabourAuthorityFiling',
    isBulk: true,
    containsPersonalData: true,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const filas = await db().labourAuthorityFiling.findMany({
    where: {
      ...(filtros.status === undefined
        ? {}
        : { status: filtros.status as 'PENDING' }),
    },
    orderBy: [{ occurredAt: 'asc' }],
    take: 500,
    select: {
      id: true,
      publicId: true,
      kind: true,
      status: true,
      occurredAt: true,
      preparedAt: true,
      submittedAt: true,
      acknowledgedAt: true,
      authorityReference: true,
      notes: true,
      membership: { select: { memberNumber: true } },
      person: { select: { givenName: true, middleName: true, familyName: true, secondFamilyName: true } },
    },
  });

  const ahora = Date.now();
  return ok(
    filas.map((fila) => ({
      id: fila.id,
      publicId: fila.publicId,
      personName: nombreCompleto(fila.person),
      memberNumber: fila.membership.memberNumber,
      kind: fila.kind,
      status: fila.status,
      occurredAt: fila.occurredAt,
      preparedAt: fila.preparedAt,
      submittedAt: fila.submittedAt,
      acknowledgedAt: fila.acknowledgedAt,
      authorityReference: fila.authorityReference,
      notes: fila.notes,
      // Lo que de verdad se quiere saber de un trámite pendiente: cuánto lleva
      // esperando. Un listado que solo dice «pendiente» no distingue el de
      // ayer del de hace ocho meses.
      daysOpen:
        fila.status === 'ACKNOWLEDGED' || fila.status === 'NOT_REQUIRED'
          ? null
          : Math.floor((ahora - fila.occurredAt.getTime()) / 86_400_000),
    })),
  );
}

export const advanceFilingSchema = z
  .object({
    filingId: z.uuid(),
    status: z.enum(['PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'NOT_REQUIRED'], {
      error: () => 'Di en qué punto queda el trámite.',
    }),
    authorityReference: z.string().trim().max(120).default(''),
    notes: z.string().trim().max(1000).default(''),
  })
  .superRefine((datos, ctx) => {
    if (datos.status === 'ACKNOWLEDGED' && datos.authorityReference.trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorityReference'],
        message: 'Un acuse sin número de trámite no acredita nada ante nadie.',
      });
    }
    if (datos.status === 'NOT_REQUIRED' && datos.notes.trim().length < 15) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Explica por qué no hacía falta informarlo. Sin motivo, nadie puede revisarlo después.',
      });
    }
  });

export type AdvanceFilingInput = z.input<typeof advanceFilingSchema>;

/**
 * Hace avanzar el trámite.
 *
 * **La plataforma no declara cumplida la obligación**, y esta distinción es del
 * PRD §9.6: registra que se preparó, que se presentó y que la autoridad acusó,
 * con su referencia. Si eso basta jurídicamente lo dice un abogado, no una
 * pantalla.
 *
 * El avance no retrocede: un trámite acusado no vuelve a «pendiente». Deshacer
 * un acuse borraría la prueba de que se presentó.
 */
export async function advanceFiling(
  actor: ActorContext,
  input: AdvanceFilingInput,
): Promise<UseCaseResult<{ filingId: string; status: string }>> {
  const parsed = advanceFilingSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));

  const expediente = await db().labourAuthorityFiling.findUnique({
    where: { id: parsed.data.filingId },
    select: {
      id: true,
      status: true,
      legalEntityId: true,
      personId: true,
      submittedAt: true,
      preparedAt: true,
    },
  });
  if (expediente === null) return fail(errors.notFound('expediente inexistente'));

  const decision = can(
    { ...actor, reason: `avance del trámite a ${parsed.data.status}` },
    'membership.authority_filing.manage',
    { kind: 'LabourAuthorityFiling', id: expediente.id, legalEntityId: expediente.legalEntityId },
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const ORDEN: Record<string, number> = {
    PENDING: 0,
    PREPARED: 1,
    SUBMITTED: 2,
    ACKNOWLEDGED: 3,
    NOT_REQUIRED: 3,
  };
  if ((ORDEN[parsed.data.status] ?? 0) <= (ORDEN[expediente.status] ?? 0)) {
    return fail(
      errors.conflict(
        'El trámite no retrocede. Deshacer un acuse borraría la prueba de que se presentó.',
        `intento de pasar de ${expediente.status} a ${parsed.data.status}`,
      ),
    );
  }

  const ahora = new Date();
  const referencia = parsed.data.authorityReference.trim();
  const nota = parsed.data.notes.trim();

  await transaction(async (tx) => {
    await tx.labourAuthorityFiling.update({
      where: { id: expediente.id },
      data: {
        status: parsed.data.status,
        // Cada estado escribe su fecha, y conserva las anteriores: la base
        // exige que un presentado tenga fecha de presentación, y un acuse que
        // borrara la de presentación diría que se acusó algo que no se presentó.
        ...(parsed.data.status === 'PREPARED' ? { preparedAt: ahora } : {}),
        ...(parsed.data.status === 'SUBMITTED'
          ? { submittedAt: ahora, ...(expediente.preparedAt === null ? { preparedAt: ahora } : {}) }
          : {}),
        ...(parsed.data.status === 'ACKNOWLEDGED'
          ? {
              acknowledgedAt: ahora,
              ...(expediente.submittedAt === null ? { submittedAt: ahora } : {}),
              ...(expediente.preparedAt === null ? { preparedAt: ahora } : {}),
            }
          : {}),
        ...(referencia === '' ? {} : { authorityReference: referencia }),
        ...(nota === '' ? {} : { notes: nota }),
        updatedByActorId: actor.actorId,
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.AUTHORITY_FILING_ADVANCED,
      objectKind: 'LabourAuthorityFiling',
      objectId: expediente.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      onBehalfOfPersonId: expediente.personId,
      reason: nota === '' ? `Avance a ${parsed.data.status}` : nota,
      metadata: { de: expediente.status, a: parsed.data.status, referencia: referencia === '' ? null : referencia },
    });
  });

  return ok({ filingId: expediente.id, status: parsed.data.status });
}
