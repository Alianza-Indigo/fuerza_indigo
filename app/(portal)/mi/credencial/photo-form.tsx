'use client';

import { useActionState } from 'react';

import { ErrorNotice, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { setOwnCredentialPhotoAction, type FotoCredencialState } from './actions';

const INICIAL: FotoCredencialState = { status: 'idle' };

export function OwnCredentialPhotoForm({
  credentialId,
  hasPhoto,
}: {
  readonly credentialId: string;
  readonly hasPhoto: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(setOwnCredentialPhotoAction, INICIAL);
  const inputId = `foto-${credentialId}`;

  return (
    <form action={accion} encType="multipart/form-data" className="space-y-3 rounded-lg border border-[var(--color-line)] p-4">
      <input type="hidden" name="credentialId" value={credentialId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo guardar la fotografía'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Fotografía guardada'} />}
      <div>
        <label htmlFor={inputId} className="block font-medium">
          {hasPhoto ? 'Actualizar mi fotografía' : 'Subir mi fotografía'}
        </label>
        <p id={`${inputId}-ayuda`} className="text-sm text-[var(--color-ink-soft)]">
          Usa una fotografía frontal, reciente y con el rostro visible. JPG, PNG o WebP, máximo 5 MB.
        </p>
      </div>
      <input
        id={inputId}
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        aria-describedby={`${inputId}-ayuda`}
        className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-[var(--color-line-strong)] file:bg-[var(--color-surface)] file:px-3 file:font-medium"
      />
      {estado.fieldErrors?.['photo']?.map((error) => (
        <p key={error} className="text-sm text-[var(--color-danger)]">{error}</p>
      ))}
      <SubmitButton variant="secondary">
        {pendiente ? 'Guardando…' : hasPhoto ? 'Actualizar fotografía' : 'Guardar fotografía'}
      </SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Guardando fotografía' : ''}</p>
    </form>
  );
}
