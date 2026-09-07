'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { publishTemplateAction, retireTemplateAction, type PlantillaState } from '../actions';

const INICIAL: PlantillaState = { status: 'idle' };

/**
 * Publicar o retirar una versión de plantilla (PRD §16.2).
 *
 * Los dos actos llevan motivo, y por eso cada formulario tiene su propio campo
 * «motivo» con un identificador distinto: dos campos con el mismo `id` dejarían
 * al segundo sin etiqueta para quien usa lector de pantalla.
 */
export function PublishTemplate({ templateId }: { templateId: string }) {
  const [estado, accion, pendiente] = useActionState(publishTemplateAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Publicada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo publicar'} />}
      <input type="hidden" name="templateId" value={templateId} />
      <TextArea
        name="reason"
        id="publish-reason"
        label="Motivo de la publicación"
        required
        rows={2}
        hint="Queda en la bitácora. Publicar retira la versión publicada anterior de este código."
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton>{pendiente ? 'Publicando…' : 'Publicar esta versión'}</SubmitButton>
    </form>
  );
}

export function RetireTemplate({ templateId }: { templateId: string }) {
  const [estado, accion, pendiente] = useActionState(retireTemplateAction, INICIAL);
  if (estado.status === 'ok') return <SuccessNotice title={estado.message ?? 'Retirada'} />;

  return (
    <form action={accion} className="space-y-3">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo retirar'} />}
      <input type="hidden" name="templateId" value={templateId} />
      <TextArea
        name="reason"
        id="retire-reason"
        label="Motivo del retiro"
        required
        rows={2}
        hint="Queda en la bitácora. Al retirarla, ningún envío la tomará."
        errors={estado.fieldErrors?.['reason']}
      />
      <SubmitButton variant="danger">{pendiente ? 'Retirando…' : 'Retirar esta plantilla'}</SubmitButton>
    </form>
  );
}
