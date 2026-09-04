import { cookies } from 'next/headers';
import { db } from '@/platform/db/client';
import { currentActor } from '@/platform/http/request-context';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_COOKIE,
  PREFERENCES_MAX_AGE_SECONDS,
  preferencesSchema,
  readPreferences,
  type Preferences,
} from './preferences';

/**
 * Resolución de las preferencias en el servidor.
 *
 * Se resuelven **antes** de renderizar y se aplican como atributos en `<html>`.
 * La alternativa habitual —leerlas en el navegador y aplicarlas después— produce
 * un parpadeo: la página aparece un instante con el tema y el tamaño que la
 * persona no quiere. Para alguien con sensibilidad a la luz o al movimiento, ese
 * instante es justo el daño que la preferencia existía para evitar.
 */

export async function currentPreferences(): Promise<Preferences> {
  const actor = await currentActor();

  // Con sesión iniciada mandan las guardadas: viajan con la persona.
  if (actor.personId !== null) {
    const persona = await db().person.findUnique({
      where: { id: actor.personId },
      select: { accessibilityPreferences: true },
    });
    if (persona !== null) return readPreferences(persona.accessibilityPreferences);
  }

  const galleta = (await cookies()).get(PREFERENCES_COOKIE)?.value;
  return galleta === undefined ? DEFAULT_PREFERENCES : readPreferences(galleta);
}

/**
 * Guarda las preferencias donde corresponda.
 *
 * La cookie se escribe siempre, incluso con sesión iniciada: si la persona cierra
 * sesión, sus ajustes no desaparecen del dispositivo que está usando.
 */
export async function savePreferences(input: unknown): Promise<Preferences> {
  const preferencias = preferencesSchema.parse(readPreferences(input));
  const actor = await currentActor();

  if (actor.personId !== null) {
    await db().person.update({
      where: { id: actor.personId },
      data: { accessibilityPreferences: { ...preferencias } },
    });
  }

  (await cookies()).set(PREFERENCES_COOKIE, JSON.stringify(preferencias), {
    httpOnly: false, // No es un secreto y el cliente puede necesitar leerla.
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PREFERENCES_MAX_AGE_SECONDS,
  });

  return preferencias;
}
