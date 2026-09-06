import type { CaseOutcome } from '@prisma-client/enums';

/** Qué significa cada resultado, para que quien cierra elija con criterio. */
export const QUE_SIGNIFICA_EL_RESULTADO: Record<CaseOutcome, string> = {
  RESOLVED: 'Se consiguió lo que se buscaba.',
  PARTIALLY_RESOLVED: 'Se consiguió parte, y consta qué quedó fuera.',
  REFERRED: 'Lo lleva otra área o institución, que lo aceptó.',
  WITHDRAWN_BY_PERSON: 'La persona decidió no seguir.',
  NOT_COMPETENT: 'El asunto no es competencia de la organización.',
  NO_CONTACT: 'No se pudo volver a contactar a la persona.',
};

/**
 * Resultados que exigen que alguien haya **aceptado** la canalización.
 *
 * Cerrar como canalizado sin que ninguna área receptora lo aceptara diría que
 * alguien se hizo cargo cuando nadie lo hizo, y el asunto se quedaría sin
 * atender en los dos lados a la vez.
 */
export const EXIGEN_CANALIZACION_ACEPTADA: readonly CaseOutcome[] = ['REFERRED'];

/**
 * Cierres que admiten reapertura.
 *
 * `NOT_COMPETENT` no está: si el asunto no era competencia de la organización,
 * reabrirlo no la vuelve competente. Lo que procede es abrirlo donde
 * corresponda o canalizarlo, y las dos cosas se pueden hacer.
 */
export const RESULTADOS_QUE_ADMITEN_REAPERTURA: readonly CaseOutcome[] = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'REFERRED',
  'WITHDRAWN_BY_PERSON',
  'NO_CONTACT',
];
