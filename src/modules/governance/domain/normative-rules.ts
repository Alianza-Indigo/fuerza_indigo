import { z } from 'zod';

/**
 * Umbrales estatutarios: forma, nombres y validación (PRD §9.3, §9.4).
 *
 * Vive aparte del caso de uso porque **la pantalla también lo necesita**, y la
 * pantalla corre en el navegador: importar desde aquí no debe arrastrar la
 * conexión a la base. Todo lo de este archivo es puro y sin dependencias de
 * plataforma.
 */

/**
 * Reglas de mayoría admitidas.
 *
 * Son exactamente las tres que el modelo de datos reconoce en un punto del
 * orden del día (`RequiredMajority`): la ordinaria y las dos calificadas. Un
 * vocabulario más ancho aquí produciría versiones normativas que la asamblea no
 * podría aplicar, porque el punto que se vota no sabría representarlas.
 */
const MAYORIA = ['SIMPLE', 'TWO_THIRDS', 'THREE_FOURTHS'] as const;
/**
 * Bases de quórum admitidas: las dos que enuncia el PRD §9.4 —«la mitad más uno
 * del padrón aplicable» y «los agremiados presentes»— y las dos que guarda la
 * convocatoria.
 */
const QUORUM = ['HALF_PLUS_ONE', 'THOSE_PRESENT'] as const;

export type MajorityRule = (typeof MAYORIA)[number];
export type QuorumRule = (typeof QUORUM)[number];

/**
 * Umbrales estatutarios que la plataforma usa para decidir.
 *
 * Cada campo existe porque algo del sistema lo consulta. No hay aquí ningún
 * valor decorativo: si nadie lo lee, no se pide.
 */
export const normativeRulesSchema = z.object({
  /** Duración del periodo del Comité Ejecutivo Nacional, en meses (PRD §9.3). */
  executiveCommitteeTermMonths: z.int().min(1).max(120),
  /** Integrantes de la Comisión de Vigilancia y Fiscalización (PRD §9.3). */
  oversightCommissionSeats: z.int().min(1).max(50),
  /** Integrantes de la Comisión Electoral (PRD §9.3). */
  electoralCommissionSeats: z.int().min(1).max(50),
  /** Base de quórum en primera convocatoria (PRD §9.4). */
  firstCallQuorum: z.enum(QUORUM),
  /** Base de quórum en segunda convocatoria (PRD §9.4). */
  secondCallQuorum: z.enum(QUORUM),
  /** Mayoría con la que se aprueba un acuerdo ordinario (PRD §9.4). */
  ordinaryMajority: z.enum(MAYORIA),
  /** Asambleas ordinarias mínimas al año (PRD §9.4). */
  ordinaryAssemblyMinimumPerYear: z.int().min(1).max(12),
  /** Anticipación mínima de la convocatoria ordinaria, en días naturales. */
  assemblyNoticeDaysOrdinary: z.int().min(1).max(180),
  /** Anticipación mínima de la convocatoria extraordinaria, en días naturales. */
  assemblyNoticeDaysExtraordinary: z.int().min(1).max(180),
  /** Porcentaje de agremiados que puede pedir una asamblea extraordinaria. */
  extraordinaryAssemblyPetitionPercent: z.number().min(0.1).max(100),
  /** Si el estatuto admite la reelección en un cargo. */
  reelectionAllowed: z.boolean(),
  /** Mayoría calificada para reformar los estatutos. */
  statuteAmendmentMajority: z.enum(MAYORIA),
  /** Mayoría calificada para acordar la disolución. */
  dissolutionMajority: z.enum(MAYORIA),
  /** Anticipación mínima de la convocatoria a elecciones, en días naturales. */
  electionCallNoticeDays: z.int().min(1).max(365),
  /** Porcentaje mínimo de cada género en una planilla (proporcionalidad). */
  genderProportionalityMinPercent: z.number().min(0).max(50),
  /** Días que tiene la persona señalada para contestar y ofrecer pruebas. */
  disciplinaryAnswerDays: z.int().min(1).max(180),
  /** Días para recurrir una resolución disciplinaria. */
  disciplinaryAppealDays: z.int().min(1).max(180),
  /** Mayoría con la que se aprueba una consulta de contrato colectivo. */
  bargainingConsultationMajority: z.enum(MAYORIA),
});

export type NormativeRules = z.infer<typeof normativeRulesSchema>;

/** Nombres legibles de cada umbral, para la pantalla y para los mensajes. */
export const NOMBRE_DE_REGLA: Readonly<Record<keyof NormativeRules, string>> = {
  executiveCommitteeTermMonths: 'Duración del periodo del Comité Ejecutivo (meses)',
  oversightCommissionSeats: 'Integrantes de la Comisión de Vigilancia',
  electoralCommissionSeats: 'Integrantes de la Comisión Electoral',
  firstCallQuorum: 'Quórum en primera convocatoria',
  secondCallQuorum: 'Quórum en segunda convocatoria',
  ordinaryMajority: 'Mayoría ordinaria',
  ordinaryAssemblyMinimumPerYear: 'Asambleas ordinarias mínimas al año',
  assemblyNoticeDaysOrdinary: 'Anticipación de la convocatoria ordinaria (días)',
  assemblyNoticeDaysExtraordinary: 'Anticipación de la convocatoria extraordinaria (días)',
  extraordinaryAssemblyPetitionPercent: 'Porcentaje de agremiados que puede pedir una extraordinaria',
  reelectionAllowed: 'Se admite la reelección',
  statuteAmendmentMajority: 'Mayoría para reformar los estatutos',
  dissolutionMajority: 'Mayoría para acordar la disolución',
  electionCallNoticeDays: 'Anticipación de la convocatoria a elecciones (días)',
  genderProportionalityMinPercent: 'Porcentaje mínimo de cada género en una planilla',
  disciplinaryAnswerDays: 'Días para contestar y ofrecer pruebas',
  disciplinaryAppealDays: 'Días para recurrir',
  bargainingConsultationMajority: 'Mayoría en una consulta de contrato colectivo',
};

export const CLAVES_DE_REGLA = Object.keys(NOMBRE_DE_REGLA) as readonly (keyof NormativeRules)[];

/** Forma del control con el que se captura cada umbral. */
export type FormaDeRegla = 'entero' | 'porcentaje' | 'booleano' | 'mayoria' | 'quorum';

export const FORMA_DE_REGLA: Readonly<Record<keyof NormativeRules, FormaDeRegla>> = {
  executiveCommitteeTermMonths: 'entero',
  oversightCommissionSeats: 'entero',
  electoralCommissionSeats: 'entero',
  firstCallQuorum: 'quorum',
  secondCallQuorum: 'quorum',
  ordinaryMajority: 'mayoria',
  ordinaryAssemblyMinimumPerYear: 'entero',
  assemblyNoticeDaysOrdinary: 'entero',
  assemblyNoticeDaysExtraordinary: 'entero',
  extraordinaryAssemblyPetitionPercent: 'porcentaje',
  reelectionAllowed: 'booleano',
  statuteAmendmentMajority: 'mayoria',
  dissolutionMajority: 'mayoria',
  electionCallNoticeDays: 'entero',
  genderProportionalityMinPercent: 'porcentaje',
  disciplinaryAnswerDays: 'entero',
  disciplinaryAppealDays: 'entero',
  bargainingConsultationMajority: 'mayoria',
};

/** Etiquetas en español de las reglas de mayoría y de quórum. */
export const NOMBRE_DE_MAYORIA: Readonly<Record<MajorityRule, string>> = {
  SIMPLE: 'Mayoría simple — más votos a favor que en contra',
  TWO_THIRDS: 'Dos terceras partes de los votos emitidos',
  THREE_FOURTHS: 'Tres cuartas partes de los votos emitidos',
};

export const NOMBRE_DE_QUORUM: Readonly<Record<QuorumRule, string>> = {
  HALF_PLUS_ONE: 'La mitad más uno del padrón aplicable',
  THOSE_PRESENT: 'Quienes estén presentes',
};

/**
 * Fracción de los votos emitidos que exige cada mayoría calificada.
 *
 * La simple no tiene fracción: se decide comparando a favor con en contra, y
 * las abstenciones no cuentan en ninguno de los dos lados. Por eso es `null` y
 * no `0.5`: media parte de los votos emitidos es otra regla distinta.
 */
export const FRACCION_DE_MAYORIA: Readonly<Record<MajorityRule, number | null>> = {
  SIMPLE: null,
  TWO_THIRDS: 2 / 3,
  THREE_FOURTHS: 3 / 4,
};

/**
 * Decide si un resultado alcanza la mayoría exigida.
 *
 * `emitidos` son todos los votos depositados, abstenciones incluidas: una
 * mayoría calificada se mide sobre lo emitido, no sobre lo no abstenido.
 */
export function alcanzaMayoria(
  regla: MajorityRule,
  aFavor: number,
  enContra: number,
  emitidos: number,
): boolean {
  const fraccion = FRACCION_DE_MAYORIA[regla];
  if (fraccion === null) return aFavor > enContra;
  return emitidos > 0 && aFavor >= fraccion * emitidos;
}

export const MAYORIAS = MAYORIA;
export const QUORUMS = QUORUM;

