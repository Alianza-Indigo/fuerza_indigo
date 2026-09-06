import type { CaseAssignmentRole } from '@prisma-client/enums';

/**
 * Cómo se llama en castellano cada papel dentro del equipo del expediente.
 *
 * Los cuatro papeles no son grados de un escalafón, son responsabilidades
 * distintas: quien responde del asunto, quien trabaja en él, quien lo vigila y
 * quien solo puede mirarlo. Nombrarlos por su enumerado en la pantalla obligaría
 * a quien lo lee a traducir del inglés y a adivinar la diferencia.
 */
export const NOMBRE_DE_ASIGNACION: Record<CaseAssignmentRole, string> = {
  OWNER: 'responsable',
  SUPPORT: 'apoyo',
  SUPERVISOR: 'supervisión',
  OBSERVER: 'observación',
};

/**
 * Qué hace cada papel, para que quien asigna elija con criterio.
 *
 * Sin esto, el desplegable enseña cuatro palabras y quien asigna elige la
 * primera. La diferencia entre nombrar responsable y nombrar apoyo es quién
 * responde si el asunto se cae, y eso hay que poder saberlo al elegir.
 */
export const QUE_HACE_CADA_PAPEL: Record<CaseAssignmentRole, string> = {
  OWNER: 'Responde del expediente. Solo puede haber una persona a la vez.',
  SUPPORT: 'Trabaja en el expediente junto a quien responde.',
  SUPERVISOR: 'Vigila cómo se lleva el asunto sin hacerse cargo de él.',
  OBSERVER: 'Puede leerlo por una necesidad concreta, sin intervenir.',
};
