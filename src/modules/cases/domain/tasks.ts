import type { CaseTaskStatus } from '@prisma-client/enums';

/** Cómo se nombra en pantalla el estado de una tarea. */
export const NOMBRE_DE_TAREA: Record<CaseTaskStatus, string> = {
  PENDING: 'pendiente',
  IN_PROGRESS: 'en curso',
  BLOCKED: 'detenida',
  DONE: 'terminada',
  CANCELLED: 'cancelada',
};

/**
 * Qué se puede hacer con una tarea desde la pantalla.
 *
 * Terminar y cancelar cierran; detener no. Reabrir no está: una tarea
 * terminada que volviera a abrirse perdería cuándo se terminó y quién la
 * terminó, que es toda la constancia que deja. Si queda algo por hacer, se abre
 * otra tarea, y así consta que fueron dos cosas.
 */
export const DESTINOS_DE_TAREA: readonly { readonly value: CaseTaskStatus; readonly label: string; readonly hint: string }[] = [
  { value: 'IN_PROGRESS', label: 'Marcar en curso', hint: 'Alguien está trabajando en ella ahora.' },
  { value: 'BLOCKED', label: 'Marcar detenida', hint: 'Hay algo que la impide. Exige decir qué.' },
  { value: 'DONE', label: 'Marcar terminada', hint: 'Queda constancia de cuándo y por quién.' },
  { value: 'CANCELLED', label: 'Cancelar', hint: 'Se deja de hacer. Exige decir por qué.' },
];

/** Estados en los que una tarea ya no se mueve. */
export const TAREAS_CERRADAS: readonly CaseTaskStatus[] = ['DONE', 'CANCELLED'];
