import { z } from 'zod';

import { db } from '@/platform/db/client';
import { transaction } from '@/platform/db/unit-of-work';
import { errors } from '@/platform/errors/app-error';
import { fail, ok, type UseCaseResult } from '@/platform/kernel/result';
import { can, explain } from '@/platform/authz/policy';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { ROLE_COMPARTMENTS } from '@/platform/auth/actor-resolver';
import { nombreCompleto } from '@/platform/i18n/person-name';
import type { CaseAssignmentRole, CaseStatus } from '@prisma-client/enums';
import { compartimentoDe } from '../domain/access';
import { NOMBRE_DE_ASIGNACION } from '../domain/team';
import { CAMPOS_PARA_DECIDIR, recursoDelExpediente } from './assignment';

/**
 * Asignación por territorio y competencia (PRD §10.3, alcance de la Fase 6).
 *
 * Llevar un expediente no es tener un permiso: es **poder hacerse cargo de este
 * asunto**, y eso son tres cosas a la vez.
 *
 * **Competencia.** Quien lo recibe tiene que tener la facultad de leer
 * expedientes en la entidad responsable, y su rol tiene que alcanzar el
 * compartimento del expediente. Asignar un expediente sindical a quien solo
 * tiene el lado social produciría una asignación que el motor rechaza al
 * primer intento de abrirlo: una carpeta con nombre encima y nada dentro. Se
 * comprueba **antes**, no al abrir, porque el daño de asignar mal no es que no
 * se pueda leer, es que el asunto se queda sin atender mientras alguien cree
 * que lo lleva.
 *
 * **Territorio.** Un expediente ocurre en un sitio, y el alcance del
 * nombramiento dice hasta dónde llega quien lo recibe. Una delegación
 * territorial de Jalisco no lleva asuntos de Nuevo León ni aunque le sobren
 * facultades. Un expediente sin territorio no está fuera de ninguno: lo puede
 * llevar cualquiera con competencia.
 *
 * **Responsable siempre.** Un expediente sin nadie a cargo es un expediente
 * abandonado con apariencia de trámite. Relevar al último responsable se niega;
 * el relevo se hace nombrando a quien sigue, y ese acto releva al anterior en
 * la misma operación, para que no exista ningún instante en el que el asunto no
 * sea de nadie.
 */

export const assignCaseSchema = z.object({
  caseId: z.uuid(),
  /** A quién se le encomienda. */
  userId: z.uuid({ error: () => 'Elige a quién se le asigna el expediente.' }),
  assignmentRole: z.enum([
    'OWNER',
    'SUPPORT',
    'SUPERVISOR',
    'OBSERVER',
  ] as const satisfies readonly CaseAssignmentRole[]),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se asigna así: al menos diez caracteres.',
  }),
});

export type AssignCaseInput = z.infer<typeof assignCaseSchema>;

export const unassignCaseSchema = z.object({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(10, {
    error: () => 'Escribe por qué se releva: dejar de llevar un expediente es un acto.',
  }),
});

export type UnassignCaseInput = z.infer<typeof unassignCaseSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/** Estados en los que un expediente todavía ocupa a quien lo lleva. */
const ABIERTOS = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_THIRD_PARTY', 'REFERRED'] as const satisfies readonly CaseStatus[];

/** Quien puede hacerse cargo de un expediente, y cuánto lleva encima. */
export interface Candidatura {
  readonly userId: string;
  readonly nombre: string;
  readonly roles: readonly string[];
  /** Expedientes vivos que ya lleva. Se enseña para no cargar siempre a la misma persona. */
  readonly cargaActual: number;
  /** Papel con el que ya figura en este expediente, cuando ya figura. */
  readonly yaEnElEquipo: CaseAssignmentRole | null;
}

/**
 * Quién tiene competencia y territorio para este expediente.
 *
 * Se deriva de los nombramientos vivos, no de una lista de personas
 * «del área»: el área no existe como dato, y mantenerla a mano garantizaría
 * que se quedara atrás en cuanto alguien cambiara de cargo.
 */
async function competentes(expediente: {
  id: string;
  legalEntityId: string;
  domain: 'UNION_DEFENSE' | 'SOCIAL_ATTENTION';
  territorialUnit: { path: string } | null;
}): Promise<Map<string, { nombre: string; roles: string[] }>> {
  const ahora = new Date();
  const compartimento = compartimentoDe(expediente.domain);

  const nombramientos = await db().roleAssignment.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: ahora },
      OR: [{ endsAt: null }, { endsAt: { gt: ahora } }],
      legalEntityId: expediente.legalEntityId,
      role: { permissions: { some: { permission: { code: 'cases.case.read' } } } },
      user: { status: 'ACTIVE' },
    },
    select: {
      userId: true,
      role: { select: { code: true, name: true } },
      territorialScopes: {
        select: { includesDescendants: true, territorialUnit: { select: { path: true } } },
      },
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
  });

  const destino = expediente.territorialUnit?.path ?? null;
  const salida = new Map<string, { nombre: string; roles: string[] }>();

  for (const nombramiento of nombramientos) {
    const compartimentos = ROLE_COMPARTMENTS[nombramiento.role.code] ?? [];
    if (!compartimentos.includes(compartimento)) continue;

    // Sin ámbitos declarados el nombramiento no está acotado; con ámbitos, el
    // expediente tiene que caer dentro de alguno.
    if (destino !== null && nombramiento.territorialScopes.length > 0) {
      const alcanza = nombramiento.territorialScopes.some((ambito) =>
        ambito.includesDescendants
          ? destino === ambito.territorialUnit.path || destino.startsWith(`${ambito.territorialUnit.path}/`)
          : destino === ambito.territorialUnit.path,
      );
      if (!alcanza) continue;
    }

    const previo = salida.get(nombramiento.userId);
    if (previo === undefined) {
      salida.set(nombramiento.userId, {
        nombre: nombreCompleto(nombramiento.user.person),
        roles: [nombramiento.role.name],
      });
    } else if (!previo.roles.includes(nombramiento.role.name)) {
      previo.roles.push(nombramiento.role.name);
    }
  }

  return salida;
}

/** Lista para la pantalla que asigna: quién puede, qué es, y cuánto lleva. */
export async function assignableUsers(
  actor: ActorContext,
  caseId: string,
): Promise<UseCaseResult<readonly Candidatura[]>> {
  const expediente = await db().case.findUnique({ where: { id: caseId }, select: CAMPOS_PARA_DECIDIR });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  // La facultad de asignar exige motivo, y consultar a quién se le podría
  // encomendar es parte del acto de encomendarlo: el motivo de la consulta es
  // la consulta misma. El que cuenta es el que se escribe al asignar.
  const decision = can(
    { ...actor, reason: 'consulta de quién puede llevar el expediente' },
    'cases.case.assign',
    recursoDelExpediente(expediente),
  );
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const elegibles = await competentes(expediente);
  if (elegibles.size === 0) return ok([]);

  const identificadores = [...elegibles.keys()];

  const cargas = await db().caseAssignment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: identificadores },
      unassignedAt: null,
      case: { status: { in: [...ABIERTOS] } },
    },
    _count: { _all: true },
  });
  const porPersona = new Map(cargas.map((fila) => [fila.userId, fila._count._all]));

  const equipo = await db().caseAssignment.findMany({
    where: { caseId: expediente.id, unassignedAt: null, userId: { in: identificadores } },
    select: { userId: true, assignmentRole: true },
  });
  const yaEstan = new Map(equipo.map((fila) => [fila.userId, fila.assignmentRole]));

  const salida = [...elegibles.entries()].map(([userId, datos]) => ({
    userId,
    nombre: datos.nombre,
    roles: datos.roles,
    cargaActual: porPersona.get(userId) ?? 0,
    yaEnElEquipo: yaEstan.get(userId) ?? null,
  }));

  // Primero quien menos lleva: la pantalla propone repartir, no repetir.
  salida.sort((una, otra) => una.cargaActual - otra.cargaActual || una.nombre.localeCompare(otra.nombre, 'es'));
  return ok(salida);
}

export async function assignCase(
  actor: ActorContext,
  input: AssignCaseInput,
): Promise<UseCaseResult<{ assignmentId: string; relevoDe: string | null }>> {
  const parsed = assignCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const expediente = await db().case.findUnique({
    where: { id: data.caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));
  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de cambiar quién lo lleva.'));
  }

  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.case.assign', recursoDelExpediente(expediente));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  const quienAsigna = actor.userId;
  if (quienAsigna === null || quienAsigna === undefined) {
    return fail(errors.forbidden('Asignar un expediente es un acto de una persona: exige una cuenta.'));
  }

  const elegibles = await competentes(expediente);
  const elegida = elegibles.get(data.userId);
  if (elegida === undefined) {
    return fail(
      errors.conflict(
        expediente.territorialUnit === null
          ? 'Esa persona no tiene facultad para llevar expedientes de esta entidad en esta materia.'
          : 'Esa persona no tiene facultad para llevar expedientes de esta entidad en esta materia, o su nombramiento no alcanza el territorio del expediente.',
      ),
    );
  }

  const vivas = await db().caseAssignment.findMany({
    where: { caseId: expediente.id, unassignedAt: null },
    select: { id: true, userId: true, assignmentRole: true },
  });

  const suya = vivas.find((asignacion) => asignacion.userId === data.userId);
  if (suya !== undefined) {
    return fail(
      errors.conflict(
        `Esa persona ya figura en el equipo como ${NOMBRE_DE_ASIGNACION[suya.assignmentRole]}. Relévala antes de darle otro papel.`,
      ),
    );
  }

  // Nombrar a quien responde releva a quien respondía. Es un solo acto porque
  // partirlo en dos dejaría al expediente sin nadie a cargo entre los dos.
  const titularAnterior =
    data.assignmentRole === 'OWNER'
      ? (vivas.find((asignacion) => asignacion.assignmentRole === 'OWNER') ?? null)
      : null;

  const hecho = await transaction(async (tx) => {
    if (titularAnterior !== null) {
      await tx.caseAssignment.update({
        where: { id: titularAnterior.id },
        data: {
          unassignedAt: new Date(),
          unassignReason: `Relevo: ${data.reason}`,
          updatedByActorId: actor.actorId,
        },
      });
    }

    const fila = await tx.caseAssignment.create({
      data: {
        caseId: expediente.id,
        userId: data.userId,
        assignmentRole: data.assignmentRole,
        assignedById: quienAsigna,
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'ASSIGNED',
        actorId: actor.actorId,
        summary:
          titularAnterior === null
            ? `${elegida.nombre} entra al equipo como ${NOMBRE_DE_ASIGNACION[data.assignmentRole]}.`
            : `${elegida.nombre} queda a cargo del expediente y releva a quien lo llevaba.`,
        payload: {
          rol: data.assignmentRole,
          motivo: data.reason,
          relevoDe: titularAnterior?.userId ?? null,
        },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_ASSIGNED,
      objectKind: 'CaseAssignment',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      reason: data.reason,
      metadata: {
        folio: expediente.folio,
        rol: data.assignmentRole,
        territorio: expediente.territorialUnit?.path ?? null,
        relevoDe: titularAnterior?.userId ?? null,
      },
    });

    return fila;
  });

  return ok({ assignmentId: hecho.id, relevoDe: titularAnterior?.userId ?? null });
}

export async function unassignCase(
  actor: ActorContext,
  input: UnassignCaseInput,
): Promise<UseCaseResult<{ assignmentId: string }>> {
  const parsed = unassignCaseSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const asignacion = await db().caseAssignment.findUnique({
    where: { id: data.assignmentId },
    select: {
      id: true,
      userId: true,
      assignmentRole: true,
      unassignedAt: true,
      case: { select: { ...CAMPOS_PARA_DECIDIR, folio: true } },
    },
  });
  if (asignacion === null) return fail(errors.notFound('Esa asignación no existe.'));
  if (asignacion.unassignedAt !== null) {
    return fail(errors.conflict('Esa persona ya dejó de llevar el expediente.'));
  }

  const contexto = { ...actor, reason: data.reason };
  const decision = can(contexto, 'cases.case.assign', recursoDelExpediente(asignacion.case));
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  if (asignacion.assignmentRole === 'OWNER') {
    const otros = await db().caseAssignment.count({
      where: {
        caseId: asignacion.case.id,
        unassignedAt: null,
        assignmentRole: 'OWNER',
        id: { not: asignacion.id },
      },
    });
    if (otros === 0) {
      return fail(
        errors.conflict(
          'Es la única persona a cargo del expediente. Nombra a quien lo lleve: ese nombramiento la releva, y así el asunto no queda de nadie.',
        ),
      );
    }
  }

  await transaction(async (tx) => {
    await tx.caseAssignment.update({
      where: { id: asignacion.id },
      data: {
        unassignedAt: new Date(),
        unassignReason: data.reason,
        updatedByActorId: actor.actorId,
      },
    });

    await tx.caseEvent.create({
      data: {
        caseId: asignacion.case.id,
        kind: 'UNASSIGNED',
        actorId: actor.actorId,
        summary: `Deja de llevar el expediente quien figuraba como ${NOMBRE_DE_ASIGNACION[asignacion.assignmentRole]}.`,
        payload: { rol: asignacion.assignmentRole, motivo: data.reason },
      },
    });

    await recordAudit(tx, contexto, {
      action: AUDIT_ACTIONS.CASE_UNASSIGNED,
      objectKind: 'CaseAssignment',
      objectId: asignacion.id,
      outcome: 'SUCCESS',
      legalEntityId: asignacion.case.legalEntityId,
      reason: data.reason,
      metadata: { folio: asignacion.case.folio, rol: asignacion.assignmentRole },
    });
  });

  return ok({ assignmentId: asignacion.id });
}
