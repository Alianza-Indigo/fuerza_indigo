/**
 * Umbral de privacidad de los indicadores (PRD §10, §24 Fase 6).
 *
 * Por debajo de este número de expedientes, la cifra **no se publica**. No es
 * prudencia decorativa: en una tabla cruzada por materia, territorio y
 * resultado, un conteo de uno identifica a esa persona con más precisión que su
 * nombre —dice qué le pasó, dónde y cómo acabó—, y quien conoce el barrio no
 * necesita más.
 *
 * Cinco y no tres: con tres, dos celdas contiguas de tres y cuatro permiten
 * deducir a una persona restando totales. Con cinco, la resta sigue siendo
 * posible en casos rebuscados, y por eso además **se suprime la celda entera**
 * en lugar de redondearla: una cifra redondeada sigue diciendo que hubo algo.
 */
export const UMBRAL_DE_PRIVACIDAD = 5;

/** Una celda del indicador: o trae cifra, o dice por qué no la trae. */
export type Celda =
  | { readonly publicable: true; readonly valor: number }
  | { readonly publicable: false; readonly motivo: 'bajo el umbral' };

/**
 * Aplica el umbral a un conteo.
 *
 * Cero **sí** se publica: «ninguno» no identifica a nadie, y ocultarlo haría
 * indistinguible «no hubo» de «hubo pocos», que es justo la ambigüedad que un
 * indicador tiene que evitar.
 */
export function aplicarUmbral(valor: number): Celda {
  if (valor === 0) return { publicable: true, valor: 0 };
  return valor < UMBRAL_DE_PRIVACIDAD
    ? { publicable: false, motivo: 'bajo el umbral' }
    : { publicable: true, valor };
}

/** Cómo se lee una celda suprimida en pantalla y en una exportación. */
export const CIFRA_SUPRIMIDA = '—';
