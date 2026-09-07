'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cancelEvent, createEvent, openEventRegistration, publishEvent } from '@/modules/events';
import type { EventKind, EventModality, EventVisibility } from '@prisma-client/enums';
import { currentActor } from '@/platform/http/request-context';
import { checkboxField, textField } from '@/platform/http/form-fields';

export interface EventoState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly values?: Record<string, string>;
}

export async function createEventAction(_previous: EventoState, formData: FormData): Promise<EventoState> {
  const actor = await currentActor();
  const legalEntityId = textField(formData, 'legalEntityId');
  const capacityRaw = textField(formData, 'capacity').trim();

  const values = {
    title: textField(formData, 'title'),
    kind: textField(formData, 'kind'),
    startsAt: textField(formData, 'startsAt'),
    endsAt: textField(formData, 'endsAt'),
    modality: textField(formData, 'modality'),
    venue: textField(formData, 'venue'),
    capacity: capacityRaw,
    visibility: textField(formData, 'visibility'),
  };

  const resultado = await createEvent(actor, {
    title: values.title,
    kind: values.kind as EventKind,
    legalEntityId,
    territorialUnitId: null,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    modality: values.modality as EventModality,
    venue: values.venue.trim() === '' ? null : values.venue.trim(),
    capacity: capacityRaw === '' ? null : Number(capacityRaw),
    visibility: values.visibility as EventVisibility,
    membersOnly: checkboxField(formData, 'membersOnly'),
    catalogProductId: null,
    issuesConstancy: false,
    constancyTemplateId: null,
  });

  if (!resultado.ok) {
    return {
      status: 'error',
      message: resultado.error.message,
      values,
      ...(resultado.error.details === undefined ? {} : { fieldErrors: resultado.error.details }),
    };
  }
  redirect(`/gestion/eventos/${resultado.data.eventId}`);
}

export async function publishEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  await publishEvent(actor, { eventId });
  revalidatePath(`/gestion/eventos/${eventId}`);
}

export async function openRegistrationAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  await openEventRegistration(actor, { eventId });
  revalidatePath(`/gestion/eventos/${eventId}`);
}

export async function cancelEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  await cancelEvent(actor, { eventId });
  revalidatePath(`/gestion/eventos/${eventId}`);
}
