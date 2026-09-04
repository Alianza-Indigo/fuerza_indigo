import { describe, expect, it } from 'vitest';
import { rutaMedible } from '@/platform/analytics';

/**
 * Reducción de la dirección antes de contarla (F2-OPS-002).
 *
 * Es la función que decide qué queda escrito en la tabla de medición, así que
 * es donde se puede colar un dato personal sin que nadie lo note: un término de
 * búsqueda en la consulta, un folio en la ruta, el nombre de una delegación
 * pequeña que en un pueblo lee una sola persona.
 */
describe('rutaMedible', () => {
  it('conserva con su nombre las rutas fijas del sitio', () => {
    for (const ruta of ['/', '/accesibilidad', '/buscar', '/contacto', '/noticias', '/solicitar-apoyo']) {
      expect(rutaMedible(ruta)).toBe(ruta);
    }
  });

  it('nunca deja pasar el término de una búsqueda', () => {
    expect(rutaMedible('/buscar?q=despido+injustificado')).toBe('/buscar');
    expect(rutaMedible('/buscar?q=diagnóstico&pagina=2')).toBe('/buscar');
  });

  it('nunca deja pasar un fragmento', () => {
    expect(rutaMedible('/contacto#formulario')).toBe('/contacto');
  });

  it('agrupa las notas y los documentos legales sin su parte variable', () => {
    expect(rutaMedible('/noticias/despido-en-la-planta-de-saltillo')).toBe('/noticias/*');
    expect(rutaMedible('/legales/privacidad')).toBe('/legales/*');
    expect(rutaMedible('/legales/terminos?entidad=alianza_indigo')).toBe('/legales/*');
  });

  it('agrupa cualquier otra ruta, incluida una con identificadores dentro', () => {
    expect(rutaMedible('/delegaciones/coahuila/saltillo')).toBe('/*');
    expect(rutaMedible('/gestion/mensajes/01a06c22-3f89-753e-ba58-d54925d8b406')).toBe('/*');
    expect(rutaMedible('/directorio/una-persona-con-nombre-y-apellido')).toBe('/*');
  });

  it('la barra final no crea una ruta distinta', () => {
    expect(rutaMedible('/contacto/')).toBe('/contacto');
    expect(rutaMedible('/')).toBe('/');
  });

  it('el resultado nunca contiene una interrogación, una almohadilla ni un identificador', () => {
    const entradas = [
      '/buscar?q=acoso',
      '/noticias/nota#seccion',
      '/legales/privacidad?entidad=fuerza_indigo',
      '/algo/01a06c22-3f89-753e-ba58-d54925d8b406',
      '/gestion/mensajes/FI-2026-ABCDEFGH',
    ];

    for (const entrada of entradas) {
      const salida = rutaMedible(entrada);
      expect(salida, entrada).not.toContain('?');
      expect(salida, entrada).not.toContain('#');
      expect(salida, entrada).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
      expect(salida, entrada).not.toMatch(/FI-\d{4}-/);
    }
  });
});
