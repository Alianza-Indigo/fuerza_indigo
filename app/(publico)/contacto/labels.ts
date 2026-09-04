import type { SupportRequestType } from '@prisma-client/enums';

/**
 * Cómo se le nombra a cada tipo de asunto a quien escribe.
 *
 * El PRD §10.1 enumera los tipos en lenguaje institucional. Aquí se dicen en el
 * lenguaje de quien tiene el problema, que casi nunca sabe si lo suyo es un
 * «conflicto laboral individual». El valor que viaja al servidor es el del
 * catálogo; lo que se lee en pantalla es esto.
 */
export const REQUEST_TYPE_LABELS: Readonly<Record<SupportRequestType, { label: string; help: string }>> = {
  GENERAL_CONTACT: {
    label: 'Contacto general',
    help: 'Una duda, una propuesta o algo que no encaja en las demás opciones.',
  },
  INDIVIDUAL_LABOR_DISPUTE: {
    label: 'Un problema en mi trabajo',
    help: 'Despido, sueldo, horario, trato, condiciones. Algo que te pasa a ti.',
  },
  COLLECTIVE_DISPUTE: {
    label: 'Un problema que afecta a varias personas',
    help: 'Algo que le pasa a un grupo o a todo el centro de trabajo.',
  },
  DISCRIMINATION_OR_ADJUSTMENTS: {
    label: 'Discriminación o falta de ajustes',
    help: 'Te tratan distinto por ser quien eres, o no te dan lo que necesitas para trabajar.',
  },
  EDUCATION_ACCESS: { label: 'Acceso a la educación', help: 'Escuela, universidad, capacitación.' },
  HEALTH_ACCESS: { label: 'Acceso a la salud', help: 'Atención médica, diagnóstico, tratamiento.' },
  ACCESSIBILITY: {
    label: 'Accesibilidad',
    help: 'Barreras en un lugar, un trámite, un sitio web o un servicio.',
  },
  FAMILY_GUIDANCE: {
    label: 'Orientación familiar',
    help: 'Acompañamiento para tu familia o para quien cuidas.',
  },
  CIAN_ATTENTION: {
    label: 'Necesito atención del CIAN',
    help: 'Atención neurodivergente integral.',
  },
  PSYCHOSOCIAL_RISK: {
    label: 'Riesgo psicosocial',
    help: 'Acoso, carga excesiva, ambiente que te está haciendo daño.',
  },
  VIOLENCE_OR_URGENCY: {
    label: 'Violencia o urgencia',
    help: 'Si estás en peligro ahora mismo, llama al 911. Este canal no está atendido a todas horas.',
  },
  TRAINING_OR_INSTITUTIONAL_SUPPORT: {
    label: 'Capacitación o apoyo institucional',
    help: 'Para una organización, una escuela o una empresa.',
  },
  OTHER: { label: 'Otro asunto', help: 'Cuéntanos y lo canalizamos.' },
};
