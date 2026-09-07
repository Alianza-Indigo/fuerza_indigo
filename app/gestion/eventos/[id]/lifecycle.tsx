'use client';

import { SubmitButton } from '@/design-system/primitives';
import { cancelEventAction, openRegistrationAction, publishEventAction } from '../actions';

/**
 * Los cambios de estado de un evento. Cada uno es un formulario que recarga el
 * detalle; funcionan sin JavaScript.
 */
export function EventLifecycle({ eventId, status }: { eventId: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'DRAFT' && (
        <form action={publishEventAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton>Publicar</SubmitButton>
        </form>
      )}
      {status === 'PUBLISHED' && (
        <form action={openRegistrationAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton>Abrir inscripción</SubmitButton>
        </form>
      )}
      {status !== 'CANCELLED' && status !== 'COMPLETED' && (
        <form action={cancelEventAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="danger">Cancelar evento</SubmitButton>
        </form>
      )}
    </div>
  );
}
