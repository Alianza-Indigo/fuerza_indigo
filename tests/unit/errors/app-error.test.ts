import { describe, expect, it } from 'vitest';
import { AppError, errors, isAppError } from '@/platform/errors/app-error';

/**
 * Errores de aplicación (PRD §19.1).
 *
 * La regla que estas pruebas fijan es una sola: **el motivo interno nunca sale
 * hacia la persona**. Es el mecanismo con el que una denegación se audita con
 * todo el detalle y a la vez no le confirma a quien tantea que el expediente que
 * buscaba existe.
 */

describe('toPublicJSON', () => {
  it('no incluye el motivo interno', () => {
    const error = errors.forbidden('el expediente 42 pertenece a otra delegación');
    const publico = error.toPublicJSON();

    expect(JSON.stringify(publico)).not.toContain('expediente 42');
    expect(JSON.stringify(publico)).not.toContain('delegación');
    expect(publico.code).toBe('FORBIDDEN');
  });

  it('no incluye la causa original', () => {
    const causa = new Error('connection to 10.0.0.5:5432 refused');
    const error = errors.internal('la base no respondió', causa);
    expect(JSON.stringify(error.toPublicJSON())).not.toContain('10.0.0.5');
  });

  it('conserva los errores por campo, que sí son para la persona', () => {
    const error = errors.validation({ email: ['Escribe un correo válido.'] });
    expect(error.toPublicJSON().details).toEqual({ email: ['Escribe un correo válido.'] });
  });

  it('el motivo interno sí queda accesible para la bitácora', () => {
    const error = errors.notFound('fuera del alcance territorial del actor');
    expect(error.internalReason).toBe('fuera del alcance territorial del actor');
  });
});

describe('mensajes visibles', () => {
  it('no encontrado y sin autorización son indistinguibles para quien tantea', () => {
    // En superficies públicas, un expediente ajeno responde NOT_FOUND. Que el
    // mensaje visible sea distinto delataría por escrito lo que el código de
    // estado se cuida de no delatar.
    expect(errors.notFound('x').message).toBe('No encontramos lo que buscas.');
    expect(errors.forbidden('x').message).toBe('No tienes autorización para realizar esta acción.');
  });

  it('ningún mensaje visible menciona detalles técnicos', () => {
    const construidos = [
      errors.unauthenticated(),
      errors.forbidden('interno'),
      errors.notFound('interno'),
      errors.consentRequired(),
      errors.rateLimited(60),
      errors.dependencyUnavailable('almacen-de-archivos'),
      errors.internal('interno'),
    ];
    for (const error of construidos) {
      expect(error.message).not.toMatch(/postgres|prisma|sql|stack|undefined|null/i);
      expect(error.message.length).toBeGreaterThan(10);
    }
  });

  it('la dependencia caída no se nombra a la persona, pero sí a la bitácora', () => {
    const error = errors.dependencyUnavailable('almacen-de-archivos');
    expect(error.message).not.toContain('almacen-de-archivos');
    expect(error.internalReason).toContain('almacen-de-archivos');
  });
});

describe('estado HTTP', () => {
  it.each([
    ['VALIDATION', 422],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['PRECONDITION_FAILED', 412],
    ['RULE_VIOLATION', 422],
    ['CONSENT_REQUIRED', 428],
    ['RATE_LIMITED', 429],
    ['DEPENDENCY_UNAVAILABLE', 503],
    ['INTERNAL', 500],
  ] as const)('%s responde %d', (code, status) => {
    expect(new AppError({ code, message: 'x' }).httpStatus).toBe(status);
  });
});

describe('límite de tasa', () => {
  it('lleva los segundos que conviene esperar', () => {
    expect(errors.rateLimited(90).retryAfterSeconds).toBe(90);
  });
});

describe('isAppError', () => {
  it('distingue los errores de aplicación de los demás', () => {
    expect(isAppError(errors.internal('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError({ code: 'FORBIDDEN' })).toBe(false);
  });
});
