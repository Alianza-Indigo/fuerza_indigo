import type { ReferralStatus } from '@prisma-client/enums';

/**
 * Qué puede viajar en una canalización (PRD §10.4, requisito 3).
 *
 * Es una **lista blanca**, no un ejemplo. Sin ella, «seleccionar los datos que
 * se transfieren» acabaría siendo una casilla de «todo», y lo que se transfiere
 * entre dos personas morales distintas no puede depender de que alguien se
 * acuerde de desmarcar algo.
 *
 * Lo que **no** está aquí no es un olvido:
 *
 *  · Las **notas reservadas** y las comunicaciones internas no viajan nunca. El
 *    requisito 5 del PRD dice «seguimiento del estado sin exponer notas
 *    reservadas», y la forma de cumplirlo no es esconderlas al pintar, es que
 *    no estén entre lo que se puede elegir.
 *  · La **bitácora** tampoco: cuenta quién miró qué dentro de la organización
 *    que canaliza, y eso no es asunto de quien recibe.
 */
export const CAMPOS_TRANSFERIBLES = {
  folio: 'El folio del expediente, para poder referirse a él',
  resumen: 'Lo que la persona contó al pedir ayuda, tal cual',
  valoracion: 'La valoración de quien lo ha llevado hasta ahora',
  materia: 'De qué trata el asunto y con qué prioridad entró',
  territorio: 'En qué territorio ocurre',
  contacto: 'Cómo comunicarse con la persona',
  participantes: 'Quiénes figuran en el expediente y con qué papel',
} as const;

export type CampoTransferible = keyof typeof CAMPOS_TRANSFERIBLES;

export const NOMBRE_DE_CANALIZACION: Record<ReferralStatus, string> = {
  PROPOSED: 'propuesta',
  AWAITING_CONSENT: 'esperando el consentimiento',
  SENT: 'enviada',
  ACCEPTED: 'aceptada',
  REJECTED: 'rechazada',
  RETURNED: 'devuelta',
  CLOSED: 'cerrada',
};

/** Estados en los que la canalización ya no se mueve. */
export const CANALIZACIONES_CERRADAS: readonly ReferralStatus[] = ['REJECTED', 'RETURNED', 'CLOSED'];
