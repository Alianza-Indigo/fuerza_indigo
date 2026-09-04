'use client';

import { useActionState } from 'react';
import { ErrorNotice, Select, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { attachDocumentAction, type DocumentoFormState } from '../actions';
import { TIPO_DE_DOCUMENTO } from '../etiquetas';

const INICIAL: DocumentoFormState = { status: 'idle' };

const OPCIONES = Object.entries(TIPO_DE_DOCUMENTO).map(([value, label]) => ({ value, label }));

/** Adjuntar un documento a la solicitud propia (PRD §8.1, paso 6). */
export function DocumentForm({ applicationId }: { applicationId: string }) {
  const [estado, accion, pendiente] = useActionState(attachDocumentAction, INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="applicationId" value={applicationId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo adjuntar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Documento adjuntado'} />}

      <Select
        name="documentKind"
        label="Qué es este documento"
        required
        options={OPCIONES}
        errors={estado.fieldErrors?.['documentKind']}
      />

      <div className="space-y-1.5">
        <label htmlFor="file" className="block text-sm font-medium">
          Archivo
        </label>
        <p id="file-ayuda" className="text-sm text-[var(--color-ink-soft)]">
          PDF o imagen. Se guarda en privado y solo lo ve quien revisa tu solicitud.
        </p>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg"
          aria-describedby="file-ayuda"
          className="min-h-11 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 py-2"
        />
        {estado.fieldErrors?.['file'] !== undefined && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {estado.fieldErrors['file'].join(' ')}
          </p>
        )}
      </div>

      <SubmitButton>{pendiente ? 'Subiendo…' : 'Adjuntar documento'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Subiendo el documento' : ''}
      </p>
    </form>
  );
}
