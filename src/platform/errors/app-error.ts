/**
 * Errores con código estable, mensaje comprensible y correlación
 * (PRD §19.1, docs/ARCHITECTURE.md §6.1).
 *
 * Regla de oro: un error jamás revela la existencia de un registro ajeno. En
 * superficies públicas y de portal, un recurso fuera del alcance responde
 * `NOT_FOUND`; en superficies internas responde `FORBIDDEN` con motivo auditado,
 * porque ahí la existencia del expediente ya se conoce legítimamente.
 */
export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'RULE_VIOLATION'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

/** Errores por campo, en lenguaje claro y junto al campo que los produce. */
export type FieldIssues = Record<string, string[]>;

export interface AppErrorOptions {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly details?: FieldIssues;
  readonly correlationId?: string;
  readonly cause?: unknown;
  /** Motivo interno para la bitácora. Nunca se envía al cliente. */
  readonly internalReason?: string;
  /** Segundos tras los cuales conviene reintentar. Solo para `RATE_LIMITED`. */
  readonly retryAfterSeconds?: number;
}

const HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  RULE_VIOLATION: 422,
  CONSENT_REQUIRED: 428,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: FieldIssues | undefined;
  readonly correlationId: string | undefined;
  readonly internalReason: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.details = options.details;
    this.correlationId = options.correlationId;
    this.internalReason = options.internalReason;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  /** Forma segura para enviar al cliente: sin motivo interno ni causa. */
  toPublicJSON(): { code: AppErrorCode; message: string; details?: FieldIssues; correlationId?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
      ...(this.correlationId === undefined ? {} : { correlationId: this.correlationId }),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/* -------------------------------------------------------------------------- */
/* Constructores de uso frecuente                                             */
/* -------------------------------------------------------------------------- */

export const errors = {
  validation: (details: FieldIssues, message = 'Revisa los datos marcados y vuelve a intentarlo.') =>
    new AppError({ code: 'VALIDATION', message, details }),

  unauthenticated: (message = 'Tu sesión no está activa. Inicia sesión para continuar.') =>
    new AppError({ code: 'UNAUTHENTICATED', message }),

  /**
   * Denegación con motivo interno auditable. El mensaje que ve la persona no
   * menciona el recurso ni a terceros.
   */
  forbidden: (internalReason: string, message = 'No tienes autorización para realizar esta acción.') =>
    new AppError({ code: 'FORBIDDEN', message, internalReason }),

  notFound: (internalReason: string, message = 'No encontramos lo que buscas.') =>
    new AppError({ code: 'NOT_FOUND', message, internalReason }),

  conflict: (message: string, internalReason?: string) =>
    new AppError({ code: 'CONFLICT', message, ...(internalReason === undefined ? {} : { internalReason }) }),

  ruleViolation: (message: string, internalReason?: string) =>
    new AppError({ code: 'RULE_VIOLATION', message, ...(internalReason === undefined ? {} : { internalReason }) }),

  consentRequired: (message = 'Necesitamos tu consentimiento explícito antes de continuar.') =>
    new AppError({ code: 'CONSENT_REQUIRED', message }),

  rateLimited: (retryAfterSeconds: number, message = 'Demasiados intentos. Espera un momento y vuelve a intentarlo.') =>
    new AppError({ code: 'RATE_LIMITED', message, retryAfterSeconds }),

  dependencyUnavailable: (dependency: string, message = 'Un servicio necesario no está disponible en este momento.') =>
    new AppError({ code: 'DEPENDENCY_UNAVAILABLE', message, internalReason: `dependencia no disponible: ${dependency}` }),

  internal: (internalReason: string, cause?: unknown) =>
    new AppError({
      code: 'INTERNAL',
      message: 'Ocurrió un error inesperado. El equipo técnico ya tiene registro de lo sucedido.',
      internalReason,
      ...(cause === undefined ? {} : { cause }),
    }),
} as const;
