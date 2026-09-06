import type { CaseDomain, LegalEntityCode, SupportRequestType, SupportUrgency } from '@prisma-client/enums';

/**
 * Clasificación informativa y propuesta de canalización (PRD §10.1, Fase 6).
 *
 * **Quien pide ayuda no tiene por qué saber a qué área le toca.** Ese es el
 * criterio de la fase, y hasta ahora el formulario lo incumplía con educación:
 * preguntaba «¿a quién le escribes?» y añadía «si no sabes cuál, elige la que
 * más se acerque». Eso es pedirle a alguien que acierte en una decisión
 * institucional para poder contar lo que le pasa.
 *
 * Aquí la decisión la propone el sistema a partir de lo que la persona sí sabe:
 * qué le está pasando. Y la propone, no la toma.
 *
 * **No interviene ninguna inteligencia artificial, y no es una omisión.** Una
 * propuesta de canalización decide quién lee un relato que puede contener una
 * agresión, un diagnóstico o un despido. Una tabla explícita se lee, se discute
 * en una asamblea y se corrige; un modelo estadístico no. Además, cada
 * propuesta viene con **el motivo escrito en lenguaje llano**, porque quien la
 * confirma tiene que poder estar en desacuerdo con ella.
 *
 * La propuesta **no ejecuta nada**: se guarda como propuesta y espera
 * confirmación humana. Nada del expediente empieza antes de esa confirmación.
 */

export interface PropuestaDeCanalizacion {
  /** Entidad que se propone como responsable. */
  readonly entidad: LegalEntityCode;
  /** Compartimento del expediente que se abriría: defensa sindical o atención social. */
  readonly dominio: CaseDomain;
  /** Prioridad que se propone. La definitiva la fija la valoración humana. */
  readonly urgencia: SupportUrgency;
  /**
   * Por qué se propone eso, en palabras que entienda quien lo confirma y quien
   * lo recibe. Sin esto la propuesta es una orden sin fundamento.
   */
  readonly motivo: string;
  /**
   * La otra entidad, cuando el asunto puede tocar a las dos. No es una duda del
   * sistema: hay asuntos que legítimamente caben en los dos sitios, y decirlo
   * es más útil que fingir una certeza.
   */
  readonly alternativa: LegalEntityCode | null;
  /**
   * Si el relato pide enseñar el protocolo de riesgo inmediato. Enseñarlo no
   * convierte a la plataforma en un servicio de emergencia y no sustituye a
   * ninguno: pone delante las rutas humanas que la organización publicó.
   */
  readonly requiereProtocoloDeRiesgo: boolean;
}

interface Regla {
  readonly entidad: LegalEntityCode;
  readonly dominio: CaseDomain;
  readonly urgencia: SupportUrgency;
  readonly motivo: string;
  readonly alternativa: LegalEntityCode | null;
  readonly requiereProtocoloDeRiesgo: boolean;
}

/**
 * La tabla, entera y a la vista.
 *
 * El reparto no es técnico sino institucional: Fuerza Índigo es el sindicato y
 * responde por la relación de trabajo; Alianza Índigo es la asociación civil y
 * responde por la atención social, educativa y de salud. Lo que toca a las dos
 * se propone a una y se nombra a la otra.
 */
const REGLAS: Record<SupportRequestType, Regla> = {
  INDIVIDUAL_LABOR_DISPUTE: {
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'PRIORITY',
    motivo:
      'Lo que cuentas ocurre en tu trabajo, y de la relación de trabajo responde el sindicato. Un conflicto laboral suele tener plazos, así que entra como prioritario.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  },
  COLLECTIVE_DISPUTE: {
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'PRIORITY',
    motivo:
      'Afecta a un grupo de personas trabajadoras, no solo a una. Eso lo lleva el sindicato, y con prioridad, porque un conflicto colectivo crece si se deja quieto.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  },
  DISCRIMINATION_OR_ADJUSTMENTS: {
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'PRIORITY',
    motivo:
      'Negar un ajuste razonable o discriminar en el trabajo es materia sindical, y suele exigir actuar pronto. Si lo que cuentas pasó fuera del trabajo, quien lo confirme puede mandarlo a la asociación civil.',
    alternativa: 'ALIANZA_INDIGO',
    requiereProtocoloDeRiesgo: false,
  },
  EDUCATION_ACCESS: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'ROUTINE',
    motivo:
      'El acceso educativo lo acompaña la asociación civil, que es quien trabaja con escuelas y familias.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  },
  HEALTH_ACCESS: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'PRIORITY',
    motivo:
      'El acceso a salud lo acompaña la asociación civil. Entra como prioritario porque una atención que se retrasa se vuelve más difícil de conseguir.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  },
  ACCESSIBILITY: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'ROUTINE',
    motivo:
      'La accesibilidad de un espacio o un servicio la acompaña la asociación civil. Si la barrera está en tu centro de trabajo, quien lo confirme puede mandarlo al sindicato.',
    alternativa: 'FUERZA_INDIGO',
    requiereProtocoloDeRiesgo: false,
  },
  FAMILY_GUIDANCE: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'ROUTINE',
    motivo: 'La orientación a familias la acompaña la asociación civil.',
    alternativa: null,
    requiereProtocoloDeRiesgo: false,
  },
  PSYCHOSOCIAL_RISK: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'PRIORITY',
    motivo:
      'Un riesgo psicosocial lo acompaña la asociación civil, con prioridad. Si lo que lo produce es tu centro de trabajo, quien lo confirme puede mandarlo también al sindicato.',
    alternativa: 'FUERZA_INDIGO',
    requiereProtocoloDeRiesgo: true,
  },
  VIOLENCE_OR_URGENCY: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'URGENT',
    motivo:
      'Lo que cuentas describe violencia o una urgencia. Entra como urgente y con el protocolo de riesgo inmediato a la vista. Si ocurre en tu trabajo, quien lo confirme puede mandarlo también al sindicato.',
    alternativa: 'FUERZA_INDIGO',
    requiereProtocoloDeRiesgo: true,
  },
  TRAINING_OR_INSTITUTIONAL_SUPPORT: {
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    urgencia: 'ROUTINE',
    motivo: 'Las peticiones de capacitación y de apoyo institucional las atiende la asociación civil.',
    alternativa: 'FUERZA_INDIGO',
    requiereProtocoloDeRiesgo: false,
  },
  GENERAL_CONTACT: {
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'ROUTINE',
    motivo:
      'Es un mensaje general, sin una materia que lo sitúe por sí sola. Quien lo lea decidirá si abre expediente y en qué entidad.',
    alternativa: 'ALIANZA_INDIGO',
    requiereProtocoloDeRiesgo: false,
  },
  OTHER: {
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    urgencia: 'ROUTINE',
    motivo:
      'No encaja en ninguna materia del catálogo, así que no se supone ninguna. Quien lo lea decidirá adónde va.',
    alternativa: 'ALIANZA_INDIGO',
    requiereProtocoloDeRiesgo: false,
  },
};

export interface EntradaDeClasificacion {
  readonly requestType: SupportRequestType;
  /**
   * A quién dijo la persona que le escribe, si lo dijo. **Manda sobre la
   * tabla**: quien escribe a una entidad concreta ya tomó una decisión, y el
   * sistema no está para corregírsela. Lo que sí hace es dejar dicho en el
   * motivo que la materia habría ido a la otra.
   */
  readonly entidadElegida?: LegalEntityCode | undefined;
}

export function proponerCanalizacion(entrada: EntradaDeClasificacion): PropuestaDeCanalizacion {
  const regla = REGLAS[entrada.requestType];
  const elegida = entrada.entidadElegida;

  if (elegida === undefined || elegida === regla.entidad) {
    return {
      entidad: regla.entidad,
      dominio: regla.dominio,
      urgencia: regla.urgencia,
      motivo: regla.motivo,
      alternativa: regla.alternativa,
      requiereProtocoloDeRiesgo: regla.requiereProtocoloDeRiesgo,
    };
  }

  return {
    entidad: elegida,
    dominio: elegida === 'FUERZA_INDIGO' ? 'UNION_DEFENSE' : 'SOCIAL_ATTENTION',
    urgencia: regla.urgencia,
    motivo: `Escribiste a ${NOMBRE_DE_ENTIDAD[elegida]} y ahí queda. Por la materia habría ido a ${NOMBRE_DE_ENTIDAD[regla.entidad]}; quien lo confirme decide.`,
    alternativa: regla.entidad,
    requiereProtocoloDeRiesgo: regla.requiereProtocoloDeRiesgo,
  };
}

export const NOMBRE_DE_ENTIDAD: Record<LegalEntityCode, string> = {
  FUERZA_INDIGO: 'Fuerza Índigo, el sindicato',
  ALIANZA_INDIGO: 'Alianza Índigo, la asociación civil',
};

/** Cómo se llama cada materia en la pantalla. */
export const NOMBRE_DE_MATERIA: Record<SupportRequestType, string> = {
  GENERAL_CONTACT: 'Contacto general',
  INDIVIDUAL_LABOR_DISPUTE: 'Conflicto laboral individual',
  COLLECTIVE_DISPUTE: 'Conflicto colectivo',
  DISCRIMINATION_OR_ADJUSTMENTS: 'Discriminación o falta de ajustes',
  EDUCATION_ACCESS: 'Acceso educativo',
  HEALTH_ACCESS: 'Acceso a salud',
  ACCESSIBILITY: 'Accesibilidad',
  FAMILY_GUIDANCE: 'Orientación familiar',
  PSYCHOSOCIAL_RISK: 'Riesgo psicosocial',
  VIOLENCE_OR_URGENCY: 'Violencia o urgencia',
  TRAINING_OR_INSTITUTIONAL_SUPPORT: 'Capacitación o apoyo institucional',
  OTHER: 'Otro asunto',
};
