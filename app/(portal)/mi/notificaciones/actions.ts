'use server';

import { revalidatePath } from 'next/cache';
import {
  archiveNotification,
  isMandatoryCategory,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_CATEGORIES,
  setNotificationPreferences,
} from '@/modules/notifications';
import { currentActor } from '@/platform/http/request-context';
import { checkboxField, textField } from '@/platform/http/form-fields';

/**
 * Lo que cada persona hace con sus propios avisos y sus preferencias (PRD §16.2).
 *
 * Nada de esto exige un cargo: es el buzón de quien entró. Cada acción vuelve a
 * resolver quién está delante y trabaja solo sobre lo suyo; el caso de uso
 * responde «no encontrado» a un aviso ajeno, así que aquí no hace falta repetir
 * la comprobación.
 *
 * Marcar y archivar son gestos simples y funcionan sin JavaScript: son
 * formularios que recargan la lista. Guardar preferencias sí devuelve un acuse,
 * y por eso pasa por `useActionState`.
 */

export async function markReadAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  await markNotificationRead(actor, textField(formData, 'notificationId'));
  revalidatePath('/mi/notificaciones');
}

export async function markAllReadAction(): Promise<void> {
  const actor = await currentActor();
  await markAllNotificationsRead(actor);
  revalidatePath('/mi/notificaciones');
}

export async function archiveAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  await archiveNotification(actor, textField(formData, 'notificationId'));
  revalidatePath('/mi/notificaciones');
}

export interface PreferenciasState {
  readonly status: 'idle' | 'error' | 'ok';
  readonly message?: string;
}

/**
 * Guarda las preferencias del centro. Cada casilla marcada es «quiero ver esta
 * clase»; sin marcar, «no quiero verla». La obligatoria no tiene casilla y no
 * viaja en el envío: no se puede silenciar.
 */
export async function savePreferencesAction(
  _previous: PreferenciasState,
  formData: FormData,
): Promise<PreferenciasState> {
  const actor = await currentActor();
  if (actor.personId === null) {
    return { status: 'error', message: 'Para cambiar tus preferencias necesitas entrar con tu cuenta.' };
  }

  const opcionales = NOTIFICATION_CATEGORIES.filter((category) => !isMandatoryCategory(category));
  const entriesCentro = opcionales.map((category) => ({
    category,
    suppressed: !checkboxField(formData, `receive:${category}`),
  }));
  const entriesWeb = opcionales.map((category) => ({
    category,
    suppressed: !checkboxField(formData, `web:${category}`),
  }));

  const centro = await setNotificationPreferences(actor, { channel: 'IN_APP', entries: entriesCentro });
  if (!centro.ok) return { status: 'error', message: centro.error.message };
  const web = await setNotificationPreferences(actor, { channel: 'WEB_PUSH', entries: entriesWeb });
  if (!web.ok) return { status: 'error', message: web.error.message };

  revalidatePath('/mi/notificaciones');
  const cambios = centro.data.changed + web.data.changed;
  return {
    status: 'ok',
    message:
      cambios === 0
        ? 'No cambiaste nada: tus preferencias ya estaban así.'
        : 'Guardamos tus preferencias. Tu centro y tus avisos web ya solo muestran lo que pediste.',
  };
}
