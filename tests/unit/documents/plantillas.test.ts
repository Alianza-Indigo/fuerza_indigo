import { describe, expect, it } from 'vitest';
import {
  componerDocumento,
  escaparHtml,
  renderizarCuerpo,
  variablesDeclaradas,
  variablesUsadas,
} from '@/modules/documents/domain';

/**
 * Documentos institucionales: la parte determinista (PRD §16.2).
 *
 * Un acta tiene que poder reconstruirse años después con la plantilla exacta y
 * la instantánea de variables. Eso exige que la composición sea una función
 * pura, y que nada de lo que entra pueda cambiar la estructura del documento.
 */
describe('composición de un documento', () => {
  it('los mismos valores producen exactamente el mismo texto', () => {
    const plantilla = '<p>Acordado por {{organo}} el {{fecha}}.</p>';
    const valores = { organo: 'Comité Ejecutivo', fecha: '2026-03-01' };

    expect(renderizarCuerpo(plantilla, valores)).toBe(renderizarCuerpo(plantilla, valores));
    expect(renderizarCuerpo(plantilla, valores)).toBe('<p>Acordado por Comité Ejecutivo el 2026-03-01.</p>');
  });

  it('un valor con marcado no puede cambiar el documento', () => {
    // El caso que importa: alguien llamado «<script>» o un texto de acuerdo con
    // etiquetas. El documento se abre en un navegador; sin escape, el contenido
    // dejaría de ser contenido.
    const compuesto = renderizarCuerpo('<p>{{nombre}}</p>', {
      nombre: '<script>alert(1)</script>',
    });

    expect(compuesto).not.toContain('<script>');
    expect(compuesto).toContain('&lt;script&gt;');
  });

  it('una variable ausente deja hueco vacío y no el nombre de la variable', () => {
    expect(renderizarCuerpo('<p>{{falta}}</p>', {})).toBe('<p></p>');
  });

  it('las variables usadas se detectan aunque lleven espacios', () => {
    expect(variablesUsadas('{{ uno }} y {{dos}} y otra vez {{uno}}').slice().sort()).toEqual(['dos', 'uno']);
  });

  it('las variables declaradas ignoran lo que no es un nombre válido', () => {
    expect(variablesDeclaradas(['uno', '', '1mal', 'dos', 42, null])).toEqual(['uno', 'dos']);
    expect(variablesDeclaradas('no es una lista')).toEqual([]);
  });

  it('el escape cubre los cinco caracteres que rompen el marcado', () => {
    expect(escaparHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('el documento compuesto empieza por el doctype que el almacén comprueba', () => {
    const html = componerDocumento({
      titulo: 'Acta',
      entidad: 'Fuerza Índigo',
      serie: 'ACTA',
      folio: 'FI-ACTA-2026-00001',
      emitidoEl: new Date('2026-03-01T12:00:00Z'),
      cuerpo: '<p>Contenido</p>',
    });

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('FI-ACTA-2026-00001');
    // Autocontenido: nada que pedirle a un servidor dentro de veinte años.
    expect(html).not.toMatch(/<(script|link|img)\b/);
    expect(html).not.toContain('http://');
  });

  it('el título y el folio del documento también se escapan', () => {
    const html = componerDocumento({
      titulo: '<b>Acta</b>',
      entidad: 'Fuerza Índigo',
      serie: 'ACTA',
      folio: '"><b>',
      emitidoEl: new Date('2026-03-01T12:00:00Z'),
      cuerpo: '<p>ok</p>',
    });

    expect(html).not.toContain('<b>Acta</b>');
    expect(html).toContain('&lt;b&gt;Acta&lt;/b&gt;');
  });
});
