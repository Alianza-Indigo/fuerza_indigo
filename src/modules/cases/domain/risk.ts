import type { CaseRiskKind, SupportRequestType } from '@prisma-client/enums';

/**
 * Protocolo visible para riesgo inmediato (PRD §10.3, §24 Fase 6).
 *
 * **El protocolo se administra en el CMS, no se escribe en un componente.** Los
 * teléfonos cambian, las instituciones cambian y los horarios cambian; un
 * número escrito en el código obliga a un despliegue para corregirlo y, hasta
 * entonces, la pantalla dice a quién llamar y ese alguien ya no atiende. La
 * página vive en el gestor de contenidos con esta dirección estable, y cada
 * marca de riesgo guarda **cuál** vio la persona: el protocolo se edita, y hay
 * que poder saber qué decía ese día.
 */
export const RUTA_DEL_PROTOCOLO_DE_RIESGO = 'protocolo-de-riesgo-inmediato';

/** Qué clase de riesgo se está señalando. */
export const NOMBRE_DE_RIESGO: Record<CaseRiskKind, string> = {
  VIOLENCE: 'violencia',
  SELF_HARM: 'riesgo de daño a sí misma',
  CHILD_PROTECTION: 'protección de una niña, niño o adolescente',
  HEALTH_EMERGENCY: 'urgencia de salud',
  OTHER: 'otro riesgo inmediato',
};

export const QUE_SIGNIFICA_EL_RIESGO: Record<CaseRiskKind, string> = {
  VIOLENCE: 'Hay violencia en curso o amenaza de que la haya.',
  SELF_HARM: 'La persona ha expresado que puede hacerse daño.',
  CHILD_PROTECTION: 'Hay una persona menor de edad en situación de desprotección.',
  HEALTH_EMERGENCY: 'Hay una urgencia médica que no puede esperar.',
  OTHER: 'Otro peligro que exige actuar ahora.',
};

/**
 * Tipos de solicitud ante los que el protocolo se enseña **sin que nadie lo
 * pida**.
 *
 * Quien escribe «violencia o urgencia» en un formulario puede estar en peligro
 * mientras lo escribe. Esperar a que alguien lea el mensaje en horario de
 * oficina para enseñarle a dónde acudir es llegar tarde por diseño.
 */
export const TIPOS_QUE_MUESTRAN_EL_PROTOCOLO: readonly SupportRequestType[] = [
  'VIOLENCE_OR_URGENCY',
  'PSYCHOSOCIAL_RISK',
];
