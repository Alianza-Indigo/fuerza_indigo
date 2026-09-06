import type { CaseDocumentKind, FileClassification } from '@prisma-client/enums';

/** Cómo se nombra en pantalla cada clase de documento. */
export const NOMBRE_DE_DOCUMENTO: Record<CaseDocumentKind, string> = {
  EVIDENCE: 'prueba',
  IDENTIFICATION: 'identificación',
  LEGAL_FILING: 'escrito judicial o administrativo',
  MEDICAL_OR_CLINICAL: 'documento clínico',
  CORRESPONDENCE: 'correspondencia',
  INTERNAL_WORKING: 'trabajo interno',
  OTHER: 'otro',
};

/**
 * Con qué clasificación se guarda cada clase de documento (PRD §10.3).
 *
 * No es una sugerencia: la clasificación decide **cuánto dura el pase de
 * descarga y qué facultad hace falta para abrirlo**. Dejarla al gusto de quien
 * sube produce identificaciones marcadas como «interno», con pases largos y una
 * auditoría que no sabe que se abrió algo delicado.
 *
 * `null` significa que la clase no la fija: una prueba puede ser un recibo o
 * puede ser una fotografía de lesiones, y forzar una sola marca para las dos
 * obligaría a elegir entre proteger de más y proteger de menos.
 */
export const CLASIFICACION_MINIMA: Record<CaseDocumentKind, FileClassification | null> = {
  EVIDENCE: null,
  IDENTIFICATION: 'SENSITIVE_PERSONAL',
  LEGAL_FILING: 'LEGAL_PRIVILEGED',
  MEDICAL_OR_CLINICAL: 'SENSITIVE_PERSONAL',
  CORRESPONDENCE: null,
  INTERNAL_WORKING: 'INTERNAL',
  OTHER: null,
};

/**
 * Qué clases se le pueden enseñar a la persona del expediente.
 *
 * El trabajo interno del equipo no está aquí, y no es una omisión: enseñarlo
 * sería enseñarle a la persona cómo se discute su asunto, que no es su asunto.
 * Lo suyo —lo que aportó, lo que se presentó en su nombre, lo que se le
 * escribió— sí.
 */
export const SE_ENSENAN_A_LA_PERSONA: readonly CaseDocumentKind[] = [
  'EVIDENCE',
  'IDENTIFICATION',
  'LEGAL_FILING',
  'MEDICAL_OR_CLINICAL',
  'CORRESPONDENCE',
  'OTHER',
];
