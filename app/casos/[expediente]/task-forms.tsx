'use client';

import { useActionState, useState } from 'react';
import {
  ErrorNotice,
  Field,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import type { CaseTaskStatus } from '@prisma-client/enums';
import { DESTINOS_DE_TAREA } from '@/modules/cases/domain';
import { advanceTaskAction, assignTaskAction, createTaskAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

/** Quién puede recibir una tarea: el equipo del expediente, nadie más. */
export interface OpcionDeEquipo {
  readonly value: string;
  readonly label: string;
}

/**
 * Alta de tarea con responsable y plazo (PRD §10.2).
 *
 * El desplegable trae **al equipo del expediente**, no al padrón: una tarea
 * encomendada a quien no lo lleva es una tarea que su responsable no puede ni
 * abrir. Dejarla sin responsable es legítimo —hay cosas que aún no se sabe
 * quién hará— y por eso la primera opción existe y dice lo que es.
 */
export function CreateTaskForm({ caseId, equipo }: { caseId: string; equipo: readonly OpcionDeEquipo[] }) {
  const [estado, accion, pendiente] = useActionState(createTaskAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Tarea abierta'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <Field
        name="title"
        label="¿Qué hay que hacer?"
        hint="Una frase que se entienda dentro de tres meses."
        required
        {...(errores['title'] === undefined ? {} : { errors: errores['title'] })}
      />

      <TextArea
        name="description"
        label="Detalle"
        hint="Opcional. Lo que haga falta para poder hacerla sin preguntar."
        rows={3}
        {...(errores['description'] === undefined ? {} : { errors: errores['description'] })}
      />

      <Select
        name="assigneeId"
        label="¿Quién la hace?"
        hint="Solo el equipo del expediente: quien no lo lleva no podría abrirlo."
        options={[{ value: '', label: 'Todavía sin responsable' }, ...equipo]}
        {...(errores['assigneeId'] === undefined ? {} : { errors: errores['assigneeId'] })}
      />

      <Field
        name="dueAt"
        type="date"
        label="¿Para cuándo?"
        hint="Opcional. El plazo vence al final del día señalado, no al empezarlo."
        {...(errores['dueAt'] === undefined ? {} : { errors: errores['dueAt'] })}
      />

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir la tarea'}</SubmitButton>
    </form>
  );
}

/**
 * Movimiento de una tarea.
 *
 * Detener y cancelar piden el motivo en la misma pantalla en la que se eligen,
 * porque las dos dicen «esto no se hizo» y sin la razón no dicen nada. La base
 * lo exige además con dos restricciones: aquí se pide antes para no responder
 * con un error de motor a quien solo pulsó un botón.
 */
export function AdvanceTaskForm({ taskId, titulo }: { taskId: string; titulo: string }) {
  const [estado, accion, pendiente] = useActionState(advanceTaskAction, INICIAL);
  const [destino, setDestino] = useState<string>('IN_PROGRESS');
  const errores = estado.fieldErrors ?? {};

  const exigeMotivo = destino === 'BLOCKED' || destino === 'CANCELLED';

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Actualizada'} />;
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="taskId" value={taskId} />

      <RadioGroup
        id={`destino-${taskId}`}
        name="status"
        legend={`¿Qué pasa con «${titulo}»?`}
        options={DESTINOS_DE_TAREA.map((opcion) => ({
          value: opcion.value satisfies CaseTaskStatus,
          label: opcion.label,
          hint: opcion.hint,
        }))}
        value={destino}
        onChange={setDestino}
        {...(errores['status'] === undefined ? {} : { errors: errores['status'] })}
      />

      {exigeMotivo && (
        <TextArea
          id={`motivo-${taskId}`}
          name="note"
          label={destino === 'BLOCKED' ? '¿Qué la tiene detenida?' : '¿Por qué se deja de hacer?'}
          required
          rows={2}
          {...(errores['note'] === undefined ? {} : { errors: errores['note'] })}
        />
      )}

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Guardar el cambio'}</SubmitButton>
    </form>
  );
}

/** Paso de una tarea a otra persona del equipo. */
export function AssignTaskForm({
  taskId,
  equipo,
  actual,
}: {
  taskId: string;
  equipo: readonly OpcionDeEquipo[];
  actual: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(assignTaskAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (equipo.length === 0) {
    return (
      <Notice title="No hay a quién pasársela" tone="neutral" live="none">
        <p>El expediente no tiene equipo al que encomendar tareas.</p>
      </Notice>
    );
  }

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Cambió de responsable'} />;
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        id={`responsable-${taskId}`}
        name="assigneeId"
        label="Pasarla a"
        options={[{ value: '', label: 'Dejarla sin responsable' }, ...equipo]}
        defaultValue={actual ?? ''}
        {...(errores['assigneeId'] === undefined ? {} : { errors: errores['assigneeId'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Pasando…' : 'Cambiar responsable'}</SubmitButton>
    </form>
  );
}
