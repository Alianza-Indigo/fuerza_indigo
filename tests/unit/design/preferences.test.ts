import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_LABELS,
  preferenceAttributes,
  readPreferences,
} from '@/platform/preferences/preferences';

/**
 * Preferencias sensoriales (PRD §5.3).
 *
 * Lo que estas pruebas protegen es que una preferencia guardada **nunca** pueda
 * impedir que el sitio se renderice. Alguien que amplió el texto y vuelve seis
 * meses después, con una versión distinta desplegada, tiene que encontrar el
 * sitio en pie: en el peor caso con los valores por omisión, nunca con un error.
 */

describe('readPreferences', () => {
  it('sin nada guardado, devuelve los valores por omisión', () => {
    expect(readPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences('')).toEqual(DEFAULT_PREFERENCES);
  });

  it('lee unas preferencias completas', () => {
    const guardadas = { text: 'mayor', density: 'amplia', motion: 'reducido', focus: 'activo', theme: 'oscuro' };
    expect(readPreferences(guardadas)).toEqual(guardadas);
    expect(readPreferences(JSON.stringify(guardadas))).toEqual(guardadas);
  });

  it('una cookie manipulada no deja el sitio sin renderizar', () => {
    expect(readPreferences('{esto no es json')).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences('[1,2,3]')).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it('un eje inválido cae a su valor por omisión y los demás se conservan', () => {
    // El caso real: una versión anterior guardó un valor que ya no existe.
    // Perder los cuatro ejes por uno solo obligaría a reconfigurarlo todo.
    const resultado = readPreferences({ text: 'gigantesco', density: 'amplia', theme: 'oscuro' });
    expect(resultado.text).toBe('normal');
    expect(resultado.density).toBe('amplia');
    expect(resultado.theme).toBe('oscuro');
  });

  it('ignora las claves que no conoce', () => {
    const resultado = readPreferences({ text: 'grande', colorFavorito: 'verde' });
    expect(resultado.text).toBe('grande');
    expect(resultado).not.toHaveProperty('colorFavorito');
  });
});

describe('preferenceAttributes', () => {
  it('no emite atributos para los valores por omisión', () => {
    // Emitirlos llenaría el marcado de declaraciones sin efecto.
    expect(preferenceAttributes(DEFAULT_PREFERENCES)).toEqual({});
  });

  it('emite solo los ejes que se apartaron de lo estándar', () => {
    expect(preferenceAttributes({ ...DEFAULT_PREFERENCES, text: 'mayor' })).toEqual({ 'data-text': 'mayor' });
    expect(preferenceAttributes({ ...DEFAULT_PREFERENCES, focus: 'activo' })).toEqual({ 'data-focus': 'activo' });
  });

  it('traduce el tema al valor que la hoja de estilos espera', () => {
    // La hoja usa `light` y `dark` porque es el vocabulario de `color-scheme`;
    // la interfaz usa «claro» y «oscuro» porque es el idioma de la persona.
    expect(preferenceAttributes({ ...DEFAULT_PREFERENCES, theme: 'claro' })['data-theme']).toBe('light');
    expect(preferenceAttributes({ ...DEFAULT_PREFERENCES, theme: 'oscuro' })['data-theme']).toBe('dark');
    expect(preferenceAttributes({ ...DEFAULT_PREFERENCES, theme: 'sistema' })['data-theme']).toBeUndefined();
  });

  it('los cuatro ejes son independientes', () => {
    // No hay «modo accesible» que los active en bloque: quien necesita texto
    // grande no necesariamente quiere perder el movimiento.
    const atributos = preferenceAttributes({
      text: 'grande',
      density: 'compacta',
      motion: 'reducido',
      focus: 'activo',
      theme: 'oscuro',
    });
    expect(Object.keys(atributos).sort()).toEqual([
      'data-density',
      'data-focus',
      'data-motion',
      'data-text',
      'data-theme',
    ]);
  });
});

describe('las etiquetas de la interfaz', () => {
  it('cubren todos los ejes y todos sus valores', () => {
    for (const eje of ['text', 'density', 'motion', 'focus', 'theme'] as const) {
      const etiqueta = PREFERENCE_LABELS[eje];
      expect(etiqueta.legend.length, `${eje} sin título`).toBeGreaterThan(3);
      expect(etiqueta.help.length, `${eje} sin explicación`).toBeGreaterThan(20);
      expect(etiqueta.options.length, `${eje} sin opciones`).toBeGreaterThan(1);
    }
  });

  it('cada valor del esquema tiene su etiqueta, y al revés', () => {
    // Una opción sin etiqueta queda invisible en el centro de accesibilidad; una
    // etiqueta sin opción es un control que no hace nada.
    const esperados: Record<string, string[]> = {
      text: ['normal', 'grande', 'mayor'],
      density: ['normal', 'amplia', 'compacta'],
      motion: ['sistema', 'reducido'],
      focus: ['inactivo', 'activo'],
      theme: ['sistema', 'claro', 'oscuro'],
    };
    for (const [eje, valores] of Object.entries(esperados)) {
      const etiquetados = PREFERENCE_LABELS[eje as keyof typeof PREFERENCE_LABELS].options.map((o) => o.value);
      expect([...etiquetados].sort(), `los valores de ${eje}`).toEqual([...valores].sort());
    }
  });

  it('las explicaciones están en lenguaje claro, sin jerga técnica', () => {
    for (const eje of ['text', 'density', 'motion', 'focus', 'theme'] as const) {
      expect(PREFERENCE_LABELS[eje].help).not.toMatch(/CSS|token|atributo|renderiz|DOM/i);
    }
  });
});
