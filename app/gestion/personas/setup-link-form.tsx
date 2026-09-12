'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { createAccountSetupLinkAction, type SetupLinkFormState } from './actions';

const INICIAL: SetupLinkFormState = { status: 'idle' };

export function SetupLinkForm({ userId }: { userId: string }) {
  const [estado, accion, pendiente] = useActionState(createAccountSetupLinkAction, INICIAL);

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo generar el enlace'} />}
      {estado.status === 'ok' && estado.setupUrl !== undefined && (
        <SuccessNotice title={estado.message ?? 'Enlace generado'}>
          <code className="mt-2 block max-w-sm break-all text-xs">{estado.setupUrl}</code>
        </SuccessNotice>
      )}
      <SubmitButton variant="secondary">{pendiente ? 'Generando…' : 'Generar enlace de acceso'}</SubmitButton>
    </form>
  );
}
