'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { CasePriority, CaseStatus } from '@prisma-client/enums';
import { assessCaseAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

/**
 * Valoración humana del expediente (PRD §10.2).
 *
 * Se escribe **al lado** del relato original, nunca encima: el relato es lo que
 * la persona contó y no lo altera nadie; esto es lo que la organización
 * entiende y propone, y tiene que poder cambiar sin tocar aquello.
 */
export function AssessmentForm({
  caseId,
  valoracion,
  prioridad,
  estado,
  plazo,
}: {
  caseId: string;
  valoracion: string | null;
  prioridad: CasePriority;
  estado: CaseStatus;
  plazo: string | null;
}) {
  const [resultado, accion, pendiente] = useActionState(assessCaseAction, INICIAL);
  const errores = resultado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {resultado.status === 'error' && resultado.message !== undefined && (
        <ErrorNotice title={resultado.message} />
      )}
      {resultado.status === 'ok' && <SuccessNotice title={resultado.message ?? 'Valorado'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <TextArea
        name="humanAssessment"
        label="¿Qué entiendes que pasa y qué se propone hacer?"
        hint="Lo lee quien retome el expediente. No reescribe lo que contó la persona: se guarda aparte."
        required
        rows={6}
        defaultValue={valoracion ?? ''}
        {...(errores['humanAssessment'] === undefined ? {} : { errors: errores['humanAssessment'] })}
      />

      <RadioGroup
        name="priority"
        legend="Prioridad"
        options={[
          { value: 'LOW', label: 'Baja', hint: 'Puede esperar sin que nadie salga perjudicado.' },
          { value: 'NORMAL', label: 'Normal', hint: 'El orden habitual de trabajo.' },
          { value: 'HIGH', label: 'Alta', hint: 'Hay un plazo que se pierde o un daño que crece.' },
          { value: 'CRITICAL', label: 'Crítica', hint: 'Hay riesgo para una persona ahora mismo.' },
        ]}
        value={prioridad}
        {...(errores['priority'] === undefined ? {} : { errors: errores['priority'] })}
      />

      <RadioGroup
        name="status"
        legend="¿En qué punto está?"
        help="Esperar a la persona y esperar a un tercero se cuentan aparte a propósito: exigen actos distintos y confundirlos esconde cuál se está dejando pasar."
        options={[
          { value: 'OPEN', label: 'Abierto', hint: 'Recibido y sin empezar.' },
          { value: 'IN_PROGRESS', label: 'En trabajo', hint: 'Se está haciendo algo ahora.' },
          { value: 'WAITING_ON_PERSON', label: 'Esperando a la persona', hint: 'Falta que conteste o traiga algo.' },
          {
            value: 'WAITING_ON_THIRD_PARTY',
            label: 'Esperando a un tercero',
            hint: 'Falta que responda la empresa, la escuela o una autoridad.',
          },
        ]}
        value={estado === 'CLOSED' || estado === 'REFERRED' ? 'IN_PROGRESS' : estado}
        {...(errores['status'] === undefined ? {} : { errors: errores['status'] })}
      />

      <Field
        name="dueAt"
        label="¿Para cuándo hay que haber hecho algo?"
        hint="Déjalo vacío si no hay un plazo real. Un plazo inventado convierte los avisos en ruido."
        type="date"
        defaultValue={plazo ?? ''}
        {...(errores['dueAt'] === undefined ? {} : { errors: errores['dueAt'] })}
      />

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar la valoración'}</SubmitButton>
    </form>
  );
}
