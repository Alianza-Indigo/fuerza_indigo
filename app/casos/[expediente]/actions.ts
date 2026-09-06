'use server';

import { revalidatePath } from 'next/cache';
import {
  addParticipant,
  advanceTask,
  assessCase,
  assignCase,
  assignTask,
  createTask,
  removeParticipant,
  unassignCase,
} from '@/modules/cases';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface CaseFormState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

/**
 * Asienta la valoración humana del expediente.
 *
 * No decide nada por su cuenta: quién puede, si está a cargo y si el expediente
 * admite la valoración lo resuelve el módulo, que es donde está probado.
 */
export async function assessCaseAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const plazo = textField(formData, 'dueAt');

  const resultado = await assessCase(actor, {
    caseId: textField(formData, 'caseId'),
    humanAssessment: textField(formData, 'humanAssessment'),
    priority: textField(formData, 'priority') as never,
    status: textField(formData, 'status') as never,
    dueAt: plazo === '' ? null : plazo,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message: resultado.data.primeraRespuesta
      ? `Valorado. Queda registrado como la primera respuesta del expediente ${resultado.data.folio}.`
      : `Valoración actualizada en el expediente ${resultado.data.folio}.`,
  };
}

/**
 * Agrega a alguien al expediente.
 *
 * La calidad no viaja en el formulario: la deriva el módulo del padrón, porque
 * quién es agremiada u honoraria ya está registrado y pedirlo a mano invita a
 * poner lo que a alguien le parece.
 */
export async function addParticipantAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const personId = textField(formData, 'personId');
  const externalName = textField(formData, 'externalName');

  const resultado = await addParticipant(actor, {
    caseId: textField(formData, 'caseId'),
    personId: personId === '' ? null : personId,
    externalName: externalName === '' ? null : externalName,
    role: textField(formData, 'role') as never,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message: resultado.data.veElExpediente
      ? 'Agregada al expediente. Puede verlo desde su portal, sin las notas reservadas.'
      : 'Agregada al expediente. Figura en él y no lo ve.',
  };
}

/** Retira a alguien del expediente, con su motivo. */
export async function removeParticipantAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();

  const resultado = await removeParticipant(actor, {
    participantId: textField(formData, 'participantId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return { status: 'ok', message: 'Deja de figurar en el expediente y deja de verlo.' };
}

/**
 * Encomienda el expediente a alguien.
 *
 * Ni la competencia ni el territorio viajan en el formulario: los comprueba el
 * módulo contra los nombramientos vivos. Un formulario que los enviara podría
 * mentir, y el desplegable ya solo ofrece a quien puede.
 */
export async function assignCaseAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();

  const resultado = await assignCase(actor, {
    caseId: textField(formData, 'caseId'),
    userId: textField(formData, 'userId'),
    assignmentRole: textField(formData, 'assignmentRole') as never,
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message:
      resultado.data.relevoDe === null
        ? 'Entra al equipo del expediente.'
        : 'Queda a cargo del expediente y releva a quien lo llevaba. El relevo consta en la bitácora.',
  };
}

/** Releva a alguien del expediente, con su motivo. */
export async function unassignCaseAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();

  const resultado = await unassignCase(actor, {
    assignmentId: textField(formData, 'assignmentId'),
    reason: textField(formData, 'reason'),
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return { status: 'ok', message: 'Deja de llevar el expediente.' };
}

/**
 * Abre una tarea del expediente.
 *
 * El destinatario sale del equipo del expediente y el módulo lo comprueba:
 * encomendársela a quien no lo lleva produciría una tarea que su responsable
 * no puede ni abrir.
 */
export async function createTaskAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const responsable = textField(formData, 'assigneeId');
  const plazo = textField(formData, 'dueAt');
  const detalle = textField(formData, 'description');

  const resultado = await createTask(actor, {
    caseId: textField(formData, 'caseId'),
    title: textField(formData, 'title'),
    description: detalle === '' ? null : detalle,
    assigneeId: responsable === '' ? null : responsable,
    dueAt: plazo === '' ? null : plazo,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return { status: 'ok', message: 'Tarea abierta.' };
}

/** Mueve una tarea de estado, con lo que cada estado exige. */
export async function advanceTaskAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const nota = textField(formData, 'note');

  const resultado = await advanceTask(actor, {
    taskId: textField(formData, 'taskId'),
    status: textField(formData, 'status') as never,
    note: nota === '' ? null : nota,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return {
    status: 'ok',
    message:
      resultado.data.status === 'DONE'
        ? 'Terminada. Queda constancia de cuándo y por quién.'
        : 'Tarea actualizada.',
  };
}

/** Pasa una tarea a otra persona del equipo. */
export async function assignTaskAction(_previo: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const actor = await currentActor();
  const responsable = textField(formData, 'assigneeId');

  const resultado = await assignTask(actor, {
    taskId: textField(formData, 'taskId'),
    assigneeId: responsable === '' ? null : responsable,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }

  revalidatePath('/casos');
  return { status: 'ok', message: 'La tarea cambia de responsable.' };
}
