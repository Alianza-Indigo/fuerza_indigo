'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { closeOthersAction, closeSessionAction, type SessionActionState } from './actions';

const INITIAL: SessionActionState = { status: 'idle' };

export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(closeSessionAction, INITIAL);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        className="min-h-11 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-indigo-50)]"
      >
        {pending ? 'Cerrando…' : 'Cerrar'}
      </button>
      {state.status === 'error' && <span className="ml-2 text-sm text-[var(--color-danger)]">{state.message}</span>}
    </form>
  );
}

export function CloseOtherSessionsForm() {
  const [state, formAction, pending] = useActionState(closeOthersAction, INITIAL);

  return (
    <div className="space-y-3">
      {state.status === 'error' && <ErrorNotice title={state.message ?? 'No se pudo completar la acción.'} />}
      {state.status === 'done' && <SuccessNotice title={state.message ?? 'Listo.'} />}
      <form action={formAction}>
        <SubmitButton variant="secondary">
          {pending ? 'Cerrando…' : 'Cerrar todas las demás sesiones'}
        </SubmitButton>
      </form>
      <p className="text-sm text-[var(--color-ink-soft)]">
        Úsalo si crees que alguien más entró a tu cuenta. Tu sesión actual seguirá abierta.
      </p>
    </div>
  );
}
