'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  ErrorNotice,
  Select,
  SubmitButton,
  SuccessNotice,
  type Option,
} from '@/design-system/primitives';
import { startAssistedApplicationAction, type CapturaAsistidaState } from './actions';

const INICIAL: CapturaAsistidaState = { status: 'idle' };

/**
 * Apertura de una captura asistida (PRD §8.1, paso 2).
 *
 * Sirve para quien no puede hacer el trámite solo. La persona tiene que existir
 * ya en el registro maestro: capturar una solicitud a nombre de alguien que
 * nadie registró crearía la persona por la puerta de atrás, sin comprobación de
 * duplicidad.
 */
export function AssistedStartForm({
  personas,
  calidades,
  territorios,
}: {
  personas: readonly Option[];
  calidades: readonly Option[];
  territorios: readonly Option[];
}) {
  const [estado, accion, pendiente] = useActionState(startAssistedApplicationAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo abrir el borrador'} />}
      {estado.status === 'ok' && (
        <SuccessNotice title={estado.message ?? 'Borrador abierto'}>
          {estado.applicationId !== undefined && (
            <p className="mt-2">
              <Link
                href={`/gestion/afiliacion/solicitudes/${estado.applicationId}`}
                className="underline underline-offset-4"
              >
                Abrir el borrador
              </Link>
            </p>
          )}
        </SuccessNotice>
      )}

      <Select
        name="personId"
        label="Persona que solicita"
        required
        hint="Tiene que estar en el registro maestro. Si no está, regístrala primero."
        options={personas}
        errors={estado.fieldErrors?.['personId']}
      />
      <Select
        name="membershipTypeId"
        label="Calidad"
        required
        options={calidades}
        errors={estado.fieldErrors?.['membershipTypeId']}
      />
      <Select
        name="territorialUnitId"
        label="Unidad territorial"
        hint="Opcional."
        options={territorios}
        placeholder="Sin especificar"
        errors={estado.fieldErrors?.['territorialUnitId']}
      />

      <SubmitButton>{pendiente ? 'Abriendo…' : 'Abrir borrador asistido'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Abriendo el borrador' : ''}
      </p>
    </form>
  );
}
