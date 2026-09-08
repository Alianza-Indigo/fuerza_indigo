/**
 * Umbral de privacidad de los indicadores agregados (PRD §10, §24 Fase 6 y 9).
 *
 * **Agregado no es anónimo.** En una tabla cruzada —por materia y territorio, o
 * por evento y territorio— un conteo de uno identifica a esa persona con más
 * precisión que su nombre: dice qué le pasó o dónde estuvo, y quien conoce el
 * barrio no necesita más. Por eso cada celda pasa por este umbral y las que
 * quedan por debajo **se suprimen enteras**: una cifra redondeada seguiría
 * diciendo que hubo algo.
 *
 * Vive en `platform` y no en un módulo porque la disciplina es una sola: los
 * indicadores de casos (Fase 6) y los territoriales (Fase 9) publican con el
 * mismo umbral, y tener dos definiciones sería tener dos privacidades, una de
 * las cuales alguien bajaría sin querer.
 *
 * Cinco y no tres: con tres, dos celdas contiguas de tres y cuatro permiten
 * deducir a una persona restando totales. Con cinco, la resta sigue siendo
 * posible en casos rebuscados, y por eso además **se suprime la celda entera**
 * en lugar de redondearla.
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
