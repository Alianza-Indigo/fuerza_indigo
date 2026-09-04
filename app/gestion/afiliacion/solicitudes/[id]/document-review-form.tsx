'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { reviewDocumentAction, type RevisionDocumentoState } from '../actions';

const INICIAL: RevisionDocumentoState = { status: 'idle' };

/**
 * Revisión de un documento (PRD §8.1, paso 10; F4-AFI-007).
 *
 * Rechazar exige nota. Devolver un documento sin decir qué le falta obliga a
 * adivinar, y quien adivina manda otra vez lo mismo.
 */
export function DocumentReviewForm({
  documentId,
  applicationId,
}: {
  documentId: string;
  applicationId: string;
}) {
  const [estado, accion, pendiente] = useActionState(reviewDocumentAction, INICIAL);

  if (estado.status === 'ok') {
    return <SuccessNotice title={estado.message ?? 'Documento revisado'} />;
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="applicationId" value={applicationId} />

      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo revisar'} />}

      <TextArea
        name="reviewNote"
        label="Nota"
        rows={2}
        hint="Obligatoria si lo rechazas: di qué le falta."
        errors={estado.fieldErrors?.['reviewNote']}
      />

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="ACCEPTED">
          {pendiente ? 'Guardando…' : 'Aceptar'}
        </SubmitButton>
        <SubmitButton variant="danger" name="decision" value="REJECTED">
          Rechazar
        </SubmitButton>
      </div>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Guardando la revisión' : ''}
      </p>
    </form>
  );
}
