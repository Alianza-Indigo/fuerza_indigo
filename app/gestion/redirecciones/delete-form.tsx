'use client';

import { useActionState } from 'react';
import { ErrorNotice, SubmitButton } from '@/design-system/primitives';
import { deleteRedirectAction, type RedirectState } from './actions';

const INICIAL: RedirectState = { status: 'idle' };

/** Borrado de una redirección. Un formulario por fila, para que funcione sin JavaScript. */
export function DeleteRedirectForm({ redirectId, fromSlug }: { redirectId: string; fromSlug: string }) {
  const [estado, accion, pendiente] = useActionState(deleteRedirectAction, INICIAL);

  return (
    <form action={accion}>
      <input type="hidden" name="redirectId" value={redirectId} />
      <SubmitButton variant="secondary">
        {pendiente ? 'Borrando…' : 'Borrar'}
        <span className="sr-only"> la redirección de {fromSlug}</span>
      </SubmitButton>
      {estado.status === 'error' && estado.message !== undefined && (
        <div className="mt-2">
          <ErrorNotice title={estado.message} />
        </div>
      )}
    </form>
  );
}
