import type { CaseParticipantRole } from '@prisma-client/enums';

/**
 * Qué exige y qué concede cada papel dentro del expediente (PRD §10.2).
 *
 * Son dos listas y no un campo por participante porque la respuesta depende del
 * papel y no de quien lo agrega: si fuera una casilla, un descuido daría acceso
 * al expediente a una contraparte, y ese descuido no lo notaría nadie hasta que
 * fuera tarde.
 */

/**
 * Papeles que solo se sostienen con una relación de cuidado o representación
 * acreditada. Sin ella, quien dice representar no representa.
 */
export const EXIGEN_REPRESENTACION: readonly CaseParticipantRole[] = [
  'REPRESENTATIVE',
  'FAMILY_OR_CAREGIVER',
];

/**
 * Papeles que alcanzan el expediente desde el portal de la persona.
 *
 * Quien pidió ayuda y la persona afectada ven lo suyo. Quien representa, con su
 * representación acreditada, ve lo que representa. Una contraparte figura y no
 * mira; un testigo tampoco. Nada de esto enseña las notas reservadas, que son
 * otra facultad y con nombre propio.
 */
export const VEN_EL_EXPEDIENTE: readonly CaseParticipantRole[] = [
  'APPLICANT',
  'AFFECTED_PERSON',
  'REPRESENTATIVE',
];

/** Cómo se llama cada papel en la pantalla. */
export const NOMBRE_DE_PAPEL: Record<CaseParticipantRole, string> = {
  APPLICANT: 'Pidió la ayuda',
  AFFECTED_PERSON: 'Persona afectada',
  REPRESENTATIVE: 'Representa',
  FAMILY_OR_CAREGIVER: 'Familiar o persona cuidadora',
  WITNESS: 'Testigo',
  COUNTERPART: 'Contraparte',
  EXTERNAL_INSTITUTION: 'Institución externa',
};
