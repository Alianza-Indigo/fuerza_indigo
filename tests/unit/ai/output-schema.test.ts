import { describe, expect, it } from 'vitest';
import { validateAgainstSchema, unsupportedKeywords } from '@/platform/ai/output-schema';

/**
 * El validador de la forma de una salida (PRD §24 Fase 8).
 *
 * Cubre el subconjunto de JSON Schema que los prompts usan de verdad y, sobre él,
 * valida por completo. Lo importante de estas pruebas no es que apruebe lo que
 * encaja, sino que **rechace lo que no**: un validador que solo dijera «sí» daría
 * por buena cualquier salida y el criterio de la fase quedaría sin sostén.
 */

describe('validateAgainstSchema', () => {
  it('acepta un objeto con las claves obligatorias', () => {
    const r = validateAgainstSchema({ type: 'object', required: ['ok'] }, { ok: true });
    expect(r.valid).toBe(true);
  });

  it('rechaza un tipo que no encaja', () => {
    const r = validateAgainstSchema({ type: 'object' }, [1, 2, 3]);
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/debía ser object/);
  });

  it('rechaza la falta de una clave obligatoria', () => {
    const r = validateAgainstSchema({ type: 'object', required: ['folio'] }, { otra: 1 });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/folio/);
  });

  it('valida dentro de las propiedades y de los elementos de un arreglo', () => {
    const schema = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', required: ['nombre'] } },
      },
    };
    expect(validateAgainstSchema(schema, { items: [{ nombre: 'a' }, { nombre: 'b' }] }).valid).toBe(true);
    expect(validateAgainstSchema(schema, { items: [{ nombre: 'a' }, { falta: 'b' }] }).valid).toBe(false);
  });

  it('distingue integer de number', () => {
    expect(validateAgainstSchema({ type: 'integer' }, 3).valid).toBe(true);
    expect(validateAgainstSchema({ type: 'integer' }, 3.5).valid).toBe(false);
    expect(validateAgainstSchema({ type: 'number' }, 3.5).valid).toBe(true);
  });

  it('comprueba enum', () => {
    const schema = { enum: ['SI', 'NO'] };
    expect(validateAgainstSchema(schema, 'SI').valid).toBe(true);
    expect(validateAgainstSchema(schema, 'QUIZA').valid).toBe(false);
  });

  it('un esquema vacío no restringe nada, y no lo finge', () => {
    expect(validateAgainstSchema({}, { cualquier: 'cosa' }).valid).toBe(true);
    expect(validateAgainstSchema(true, 'lo que sea').valid).toBe(true);
  });

  it('dice qué palabras clave no comprueba, en vez de fingir que sí', () => {
    expect(unsupportedKeywords({ type: 'string', minLength: 3, pattern: '^x' })).toEqual(['minLength', 'pattern']);
    expect(unsupportedKeywords({ type: 'object', required: ['a'] })).toEqual([]);
  });
});
