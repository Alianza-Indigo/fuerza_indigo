import type { CaseMessageAudience } from '@prisma-client/enums';

/**
 * A quién va cada comunicación del expediente (PRD §10.2, §10.3).
 *
 * No es una preferencia de visualización, es **quién puede leerla**. Una nota
 * reservada no se le enseña a la persona, no la ve el resto del equipo y no
 * viaja en una canalización, y eso lo impone el caso de uso al leer, nunca la
 * pantalla al pintar: una pantalla que oculta lo que la consulta ya trajo lo ha
 * enviado igual al navegador.
 */
export const NOMBRE_DE_AUDIENCIA: Record<CaseMessageAudience, string> = {
  PERSON_AND_TEAM: 'con la persona',
  TEAM_ONLY: 'solo el equipo',
  SUPERVISION_ONLY: 'reservada',
};

export const QUE_SIGNIFICA_LA_AUDIENCIA: Record<CaseMessageAudience, string> = {
  PERSON_AND_TEAM: 'La lee quien pidió la ayuda desde su portal, y queda acuse de que la leyó.',
  TEAM_ONLY: 'Solo la lee el equipo del expediente. La persona no la ve.',
  SUPERVISION_ONLY: 'Solo quien tiene la facultad de leer lo reservado. Ni la persona ni el resto del equipo.',
};

/**
 * Qué audiencias alcanza cada clase de lectura.
 *
 * Se declara como una tabla y no como una cadena de condiciones repartida por
 * el módulo: cada sitio que decidiera por su cuenta sería un sitio donde una
 * nota reservada podría escaparse, y un escape así no falla, se ve.
 */
export const ALCANCE_DE_LECTURA = {
  /** Quien es parte del expediente: solo lo que se le dirigió. */
  PERSONA: ['PERSON_AND_TEAM'],
  /** Quien lo lleva: lo suyo y lo del equipo, nunca lo reservado. */
  EQUIPO: ['PERSON_AND_TEAM', 'TEAM_ONLY'],
  /** Quien además tiene la facultad de leer lo reservado. */
  SUPERVISION: ['PERSON_AND_TEAM', 'TEAM_ONLY', 'SUPERVISION_ONLY'],
} as const satisfies Record<string, readonly CaseMessageAudience[]>;

export type ClaseDeLectura = keyof typeof ALCANCE_DE_LECTURA;
