'use client';

import { useActionState, useState } from 'react';
import { ErrorNotice, Field, RadioGroup, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { advanceFilingAction, type TramiteState } from './actions';
import { AVANCES } from '../padrones/etiquetas';

const INICIAL: TramiteState = { status: 'idle' };

/**
 * Hacer avanzar un trámite.
 *
 * Los campos aparecen según lo que se elija: la referencia de la autoridad solo
 * tiene sentido en un acuse, y la explicación solo cuando se descarta la
 * obligación. Pedirlos siempre haría que la mayoría de las veces quedaran
 * vacíos, y un campo que casi siempre está vacío deja de leerse.
 */
export function FilingForm({ filingId }: { filingId: string }) {
  const [estado, accion, pendiente] = useActionState(advanceFilingAction, INICIAL);
  const [avance, setAvance] = useState(estado.values?.['status'] ?? '');

  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Trámite actualizado'} />;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="filingId" value={filingId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo actualizar'} />}

      <RadioGroup
        name="status"
        legend="En qué punto queda"
        options={AVANCES.map((uno) => ({ value: uno.value, label: uno.label, hint: uno.hint }))}
        value={avance}
        onChange={setAvance}
        errors={estado.fieldErrors?.['status']}
      />

      {avance === 'ACKNOWLEDGED' && (
        <Field
          name="authorityReference"
          label="Número de trámite o acuse"
          required
          hint="Es lo que se enseña cuando alguien pregunta si se informó."
          defaultValue={estado.values?.['authorityReference']}
          errors={estado.fieldErrors?.['authorityReference']}
        />
      )}

      {avance === 'NOT_REQUIRED' && (
        <TextArea
          name="notes"
          label="Por qué no hacía falta informarlo"
          required
          rows={3}
          hint="Queda en el expediente para que alguien pueda revisarlo después."
          defaultValue={estado.values?.['notes']}
          errors={estado.fieldErrors?.['notes']}
        />
      )}

      <SubmitButton>{pendiente ? 'Guardando…' : 'Guardar el avance'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando' : ''}</p>
    </form>
  );
}
