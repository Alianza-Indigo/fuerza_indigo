'use server';

import { revalidatePath } from 'next/cache';
import { saveMapLocation } from '@/modules/network-map';
import { currentActor } from '@/platform/http/request-context';
import { textField } from '@/platform/http/form-fields';

export interface MapFormState { status: 'idle' | 'ok' | 'error'; message?: string; fieldErrors?: Record<string, string[]> }
export async function saveMapAction(_previous: MapFormState, formData: FormData): Promise<MapFormState> {
  const actor = await currentActor();
  const optional = (name: string) => textField(formData, name).trim() || null;
  const coordinate = (name: string) => { const value = optional(name); return value === null ? null : Number(value); };
  const result = await saveMapLocation(actor, {
    subjectKey: textField(formData, 'subjectKey'), category: textField(formData, 'category'),
    enabled: formData.get('enabled') === 'on', latitude: coordinate('latitude'), longitude: coordinate('longitude'),
    address: optional('address'), city: optional('city'), state: optional('state'), contactName: optional('contactName'),
    email: optional('email'), phone: optional('phone'), website: optional('website'),
  });
  if (!result.ok) return { status: 'error', message: result.error.message, ...(result.error.details ? { fieldErrors: result.error.details } : {}) };
  for (const path of ['/', '/mapa', '/superadmin/mapa', '/delegaciones', '/agremiados-honorarios']) revalidatePath(path);
  return { status: 'ok', message: 'Ubicación y contactos guardados.' };
}
