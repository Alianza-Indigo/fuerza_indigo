'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { cancelRegistrationAction, payEventAction, registerAction, type InscripcionState } from './actions';

const INICIAL: InscripcionState = { status: 'idle' };

export function RegisterButton({ eventId }: { eventId: string }) {
  const [estado, accion, pendiente] = useActionState(registerAction, INICIAL);
  return (
    <form action={accion} className="space-y-2">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo inscribir'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      {estado.status !== 'ok' && (
        <>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton>{pendiente ? 'Inscribiendo…' : 'Inscribirme'}</SubmitButton>
        </>
      )}
    </form>
  );
}

export function PayButton({ eventId }: { eventId: string }) {
  const [estado, accion, pendiente] = useActionState(payEventAction, INICIAL);
  return (
    <form action={accion} className="space-y-2">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo iniciar el pago'} />}
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton>{pendiente ? 'Abriendo el pago…' : 'Pagar mi inscripción'}</SubmitButton>
    </form>
  );
}

export function CancelButton({ eventId }: { eventId: string }) {
  const [estado, accion, pendiente] = useActionState(cancelRegistrationAction, INICIAL);
  return (
    <form action={accion} className="space-y-2">
      {estado.status === 'error' && <ErrorNotice title={estado.message ?? 'No se pudo cancelar'} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Listo'} />}
      {estado.status !== 'ok' && (
        <>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="secondary">{pendiente ? 'Cancelando…' : 'Cancelar mi inscripción'}</SubmitButton>
        </>
      )}
    </form>
  );
}
