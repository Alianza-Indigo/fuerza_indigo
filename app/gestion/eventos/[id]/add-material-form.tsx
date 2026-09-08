'use client';

import { useActionState } from 'react';
import { Checkbox, Field, SubmitButton } from '@/design-system/primitives';
import { addMaterialAction, type RosterState } from '../actions';

const INICIAL: RosterState = { status: 'idle' };

const ACEPTA =
  'application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Alta de un material del evento. Sube un archivo y decide si es reservado a
 * inscritos. Funciona sin JavaScript: es un formulario que recarga el detalle.
 */
export function AddMaterialForm({ eventId }: { eventId: string }) {
  const [estado, enviar] = useActionState(addMaterialAction, INICIAL);

  return (
    <form action={enviar} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="eventId" value={eventId} />
      <Field name="title" label="Título del material" required />
      <div className="space-y-1.5">
        <label htmlFor="file" className="block text-sm font-medium">
          Archivo
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept={ACEPTA}
          className="block w-full text-sm"
        />
        <p className="text-sm text-[var(--color-ink-soft)]">PDF, imagen o documento de ofimática.</p>
      </div>
      <Checkbox
        name="membersOnly"
        label="Reservado a inscritos"
        help="Si se marca, solo quien está inscrito al evento puede descargarlo."
        defaultChecked
      />
      <SubmitButton>Añadir material</SubmitButton>
      {estado.status === 'error' && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">{estado.message}</p>
      )}
      {estado.status === 'ok' && (
        <p role="status" className="text-sm text-[var(--color-ink-soft)]">{estado.message}</p>
      )}
    </form>
  );
}
