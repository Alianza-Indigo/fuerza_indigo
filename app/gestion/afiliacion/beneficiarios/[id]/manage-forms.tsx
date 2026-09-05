'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Notice,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import { closeBeneficiaryAction, updateBeneficiaryAction, type BeneficiariaFormState } from '../actions';
import { ESTADO_DE_ATENCION, PRIVACIDAD, URGENCIA } from '../../etiquetas';

const INICIAL: BeneficiariaFormState = { status: 'idle' };

const URGENCIAS: readonly Option[] = ['ROUTINE', 'PRIORITY', 'URGENT'].map((value) => ({
  value,
  label: URGENCIA[value] ?? value,
}));

const ESTADOS: readonly Option[] = ['REGISTERED', 'IN_ATTENTION', 'REFERRED'].map((value) => ({
  value,
  label: ESTADO_DE_ATENCION[value] ?? value,
}));

const PRIVACIDADES: readonly Option[] = ['REINFORCED', 'STANDARD'].map((value) => ({
  value,
  label: PRIVACIDAD[value] ?? value,
}));

/**
 * Seguimiento de una atención (PRD §3.4).
 *
 * Bajar la privacidad a estándar exige explicarlo, y para una persona menor de
 * edad el caso de uso lo rechaza sin excepción. Por eso el campo de motivo
 * aparece en cuanto se elige «estándar»: pedirlo después de guardar sería
 * pedirlo cuando ya no sirve.
 */
export function BeneficiaryManageForm({
  beneficiaryId,
  personas,
  territorios,
  actual,
}: {
  beneficiaryId: string;
  personas: readonly Option[];
  territorios: readonly Option[];
  actual: {
    urgencyLevel: string;
    status: string;
    territorialUnitId: string;
    responsiblePersonId: string;
    privacyLevel: string;
  };
}) {
  const [estado, accion, pendiente] = useActionState(updateBeneficiaryAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo actualizar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Registro actualizado'} />}

      <Select
        name="status"
        label="Estado de la atención"
        required
        options={ESTADOS}
        defaultValue={actual.status}
        errors={estado.fieldErrors?.['status']}
      />
      <Select
        name="urgencyLevel"
        label="Urgencia"
        required
        options={URGENCIAS}
        defaultValue={actual.urgencyLevel}
        errors={estado.fieldErrors?.['urgencyLevel']}
      />
      <Select
        name="territorialUnitId"
        label="Territorio"
        options={territorios}
        defaultValue={actual.territorialUnitId}
        placeholder="Sin especificar"
        errors={estado.fieldErrors?.['territorialUnitId']}
      />
      <Select
        name="responsiblePersonId"
        label="Persona responsable"
        options={personas}
        defaultValue={actual.responsiblePersonId}
        placeholder="Ninguna"
        errors={estado.fieldErrors?.['responsiblePersonId']}
      />
      <Select
        name="privacyLevel"
        label="Privacidad"
        required
        options={PRIVACIDADES}
        defaultValue={actual.privacyLevel}
        errors={estado.fieldErrors?.['privacyLevel']}
      />

      <TextArea
        name="privacyChangeReason"
        label="Por qué se baja la privacidad"
        rows={2}
        hint="Obligatorio solo si pasas de reforzada a estándar. Nunca se puede para una persona menor de edad."
        errors={estado.fieldErrors?.['privacyChangeReason']}
      />

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar cambios'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}

/** Cierre de la atención. */
export function CloseBeneficiaryForm({ beneficiaryId }: { beneficiaryId: string }) {
  const [estado, accion, pendiente] = useActionState(closeBeneficiaryAction, INICIAL);

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Atención cerrada'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo cerrar'} />}

      <Notice tone="neutral" title="Cerrar no borra nada">
        <p>El registro queda con su historial. Si la persona vuelve, se abre una atención nueva.</p>
      </Notice>

      <Select
        name="outcome"
        label="Cómo termina"
        required
        options={[
          { value: 'CLOSED', label: 'Cerrada', hint: 'La atención terminó.' },
          { value: 'ARCHIVED', label: 'Archivada', hint: 'Sin actividad y sin desenlace conocido.' },
        ]}
        errors={estado.fieldErrors?.['outcome']}
      />
      <TextArea
        name="closeReason"
        label="Cómo terminó"
        required
        rows={3}
        errors={estado.fieldErrors?.['closeReason']}
      />

      <SubmitButton variant="danger">{pendiente ? 'Cerrando…' : 'Cerrar la atención'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Cerrando' : ''}</p>
    </form>
  );
}
