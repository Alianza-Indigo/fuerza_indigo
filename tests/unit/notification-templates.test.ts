import { describe, expect, it } from 'vitest';
import { variablesDeclaradas, variablesUsadas } from '@/modules/notifications/domain/templates';

/**
 * La parte pura de las plantillas de aviso (Fase 9 bloque C).
 *
 * Se comprueba sin base de datos: qué variables usa un texto y cuáles declara,
 * que es lo que la publicación exige que coincida.
 */

describe('variablesUsadas', () => {
  it('recoge las de asunto y cuerpo, sin repetir', () => {
    const usadas = variablesUsadas('Hola {{givenName}}', 'Hola {{givenName}}, el {{fecha}}.');
    expect([...usadas].sort()).toEqual(['fecha', 'givenName']);
  });

  it('ignora un asunto nulo', () => {
    expect(variablesUsadas(null, 'Sin variables.')).toEqual([]);
  });
});

describe('variablesDeclaradas', () => {
  it('conserva solo los nombres válidos de un arreglo', () => {
    expect(variablesDeclaradas(['givenName', 'fecha'])).toEqual(['givenName', 'fecha']);
  });

  it('descarta lo que no es un arreglo de nombres', () => {
    expect(variablesDeclaradas('givenName')).toEqual([]);
    expect(variablesDeclaradas([1, '{{malo}}', 'buena'])).toEqual(['buena']);
  });
});
