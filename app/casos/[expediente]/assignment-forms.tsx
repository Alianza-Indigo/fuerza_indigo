'use client';

import { useActionState, useState } from 'react';
import {
  ErrorNotice,
  Notice,
  RadioGroup,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
} from '@/design-system/primitives';
import type { CaseAssignmentRole } from '@prisma-client/enums';
import { NOMBRE_DE_ASIGNACION, QUE_HACE_CADA_PAPEL } from '@/modules/cases/domain';
import type { Candidatura } from '@/modules/cases';
import { assignCaseAction, unassignCaseAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

const PAPELES_DEL_EQUIPO: readonly CaseAssignmentRole[] = ['OWNER', 'SUPPORT', 'SUPERVISOR', 'OBSERVER'];

/**
 * Encomienda del expediente (PRD §10.3, alcance de la Fase 6).
 *
 * El desplegable **solo trae a quien puede llevarlo**: competencia en la
 * materia, facultad en la entidad y nombramiento que alcance el territorio del
 * expediente. Ofrecer a toda la plantilla y rechazar al enviar convertiría la
 * pantalla en una lotería, y quien asigna no tiene por qué conocer de memoria
 * el alcance de cada nombramiento.
 *
 * Se enseña cuántos expedientes lleva ya cada quien. Sin ese número el reparto
 * acaba siempre en la misma persona: la primera de la lista.
 */
export function AssignCaseForm({ caseId, candidatas }: { caseId: string; candidatas: readonly Candidatura[] }) {
  const [estado, accion, pendiente] = useActionState(assignCaseAction, INICIAL);
  const [papel, setPapel] = useState<string>('SUPPORT');
  const errores = estado.fieldErrors ?? {};

  const libres = candidatas.filter((candidata) => candidata.yaEnElEquipo === null);

  if (libres.length === 0) {
    return (
      <Notice title="No hay a quién encomendárselo" tone="warning" live="none">
        <p>
          Nadie con facultad en esta materia y alcance en este territorio está fuera del equipo. Amplía el alcance
          territorial de algún nombramiento o revisa quién tiene la facultad.
        </p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Asignado'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <Select
        name="userId"
        label="¿A quién se le encomienda?"
        hint="Solo aparece quien tiene competencia en la materia y alcance en el territorio del expediente."
        required
        options={libres.map((candidata) => ({
          value: candidata.userId,
          label: `${candidata.nombre} · ${candidata.roles.join(', ')} · lleva ${candidata.cargaActual}`,
        }))}
        {...(errores['userId'] === undefined ? {} : { errors: errores['userId'] })}
      />

      <RadioGroup
        name="assignmentRole"
        legend="¿Con qué papel?"
        options={PAPELES_DEL_EQUIPO.map((valor) => ({
          value: valor,
          label: NOMBRE_DE_ASIGNACION[valor],
          hint: QUE_HACE_CADA_PAPEL[valor],
        }))}
        value={papel}
        onChange={setPapel}
        {...(errores['assignmentRole'] === undefined ? {} : { errors: errores['assignmentRole'] })}
      />

      {papel === 'OWNER' && (
        <Notice title="Esto releva a quien responde hoy" tone="warning" live="status">
          <p>
            Solo hay una persona responsable a la vez. Al nombrar a otra, la anterior deja de llevar el expediente en
            el mismo acto, y el relevo queda en la bitácora con el motivo que escribas.
          </p>
        </Notice>
      )}

      <TextArea
        name="reason"
        label="¿Por qué se le encomienda?"
        hint="Queda en la bitácora del expediente."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Asignando…' : 'Asignar el expediente'}</SubmitButton>
    </form>
  );
}

/** Relevo de alguien del equipo, con su motivo. */
export function UnassignCaseForm({ assignmentId, nombre }: { assignmentId: string; nombre: string }) {
  const [estado, accion, pendiente] = useActionState(unassignCaseAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Relevada'} />;
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <TextArea
        name="reason"
        label={`¿Por qué deja de llevarlo ${nombre}?`}
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Relevando…' : 'Relevar del expediente'}</SubmitButton>
    </form>
  );
}
