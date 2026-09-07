'use client';

import { useActionState } from 'react';
import { ErrorNotice, Notice, Select, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import { sendCampaignAction, type CampanaState } from './actions';

const INICIAL: CampanaState = { status: 'idle' };

/**
 * Envío de una campaña a los miembros activos de la entidad.
 *
 * Solo ofrece plantillas publicadas y no obligatorias —las obligatorias no se
 * envían como difusión—. El motivo es obligatorio: enviar a muchas personas es un
 * acto que se explica.
 */
export function CampaignForm({
  legalEntityId,
  plantillas,
}: {
  legalEntityId: string;
  plantillas: { value: string; label: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(sendCampaignAction, INICIAL);

  if (plantillas.length === 0) {
    return (
      <Notice tone="neutral" title="No hay ninguna plantilla publicada para campañas">
        <p>Redacta y publica una plantilla de correo que no sea de gobierno obligatorio, y podrás enviarla como campaña.</p>
      </Notice>
    );
  }

  return (
    <form action={accion} className="space-y-5">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo enviar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Enviada'} />}

      <input type="hidden" name="legalEntityId" value={legalEntityId} />

      <Select
        name="templateCode"
        label="Plantilla"
        hint="Solo plantillas de correo publicadas y no obligatorias."
        required
        options={plantillas}
        errors={estado.fieldErrors?.['templateCode']}
      />

      <TextArea
        name="reason"
        label="Motivo del envío"
        required
        rows={2}
        hint="Queda en la bitácora. Enviar alcanza a muchas personas a la vez."
        errors={estado.fieldErrors?.['reason']}
      />

      <Notice tone="neutral" title="Quién lo recibe">
        <p>
          Los miembros activos de tu entidad con correo. A quien silenció esta clase por correo no se le envía; el aviso
          le queda en su centro si no lo silenció también ahí.
        </p>
      </Notice>

      <SubmitButton>{pendiente ? 'Enviando…' : 'Enviar la campaña'}</SubmitButton>
      <p aria-live="polite" className="sr-only">{pendiente ? 'Enviando' : ''}</p>
    </form>
  );
}
