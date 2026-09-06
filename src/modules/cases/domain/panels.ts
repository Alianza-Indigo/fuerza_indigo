import type { CaseDomain, LegalEntityCode, SupportRequestType } from '@prisma-client/enums';

/**
 * Los tres paneles de coordinación de la Fase 6 (PRD §24).
 *
 * Un panel **no es una pantalla con un título distinto**: es un recorte
 * declarado —entidad, dominio y materias— sobre los mismos expedientes. Que sea
 * una tabla y no tres pantallas escritas a mano tiene una consecuencia
 * concreta: el día que la organización cree una secretaría nueva, se añade una
 * entrada aquí y no se copia una pantalla, que es como dos paneles empiezan a
 * contar cosas distintas por el mismo nombre.
 *
 * Las materias se reparten sin solaparse **a propósito**. Un expediente que
 * apareciera en dos paneles se atendería dos veces o ninguna, y las dos
 * secretarías creerían que lo lleva la otra.
 */
export interface PanelDeCoordinacion {
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly entidad: LegalEntityCode;
  readonly dominio: CaseDomain;
  readonly materias: readonly SupportRequestType[];
}

export const PANELES: readonly PanelDeCoordinacion[] = [
  {
    codigo: 'trabajo-y-conflictos',
    nombre: 'Trabajo y Conflictos',
    descripcion: 'Conflictos laborales individuales y colectivos, y la representación que exigen.',
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    materias: ['INDIVIDUAL_LABOR_DISPUTE', 'COLLECTIVE_DISPUTE', 'TRAINING_OR_INSTITUTIONAL_SUPPORT'],
  },
  {
    codigo: 'neuroinclusion-y-enlace-familiar',
    nombre: 'Neuroinclusión y Enlace Familiar',
    descripcion: 'Ajustes razonables, acceso educativo y de salud, accesibilidad y acompañamiento familiar.',
    entidad: 'FUERZA_INDIGO',
    dominio: 'UNION_DEFENSE',
    materias: [
      'DISCRIMINATION_OR_ADJUSTMENTS',
      'EDUCATION_ACCESS',
      'HEALTH_ACCESS',
      'ACCESSIBILITY',
      'FAMILY_GUIDANCE',
    ],
  },
  {
    codigo: 'atencion-social',
    nombre: 'Atención social de Alianza Índigo',
    descripcion: 'Acompañamiento social, riesgo psicosocial y situaciones de violencia o urgencia.',
    entidad: 'ALIANZA_INDIGO',
    dominio: 'SOCIAL_ATTENTION',
    materias: [
      'PSYCHOSOCIAL_RISK',
      'VIOLENCE_OR_URGENCY',
      'FAMILY_GUIDANCE',
      'GENERAL_CONTACT',
      'OTHER',
    ],
  },
];

/** Un panel por su dirección, o nada. Nunca uno inventado. */
export function panelPorCodigo(codigo: string): PanelDeCoordinacion | null {
  return PANELES.find((panel) => panel.codigo === codigo) ?? null;
}

/**
 * Materias que **ningún** panel del sindicato recoge.
 *
 * Existe para que la comprobación se pueda escribir: un expediente sindical de
 * una materia que no está en ningún panel no aparecería en ninguna bandeja de
 * coordinación, y nadie lo sabría hasta que alguien preguntara por él.
 */
export function materiasSinPanel(dominio: CaseDomain, entidad: LegalEntityCode): readonly SupportRequestType[] {
  const cubiertas = new Set(
    PANELES.filter((panel) => panel.dominio === dominio && panel.entidad === entidad).flatMap(
      (panel) => panel.materias,
    ),
  );
  const todas: readonly SupportRequestType[] = [
    'GENERAL_CONTACT',
    'INDIVIDUAL_LABOR_DISPUTE',
    'COLLECTIVE_DISPUTE',
    'DISCRIMINATION_OR_ADJUSTMENTS',
    'EDUCATION_ACCESS',
    'HEALTH_ACCESS',
    'ACCESSIBILITY',
    'FAMILY_GUIDANCE',
    'PSYCHOSOCIAL_RISK',
    'VIOLENCE_OR_URGENCY',
    'TRAINING_OR_INSTITUTIONAL_SUPPORT',
    'OTHER',
  ];
  return todas.filter((materia) => !cubiertas.has(materia));
}
