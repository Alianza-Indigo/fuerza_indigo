import { describe, expect, it } from 'vitest';
import { textField } from '@/platform/http/form-fields';

/**
 * Lectura de campos de formulario (ADR-0032).
 *
 * El caso que motiva esta función no es teórico: enviar un archivo en un campo
 * de texto es trivial con un formulario alterado, y `String()` lo convierte en
 * la cadena «[object File]», que llegaría hasta la comparación de credenciales.
 */
describe('textField', () => {
  it('devuelve el texto tal cual, sin recortar', () => {
    const form = new FormData();
    form.set('email', '  Persona@Fuerzaindigo.lat  ');
    // Normalizar aquí escondería el dato original a la validación, que es quien
    // debe decidir qué se recorta y qué se rechaza.
    expect(textField(form, 'email')).toBe('  Persona@Fuerzaindigo.lat  ');
  });

  it('un campo ausente es cadena vacía', () => {
    expect(textField(new FormData(), 'inexistente')).toBe('');
  });

  it('un archivo enviado en un campo de texto NO se convierte en «[object File]»', () => {
    const form = new FormData();
    form.set('password', new File(['contenido'], 'ataque.txt', { type: 'text/plain' }));
    expect(textField(form, 'password')).toBe('');
    expect(textField(form, 'password')).not.toContain('object');
  });

  it('conserva el primer valor cuando el campo se envía repetido', () => {
    const form = new FormData();
    form.append('token', 'primero');
    form.append('token', 'segundo');
    expect(textField(form, 'token')).toBe('primero');
  });

  it('conserva acentos y caracteres fuera del ASCII', () => {
    const form = new FormData();
    form.set('nombre', 'María Ñuño 🌱');
    expect(textField(form, 'nombre')).toBe('María Ñuño 🌱');
  });
});
