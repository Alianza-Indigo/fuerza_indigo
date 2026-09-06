'use client';

import { useActionState } from 'react';
import {
  ErrorNotice,
  Field,
  Select,
  SubmitButton,
  SuccessNotice,
  TextArea,
  type Option,
} from '@/design-system/primitives';
import { advanceObligationAction, openObligationAction, type ComplianceFormState } from './actions';

const INICIAL: ComplianceFormState = { status: 'idle' };

const TIPOS: readonly Option[] = [
  { value: 'MEMBER_REGISTRY_UPDATE', label: 'Actualización del padrón' },
  { value: 'LEADERSHIP_CHANGE', label: 'Cambio de dirigencia' },
  { value: 'STATUTE_AMENDMENT', label: 'Reforma estatutaria' },
  { value: 'FINANCIAL_REPORT', label: 'Informe financiero' },
  { value: 'OTHER', label: 'Otra' },
];

function Aviso({ estado }: { estado: ComplianceFormState }) {
  return (
    <>
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo completar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
    </>
  );
}

/** Alta de una obligación. */
export function OpenObligationForm({ entidades }: { entidades: readonly Option[] }) {
  const [estado, accion, pendiente] = useActionState(openObligationAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <Aviso estado={estado} />

      <Select
        name="legalEntityId"
        label="Entidad jurídica"
        required
        options={entidades}
        errors={estado.fieldErrors?.['legalEntityId']}
      />
      <Select name="kind" label="Tipo" required options={TIPOS} errors={estado.fieldErrors?.['kind']} />
      <Field
        name="triggerEventRef"
        label="Acto que la origina"
        required
        hint="La asamblea que cambió la dirigencia, la reforma aprobada, el ejercicio que cierra. Quien la revise dentro de dos años necesita saber por qué existía."
        errors={estado.fieldErrors?.['triggerEventRef']}
      />
      <Field name="dueOn" label="Vence el" type="date" required errors={estado.fieldErrors?.['dueOn']} />

      <SubmitButton>{pendiente ? 'Registrando…' : 'Registrar la obligación'}</SubmitButton>
    </form>
  );
}

/** Avance de una obligación, con su acuse. */
export function AdvanceObligationForm({ obligationId }: { obligationId: string }) {
  const [estado, accion, pendiente] = useActionState(advanceObligationAction, INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="obligationId" value={obligationId} />
      <Aviso estado={estado} />

      <Select
        name="status"
        label="Estado"
        required
        options={[
          { value: 'PREPARED', label: 'Preparada' },
          { value: 'SUBMITTED', label: 'Presentada — exige acuse' },
          { value: 'ACKNOWLEDGED', label: 'Acusada de recibo' },
          { value: 'OBSERVED', label: 'Observada por la autoridad' },
          { value: 'CLOSED', label: 'Cerrada' },
        ]}
        errors={estado.fieldErrors?.['status']}
      />
      <Field
        name="authorityReference"
        label="Referencia de la autoridad"
        errors={estado.fieldErrors?.['authorityReference']}
      />

      <div className="space-y-1.5">
        <label htmlFor={`acuse-${obligationId}`} className="block text-sm font-medium">
          Acuse o documento
        </label>
        <p id={`acuse-ayuda-${obligationId}`} className="text-sm text-[var(--color-ink-soft)]">
          Obligatorio para dar por presentada la obligación. Sin acuse, «presentada» es una intención.
        </p>
        <input
          id={`acuse-${obligationId}`}
          type="file"
          name="evidence"
          aria-describedby={`acuse-ayuda-${obligationId}`}
          className="block w-full text-sm"
        />
        {estado.fieldErrors?.['evidence'] !== undefined && (
          <ul className="space-y-1 text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['evidence'].map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
      </div>

      <TextArea name="note" label="Nota" required rows={2} errors={estado.fieldErrors?.['note']} />

      <SubmitButton variant="secondary">{pendiente ? 'Guardando…' : 'Actualizar'}</SubmitButton>
    </form>
  );
}
