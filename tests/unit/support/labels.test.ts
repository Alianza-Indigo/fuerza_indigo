import { describe, expect, it } from 'vitest';
import { REQUEST_TYPES } from '@/modules/support';
import { REQUEST_TYPE_LABELS } from '../../../app/(publico)/contacto/labels';

/**
 * Los tipos del PRD §10.1 y lo que se lee en pantalla.
 *
 * Un tipo nuevo en el catálogo sin su texto en pantalla se mostraría con su
 * nombre interno —«PSYCHOSOCIAL_RISK»— a quien está pidiendo ayuda. Esta prueba
 * hace que añadir uno obligue a decidir también cómo se le llama en voz alta.
 */
describe('etiquetas de los tipos de la entrada pública', () => {
  it('cubre todos los tipos del catálogo', () => {
    for (const tipo of REQUEST_TYPES) {
      expect(REQUEST_TYPE_LABELS[tipo], `falta la etiqueta de ${tipo}`).toBeDefined();
      expect(REQUEST_TYPE_LABELS[tipo].label.length).toBeGreaterThan(2);
      expect(REQUEST_TYPE_LABELS[tipo].help.length).toBeGreaterThan(10);
    }
  });

  it('no sobra ninguna etiqueta sin tipo', () => {
    expect(Object.keys(REQUEST_TYPE_LABELS).sort()).toEqual([...REQUEST_TYPES].sort());
  });

  it('los doce tipos del PRD §10.1 están, más el contacto general', () => {
    expect(REQUEST_TYPES).toHaveLength(13);
    expect(REQUEST_TYPES).toContain('VIOLENCE_OR_URGENCY');
    expect(REQUEST_TYPES).toContain('GENERAL_CONTACT');
  });

  it('el tipo de urgencia dice a dónde llamar de verdad', () => {
    expect(REQUEST_TYPE_LABELS.VIOLENCE_OR_URGENCY.help).toContain('911');
  });
});
