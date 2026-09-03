import type { AppError } from '@/platform/errors/app-error';

/**
 * Resultado uniforme de un caso de uso (docs/ARCHITECTURE.md §6).
 *
 * Los casos de uso NO lanzan para los errores esperados: los devuelven. Lanzar
 * se reserva para lo verdaderamente inesperado, que la frontera convierte en
 * `INTERNAL`. Así la persona que llama no puede olvidar el camino de error.
 */
export type UseCaseResult<T> =
  | { readonly ok: true; readonly data: T; readonly warnings?: readonly DomainWarning[] }
  | { readonly ok: false; readonly error: AppError };

/** Advertencia que no impide continuar pero que la interfaz debe mostrar. */
export interface DomainWarning {
  readonly code: string;
  readonly message: string;
}

export function ok<T>(data: T, warnings?: readonly DomainWarning[]): UseCaseResult<T> {
  return warnings === undefined ? { ok: true, data } : { ok: true, data, warnings };
}

export function fail<T = never>(error: AppError): UseCaseResult<T> {
  return { ok: false, error };
}

/** Desenvuelve el resultado o lanza. Solo para pruebas y guiones. */
export function unwrap<T>(result: UseCaseResult<T>): T {
  if (!result.ok) throw result.error;
  return result.data;
}
