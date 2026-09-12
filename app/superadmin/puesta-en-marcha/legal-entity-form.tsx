'use client';

import { useActionState } from 'react';
import { ErrorNotice, Field, SubmitButton, SuccessNotice, TextArea } from '@/design-system/primitives';
import type { LegalEntityView } from '@/modules/admin';
import { updateLegalEntityAction, type LegalEntityFormState } from './actions';

const INITIAL: LegalEntityFormState = { status: 'idle' };

export function LegalEntityForm({ entity }: { entity: LegalEntityView }) {
  const [state, action, pending] = useActionState(updateLegalEntityAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="legalEntityId" value={entity.id} />
      <input type="hidden" name="rowVersion" value={entity.rowVersion} />
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo guardar'} />}
      {state.status === 'ok' && <SuccessNotice title={state.message ?? 'Listo'} />}

      <Field name="legalName" label="Nombre jurídico" defaultValue={entity.legalName} required errors={state.fieldErrors?.['legalName']} />
      <Field name="shortName" label="Nombre corto" defaultValue={entity.shortName} required errors={state.fieldErrors?.['shortName']} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="taxId" label="RFC" defaultValue={entity.taxId ?? ''} errors={state.fieldErrors?.['taxId']} />
        <Field
          name="registryNumber"
          label="Número de registro sindical"
          defaultValue={entity.registryNumber ?? ''}
          errors={state.fieldErrors?.['registryNumber']}
        />
      </div>
      <TextArea name="address" label="Domicilio institucional" defaultValue={entity.address} required rows={3} errors={state.fieldErrors?.['address']} />
      <Field name="contactEmail" label="Correo institucional" type="email" defaultValue={entity.contactEmail} required errors={state.fieldErrors?.['contactEmail']} />
      <Field
        name="privacyNoticeUrl"
        label="Dirección pública del aviso de privacidad"
        type="url"
        defaultValue={entity.privacyNoticeUrl ?? ''}
        errors={state.fieldErrors?.['privacyNoticeUrl']}
      />
      <TextArea
        name="reason"
        label="Motivo del alta o actualización"
        required
        rows={2}
        hint="Queda asentado en la bitácora institucional."
        errors={state.fieldErrors?.['reason']}
      />
      <SubmitButton>{pending ? 'Guardando…' : 'Guardar ficha de Fuerza Índigo'}</SubmitButton>
    </form>
  );
}
