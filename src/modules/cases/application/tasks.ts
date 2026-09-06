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
import type { CaseTaskStatus } from '@prisma-client/enums';
import { CAMPOS_PARA_DECIDIR, estaAsignada, recursoDelExpediente } from './assignment';

/**
 * Tareas y plazos del expediente (PRD §10.2).
 *
 * **Una tarea es de alguien o no es una tarea.** Y de alguien que pueda
 * hacerla: encomendársela a quien no lleva el expediente produce una tarea que
 * su responsable no puede ni abrir. Por eso el destinatario sale del equipo del
 * expediente, no del padrón entero.
 *
 * **Terminar deja constancia; bloquear, motivo.** No es una convención del
 * código: la base lo exige con dos restricciones, y sin cuándo y por quién no
 * hay tarea terminada. Una tarea bloqueada sin motivo escrito es una tarea
 * olvidada con mejor nombre, y las que se olvidan son exactamente las que
 * dejan a alguien esperando.
 *
 * **Cancelar no es terminar.** Se separan porque miden cosas distintas: una
 * tarea que se hizo y una que se dejó de hacer no pueden contar igual en
 * ningún indicador. Cancelar exige decir por qué, en el mismo campo donde se
 * escribe un bloqueo, porque las dos son «esto no se hizo, y esta es la razón».
 */

export const createTaskSchema = z.object({
  caseId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(5, { error: () => 'Escribe qué hay que hacer: al menos cinco caracteres.' })
    .max(200),
  description: z.string().trim().max(20_000).nullable().default(null),
  /** Quién la hace. Sale del equipo del expediente. */
  assigneeId: z.uuid().nullable().default(null),
  /** Fecha límite, en formato `AAAA-MM-DD`. */
  dueAt: z.string().trim().nullable().default(null),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** Estados a los que se puede llevar una tarea desde fuera. */
const DESTINOS = ['IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;

export const advanceTaskSchema = z
  .object({
    taskId: z.uuid(),
    status: z.enum(DESTINOS satisfies readonly CaseTaskStatus[]),
    /**
     * Por qué está detenida o por qué se deja de hacer. Obligatorio para las
     * dos, y por la misma razón: las dos dicen «esto no se hizo».
     */
    note: z.string().trim().max(600).nullable().default(null),
  })
  .refine((valor) => valor.status !== 'BLOCKED' || (valor.note ?? '').length >= 10, {
    error: () => 'Escribe qué la tiene detenida: una tarea bloqueada sin motivo es una tarea olvidada.',
    path: ['note'],
  })
  .refine((valor) => valor.status !== 'CANCELLED' || (valor.note ?? '').length >= 10, {
    error: () => 'Escribe por qué se deja de hacer: cancelar una tarea también es una decisión.',
    path: ['note'],
  });

export type AdvanceTaskInput = z.input<typeof advanceTaskSchema>;

export const assignTaskSchema = z.object({
  taskId: z.uuid(),
  /** A quién pasa. Nulo la deja sin responsable, que es un estado legítimo. */
  assigneeId: z.uuid().nullable().default(null),
});

export type AssignTaskInput = z.input<typeof assignTaskSchema>;

function detalles(error: z.ZodError): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) (salida[issue.path.join('.') || 'form'] ??= []).push(issue.message);
  return salida;
}

/**
 * Una fecha límite en formato de día, tomada al final del día.
 *
 * Un plazo que venciera a las 00:00 del día señalado dejaría fuera el día
 * entero: quien tiene hasta el viernes tiene el viernes.
 */
function limite(valor: string | null): Date | null | 'invalida' {
  if (valor === null || valor === '') return null;
  const fecha = new Date(`${valor}T23:59:59.999Z`);
  return Number.isNaN(fecha.getTime()) ? 'invalida' : fecha;
}

/** El expediente y la facultad de tocar sus tareas, en una sola comprobación. */
async function puedeConLasTareas(
  actor: ActorContext,
  caseId: string,
): Promise<UseCaseResult<{ id: string; folio: string; legalEntityId: string; status: string }>> {
  const expediente = await db().case.findUnique({
    where: { id: caseId },
    select: { ...CAMPOS_PARA_DECIDIR, folio: true, status: true },
  });
  if (expediente === null) return fail(errors.notFound('Ese expediente no existe.'));

  const asignada = await estaAsignada(actor, expediente.id);
  const decision = can(actor, 'cases.task.manage', recursoDelExpediente(expediente), {
    hasLiveAssignment: () => asignada,
  });
  if (!decision.allowed) return fail(errors.forbidden(explain(decision.reason!)));

  return ok({
    id: expediente.id,
    folio: expediente.folio,
    legalEntityId: expediente.legalEntityId,
    status: expediente.status,
  });
}

/**
 * Comprueba que quien recibe la tarea pueda abrir el expediente.
 *
 * Devuelve su nombre para la bitácora, o el error que corresponde. Una tarea
 * encomendada a quien no lleva el expediente es una tarea que nadie va a ver.
 */
async function delEquipo(caseId: string, userId: string): Promise<UseCaseResult<string>> {
  const asignacion = await db().caseAssignment.findFirst({
    where: { caseId, userId, unassignedAt: null },
    select: {
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
  if (asignacion === null) {
    return fail(
      errors.conflict(
        'Esa persona no lleva este expediente. Asígnasela primero: una tarea encomendada a quien no puede abrir el expediente no la va a ver nadie.',
      ),
    );
  }
  return ok(nombreCompleto(asignacion.user.person));
}

export async function createTask(
  actor: ActorContext,
  input: CreateTaskInput,
): Promise<UseCaseResult<{ taskId: string }>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const permiso = await puedeConLasTareas(actor, data.caseId);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  if (expediente.status === 'CLOSED') {
    return fail(errors.conflict('Ese expediente está cerrado. Reábrelo antes de abrir tareas nuevas.'));
  }

  const plazo = limite(data.dueAt);
  if (plazo === 'invalida') return fail(errors.validation({ dueAt: ['Esa fecha no se entiende.'] }));

  let destinataria: string | null = null;
  if (data.assigneeId !== null) {
    const comprobada = await delEquipo(expediente.id, data.assigneeId);
    if (!comprobada.ok) return comprobada;
    destinataria = comprobada.data;
  }

  const creada = await transaction(async (tx) => {
    const fila = await tx.caseTask.create({
      data: {
        caseId: expediente.id,
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeId,
        dueAt: plazo,
        status: 'PENDING',
        createdByActorId: actor.actorId,
        updatedByActorId: actor.actorId,
      },
      select: { id: true },
    });

    await tx.caseEvent.create({
      data: {
        caseId: expediente.id,
        kind: 'TASK_CREATED',
        actorId: actor.actorId,
        summary:
          destinataria === null
            ? `Tarea pendiente: ${data.title}`
            : `Tarea para ${destinataria}: ${data.title}`,
        payload: { tarea: fila.id, plazo: plazo?.toISOString() ?? null },
      },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_TASK_CREATED,
      objectKind: 'CaseTask',
      objectId: fila.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: { folio: expediente.folio, plazo: plazo?.toISOString() ?? null },
    });

    return fila;
  });

  return ok({ taskId: creada.id });
}

export async function advanceTask(
  actor: ActorContext,
  input: AdvanceTaskInput,
): Promise<UseCaseResult<{ taskId: string; status: CaseTaskStatus }>> {
  const parsed = advanceTaskSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const tarea = await db().caseTask.findUnique({
    where: { id: data.taskId },
    select: { id: true, caseId: true, title: true, status: true },
  });
  if (tarea === null) return fail(errors.notFound('Esa tarea no existe.'));

  const permiso = await puedeConLasTareas(actor, tarea.caseId);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  // Terminada o cancelada, una tarea ya no se mueve. Reabrirla borraría cuándo
  // se terminó y quién la terminó, que es justo lo que deja constancia.
  if (tarea.status === 'DONE' || tarea.status === 'CANCELLED') {
    return fail(
      errors.conflict(
        `Esa tarea ya está ${tarea.status === 'DONE' ? 'terminada' : 'cancelada'}. Si hay algo más que hacer, abre otra: así se ve que fueron dos cosas.`,
      ),
    );
  }
  if (tarea.status === data.status) {
    return fail(errors.conflict('La tarea ya está así.'));
  }

  const quienTermina = actor.userId ?? null;
  if (data.status === 'DONE' && quienTermina === null) {
    return fail(errors.forbidden('Terminar una tarea deja constancia de quién la terminó: exige una cuenta.'));
  }

  const ahora = new Date();
  await transaction(async (tx) => {
    await tx.caseTask.update({
      where: { id: tarea.id },
      data: {
        status: data.status,
        // La constancia se escribe al terminar y solo al terminar; el motivo
        // acompaña al bloqueo y a la cancelación. La base exige las dos cosas.
        completedAt: data.status === 'DONE' ? ahora : null,
        completedById: data.status === 'DONE' ? quienTermina : null,
        blockerNote: data.status === 'BLOCKED' || data.status === 'CANCELLED' ? data.note : null,
        updatedByActorId: actor.actorId,
      },
    });

    if (data.status === 'DONE') {
      await tx.caseEvent.create({
        data: {
          caseId: tarea.caseId,
          kind: 'TASK_COMPLETED',
          actorId: actor.actorId,
          summary: `Terminada: ${tarea.title}`,
          payload: { tarea: tarea.id },
        },
      });
    }

    await recordAudit(tx, actor, {
      action:
        data.status === 'DONE' ? AUDIT_ACTIONS.CASE_TASK_COMPLETED : AUDIT_ACTIONS.CASE_TASK_UPDATED,
      objectKind: 'CaseTask',
      objectId: tarea.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      ...(data.note === null ? {} : { reason: data.note }),
      metadata: { folio: expediente.folio, de: tarea.status, a: data.status },
    });
  });

  return ok({ taskId: tarea.id, status: data.status });
}

export async function assignTask(
  actor: ActorContext,
  input: AssignTaskInput,
): Promise<UseCaseResult<{ taskId: string }>> {
  const parsed = assignTaskSchema.safeParse(input);
  if (!parsed.success) return fail(errors.validation(detalles(parsed.error)));
  const data = parsed.data;

  const tarea = await db().caseTask.findUnique({
    where: { id: data.taskId },
    select: { id: true, caseId: true, title: true, status: true },
  });
  if (tarea === null) return fail(errors.notFound('Esa tarea no existe.'));
  if (tarea.status === 'DONE' || tarea.status === 'CANCELLED') {
    return fail(errors.conflict('Esa tarea ya se cerró. Encomendar lo que ya no hay que hacer no cambia nada.'));
  }

  const permiso = await puedeConLasTareas(actor, tarea.caseId);
  if (!permiso.ok) return permiso;
  const expediente = permiso.data;

  let destinataria: string | null = null;
  if (data.assigneeId !== null) {
    const comprobada = await delEquipo(tarea.caseId, data.assigneeId);
    if (!comprobada.ok) return comprobada;
    destinataria = comprobada.data;
  }

  await transaction(async (tx) => {
    await tx.caseTask.update({
      where: { id: tarea.id },
      data: { assigneeId: data.assigneeId, updatedByActorId: actor.actorId },
    });

    await recordAudit(tx, actor, {
      action: AUDIT_ACTIONS.CASE_TASK_UPDATED,
      objectKind: 'CaseTask',
      objectId: tarea.id,
      outcome: 'SUCCESS',
      legalEntityId: expediente.legalEntityId,
      metadata: { folio: expediente.folio, destinataria },
    });
  });

  return ok({ taskId: tarea.id });
}
