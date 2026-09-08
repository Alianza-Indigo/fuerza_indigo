'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  addEventMaterial,
  cancelEvent,
  createEvent,
  issueConstancy,
  openEventRegistration,
  publishEvent,
  registerAttendance,
  revokeConstancy,
} from '@/modules/events';
import type { EventKind, EventModality, EventVisibility } from '@prisma-client/enums';
import { currentActor } from '@/platform/http/request-context';
import { withReason } from '@/platform/kernel/actor-context';
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

  const constancyTemplateId = textField(formData, 'constancyTemplateId').trim();
  const issuesConstancy = checkboxField(formData, 'issuesConstancy');

  const values = {
    title: textField(formData, 'title'),
    kind: textField(formData, 'kind'),
    startsAt: textField(formData, 'startsAt'),
    endsAt: textField(formData, 'endsAt'),
    modality: textField(formData, 'modality'),
    venue: textField(formData, 'venue'),
    capacity: capacityRaw,
    visibility: textField(formData, 'visibility'),
    constancyTemplateId,
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
    issuesConstancy,
    constancyTemplateId: issuesConstancy && constancyTemplateId !== '' ? constancyTemplateId : null,
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

export interface RosterState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
}

export async function registerAttendanceAction(_previous: RosterState, formData: FormData): Promise<RosterState> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  const puntajeRaw = textField(formData, 'evaluationScore').trim();
  const resultado = await registerAttendance(actor, {
    registrationId: textField(formData, 'registrationId'),
    attended: textField(formData, 'attended') === 'true',
    evaluationScore: puntajeRaw === '' ? null : Number(puntajeRaw),
  });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath(`/gestion/eventos/${eventId}`);
  return { status: 'ok', message: 'Asistencia registrada.' };
}

export async function issueConstancyAction(_previous: RosterState, formData: FormData): Promise<RosterState> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  const resultado = await issueConstancy(actor, { registrationId: textField(formData, 'registrationId') });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath(`/gestion/eventos/${eventId}`);
  return { status: 'ok', message: `Constancia emitida (folio ${resultado.data.folio}).` };
}

export async function revokeConstancyAction(_previous: RosterState, formData: FormData): Promise<RosterState> {
  const motivo = textField(formData, 'reason').trim();
  const actor = withReason(await currentActor(), motivo);
  const eventId = textField(formData, 'eventId');
  const resultado = await revokeConstancy(actor, { registrationId: textField(formData, 'registrationId') });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath(`/gestion/eventos/${eventId}`);
  return { status: 'ok', message: 'Constancia revocada.' };
}

export async function addMaterialAction(_previous: RosterState, formData: FormData): Promise<RosterState> {
  const actor = await currentActor();
  const eventId = textField(formData, 'eventId');
  const archivo = formData.get('file');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { status: 'error', message: 'Elige un archivo para el material.' };
  }
  const resultado = await addEventMaterial(actor, {
    eventId,
    title: textField(formData, 'title'),
    membersOnly: checkboxField(formData, 'membersOnly'),
    originalFileName: archivo.name,
    mimeType: archivo.type as never,
    content: new Uint8Array(await archivo.arrayBuffer()),
  });
  if (!resultado.ok) return { status: 'error', message: resultado.error.message };
  revalidatePath(`/gestion/eventos/${eventId}`);
  return { status: 'ok', message: 'Material añadido.' };
}
