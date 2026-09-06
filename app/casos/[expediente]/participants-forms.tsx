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
import type { CaseParticipantRole } from '@prisma-client/enums';
import { EXIGEN_REPRESENTACION, VEN_EL_EXPEDIENTE } from '@/modules/cases/domain';
import { addParticipantAction, removeParticipantAction, type CaseFormState } from './actions';

const INICIAL: CaseFormState = { status: 'idle' };

const PAPELES: readonly { value: CaseParticipantRole; label: string; hint: string }[] = [
  { value: 'AFFECTED_PERSON', label: 'Persona afectada', hint: 'A quien le está pasando lo que se cuenta.' },
  {
    value: 'REPRESENTATIVE',
    label: 'Representa',
    hint: 'Exige una relación de representación o cuidado ya registrada.',
  },
  {
    value: 'FAMILY_OR_CAREGIVER',
    label: 'Familiar o persona cuidadora',
    hint: 'Exige una relación de cuidado ya registrada.',
  },
  { value: 'WITNESS', label: 'Testigo', hint: 'Figura en el expediente y no lo ve.' },
  { value: 'COUNTERPART', label: 'Contraparte', hint: 'La otra parte del conflicto. Figura y no lo ve.' },
  {
    value: 'EXTERNAL_INSTITUTION',
    label: 'Institución externa',
    hint: 'Una escuela, una empresa o una autoridad. Se nombra en texto.',
  },
];

/**
 * Alta de participantes (PRD §10.2).
 *
 * No se pide la calidad: la deriva el sistema del padrón, porque ya está
 * registrada y teclearla invita a poner lo que a alguien le parece. Tampoco se
 * pide si ve el expediente: lo decide el papel, y una casilla ahí acabaría
 * dándole acceso a una contraparte sin que nadie lo notara.
 */
export function AddParticipantForm({ caseId, personas }: { caseId: string; personas: readonly { value: string; label: string }[] }) {
  const [estado, accion, pendiente] = useActionState(addParticipantAction, INICIAL);
  const [papel, setPapel] = useState<string>('AFFECTED_PERSON');
  const errores = estado.fieldErrors ?? {};

  const externa = papel === 'EXTERNAL_INSTITUTION' || papel === 'COUNTERPART';
  const exigeRepresentacion = EXIGEN_REPRESENTACION.includes(papel as CaseParticipantRole);
  const vera = VEN_EL_EXPEDIENTE.includes(papel as CaseParticipantRole);

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Agregada'} />}

      <input type="hidden" name="caseId" value={caseId} />

      <RadioGroup
        name="role"
        legend="¿Qué papel juega en el expediente?"
        options={PAPELES}
        value={papel}
        onChange={setPapel}
        {...(errores['role'] === undefined ? {} : { errors: errores['role'] })}
      />

      {exigeRepresentacion && (
        <Notice title="Hace falta la representación acreditada" tone="warning" live="status">
          <p>
            Solo se admite si ya consta una relación de cuidado o representación viva con la persona del expediente.
            Sin ella, quien dice representar no representa.
          </p>
        </Notice>
      )}

      {externa ? (
        <Field
          name="externalName"
          label="¿Cómo se llama?"
          hint="La empresa, la escuela, la autoridad o la persona de la otra parte."
          required
          {...(errores['personId'] === undefined ? {} : { errors: errores['personId'] })}
        />
      ) : (
        <Select
          name="personId"
          label="¿Quién?"
          hint="Personas del registro que todavía no figuran en este expediente."
          required
          options={[...personas]}
          {...(errores['personId'] === undefined ? {} : { errors: errores['personId'] })}
        />
      )}

      <Notice title={vera ? 'Va a poder ver el expediente' : 'No va a ver el expediente'} tone="accent" live="none">
        <p>
          {vera
            ? 'Desde su portal verá el expediente, sin las notas reservadas del equipo.'
            : 'Figura en el expediente y no lo ve. Lo decide el papel, no una casilla.'}
        </p>
      </Notice>

      <TextArea
        name="reason"
        label="¿Por qué se agrega?"
        hint="Queda en la bitácora del expediente."
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />

      <SubmitButton>{pendiente ? 'Agregando…' : 'Agregar al expediente'}</SubmitButton>
    </form>
  );
}

/** Retirada de un participante, con su motivo. */
export function RemoveParticipantForm({ participantId, nombre }: { participantId: string; nombre: string }) {
  const [estado, accion, pendiente] = useActionState(removeParticipantAction, INICIAL);
  const errores = estado.fieldErrors ?? {};

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Retirada'} />;
  }

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      <input type="hidden" name="participantId" value={participantId} />
      <TextArea
        name="reason"
        label={`¿Por qué deja de figurar ${nombre}?`}
        required
        rows={2}
        {...(errores['reason'] === undefined ? {} : { errors: errores['reason'] })}
      />
      <SubmitButton variant="secondary">{pendiente ? 'Retirando…' : 'Retirar del expediente'}</SubmitButton>
    </form>
  );
}
