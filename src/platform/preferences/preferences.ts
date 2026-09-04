import { z } from 'zod';

/**
 * Preferencias sensoriales y de lectura (PRD §5.3).
 *
 * Cuatro ejes independientes. Cada uno responde a una barrera distinta y por eso
 * no se agrupan en un «modo accesible» único: quien necesita texto grande no
 * necesariamente quiere menos movimiento, y ofrecerlo todo junto obliga a
 * aceptar cambios que no pidió.
 *
 * Se guardan de dos formas según quién navega. Con sesión iniciada viven en
 * `Person.accessibilityPreferences` y viajan con la persona a cualquier
 * dispositivo. Sin sesión viven en una cookie del navegador, porque una persona
 * que aún no se ha afiliado también necesita leer el sitio, y pedirle una cuenta
 * para poder ampliar el texto sería exactamente al revés.
 */

export const preferencesSchema = z.object({
  /** Escala del texto. La ampliación del navegador funciona encima de esta. */
  text: z.enum(['normal', 'grande', 'mayor']).default('normal'),
  /** Densidad del espaciado. */
  density: z.enum(['normal', 'amplia', 'compacta']).default('normal'),
  /** Movimiento. `sistema` respeta lo que declare el sistema operativo. */
  motion: z.enum(['sistema', 'reducido']).default('sistema'),
  /** Modo de enfoque: atenúa lo secundario sin quitarlo de la página. */
  focus: z.enum(['inactivo', 'activo']).default('inactivo'),
  /** Tema. `sistema` respeta la preferencia del sistema operativo. */
  theme: z.enum(['sistema', 'claro', 'oscuro']).default('sistema'),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  text: 'normal',
  density: 'normal',
  motion: 'sistema',
  focus: 'inactivo',
  theme: 'sistema',
};

export const PREFERENCES_COOKIE = 'fi_prefs';

/** Un año: la preferencia de accesibilidad de alguien no caduca en una semana. */
export const PREFERENCES_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Lee unas preferencias de origen desconocido.
 *
 * Nunca lanza y nunca devuelve un valor parcial: un eje ilegible cae a su valor
 * por omisión y los demás se conservan. Una cookie manipulada o unas
 * preferencias guardadas por una versión anterior no pueden dejar el sitio sin
 * renderizar.
 */
export function readPreferences(raw: unknown): Preferences {
  if (typeof raw === 'string') {
    try {
      return readPreferences(JSON.parse(raw));
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES;

  const parsed = preferencesSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // Rescate por eje: se conserva lo que sí es válido.
  const entrada = raw as Record<string, unknown>;
  const rescatado: Record<string, unknown> = {};
  for (const eje of ['text', 'density', 'motion', 'focus', 'theme'] as const) {
    const valor = preferencesSchema.shape[eje].safeParse(entrada[eje]);
    if (valor.success) rescatado[eje] = valor.data;
  }
  return preferencesSchema.parse(rescatado);
}

/**
 * Atributos para la etiqueta `<html>`.
 *
 * Los ejes en su valor por omisión **no** se emiten. Emitirlos llenaría el
 * marcado de `data-text="normal"` sin efecto, y haría más difícil ver de un
 * vistazo qué se apartó de lo estándar.
 */
export function preferenceAttributes(preferences: Preferences): Record<string, string> {
  const atributos: Record<string, string> = {};
  if (preferences.text !== 'normal') atributos['data-text'] = preferences.text;
  if (preferences.density !== 'normal') atributos['data-density'] = preferences.density;
  if (preferences.motion !== 'sistema') atributos['data-motion'] = preferences.motion;
  if (preferences.focus !== 'inactivo') atributos['data-focus'] = preferences.focus;
  if (preferences.theme !== 'sistema') {
    atributos['data-theme'] = preferences.theme === 'claro' ? 'light' : 'dark';
  }
  return atributos;
}

/** Descripción en lenguaje claro de cada opción, para el centro de accesibilidad. */
export const PREFERENCE_LABELS = {
  text: {
    legend: 'Tamaño del texto',
    help: 'La ampliación de tu navegador sigue funcionando encima de esta opción.',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'grande', label: 'Grande' },
      { value: 'mayor', label: 'Mayor' },
    ],
  },
  density: {
    legend: 'Espacio entre los elementos',
    help: 'Más espacio facilita distinguir cada bloque; menos espacio muestra más de una vez.',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'amplia', label: 'Más espacio' },
      { value: 'compacta', label: 'Más compacto' },
    ],
  },
  motion: {
    legend: 'Movimiento',
    help: 'Si tu sistema ya pide reducir el movimiento, lo respetamos aunque elijas «Como mi sistema».',
    options: [
      { value: 'sistema', label: 'Como mi sistema' },
      { value: 'reducido', label: 'Reducir el movimiento' },
    ],
  },
  focus: {
    legend: 'Modo de enfoque',
    help: 'Atenúa lo secundario para que destaque lo principal. Nada desaparece: vuelve al pasar por encima.',
    options: [
      { value: 'inactivo', label: 'Desactivado' },
      { value: 'activo', label: 'Activado' },
    ],
  },
  theme: {
    legend: 'Tema',
    help: 'Ambos temas están verificados para que el texto se lea con holgura.',
    options: [
      { value: 'sistema', label: 'Como mi sistema' },
      { value: 'claro', label: 'Claro' },
      { value: 'oscuro', label: 'Oscuro' },
    ],
  },
} as const;
