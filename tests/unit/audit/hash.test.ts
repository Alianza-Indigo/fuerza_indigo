import { describe, expect, it } from 'vitest';
import { computeHash, maskEmail } from '@/platform/audit/audit-service';

/**
 * Resumen encadenado de la bitácora (docs/SECURITY.md §5, ADR-0011).
 *
 * Lo que la cadena promete es que alterar un evento pasado sin recalcular todos
 * los posteriores es detectable. Esa promesa descansa en una propiedad concreta:
 * la codificación de los campos es inyectiva, es decir, dos eventos distintos
 * nunca producen la misma cadena de entrada. Si no lo fuera, alguien podría
 * sustituir un evento por otro conservando el resumen y la verificación no
 * notaría nada.
 */

const BASE = {
  previousHash: '0'.repeat(64),
  chainKey: 'GLOBAL',
  chainSequence: 1n,
  occurredAt: new Date('2026-06-15T12:00:00.000Z'),
  actorId: '11111111-1111-4111-8111-111111111111',
  action: 'ROLE_GRANTED',
  objectKind: 'RoleAssignment',
  objectId: '22222222-2222-4222-8222-222222222222',
  outcome: 'SUCCESS',
  correlationId: '33333333-3333-4333-8333-333333333333',
};

describe('computeHash', () => {
  it('es determinista', () => {
    expect(computeHash(BASE)).toBe(computeHash({ ...BASE }));
  });

  it('cambia si cambia cualquiera de los campos', () => {
    const original = computeHash(BASE);
    const variantes = [
      { previousHash: '1'.repeat(64) },
      { chainKey: 'ENTIDAD' },
      { chainSequence: 2n },
      { occurredAt: new Date('2026-06-15T12:00:00.001Z') },
      { actorId: '44444444-4444-4444-8444-444444444444' },
      { action: 'ROLE_REVOKED' },
      { objectKind: 'User' },
      { objectId: '55555555-5555-4555-8555-555555555555' },
      { outcome: 'FAILURE' },
      { correlationId: '66666666-6666-4666-8666-666666666666' },
    ];

    for (const variante of variantes) {
      const campo = Object.keys(variante)[0];
      expect(computeHash({ ...BASE, ...variante }), `alterar ${campo} no cambió el resumen`).not.toBe(original);
    }
  });

  it('no colisiona al mover contenido de un campo al siguiente', () => {
    // La prueba central de la codificación. Si los campos se unieran con un
    // separador que pudiera aparecer dentro de un campo, estos dos eventos
    // —que son distintos— producirían el mismo resumen.
    const a = computeHash({ ...BASE, objectKind: 'Role', objectId: 'Assignment-x' });
    const b = computeHash({ ...BASE, objectKind: 'RoleAssignment', objectId: '-x' });
    expect(a).not.toBe(b);
  });

  it('distingue un campo vacío de la ausencia de contenido en el vecino', () => {
    const a = computeHash({ ...BASE, objectKind: '', objectId: 'AB' });
    const b = computeHash({ ...BASE, objectKind: 'A', objectId: 'B' });
    const c = computeHash({ ...BASE, objectKind: 'AB', objectId: '' });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('produce un resumen SHA-256 en hexadecimal', () => {
    expect(computeHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('maskEmail', () => {
  it('conserva lo justo para reconocer la cuenta sin revelarla', () => {
    expect(maskEmail('persona@fuerzaindigo.lat')).toBe('pe…a@fuerzaindigo.lat');
  });

  it('con una parte local muy corta no revela casi nada', () => {
    expect(maskEmail('ana@fuerzaindigo.lat')).toBe('a…@fuerzaindigo.lat');
    expect(maskEmail('jo@fuerzaindigo.lat')).toBe('j…@fuerzaindigo.lat');
  });

  it('un valor que no es un correo no se filtra tal cual', () => {
    // Devolver la entrada sin más habría escrito en la bitácora justo el dato
    // que la máscara existe para no escribir.
    expect(maskEmail('no-es-un-correo')).toBe('[correo no válido]');
    expect(maskEmail('@sin-parte-local.lat')).toBe('[correo no válido]');
    expect(maskEmail('')).toBe('[correo no válido]');
  });

  it('nunca devuelve la parte local completa cuando tiene cuatro caracteres o más', () => {
    for (const local of ['juan', 'mariana', 'x'.repeat(40)]) {
      const enmascarado = maskEmail(`${local}@dominio.lat`);
      expect(enmascarado).not.toContain(`${local}@`);
      expect(enmascarado).toContain('…');
    }
  });
});
