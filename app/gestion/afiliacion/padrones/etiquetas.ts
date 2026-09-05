/**
 * Nombres de los padrones y de lo que se ve en ellos (PRD §7.1).
 *
 * En un módulo sin directiva: los leen la pantalla y los formularios, y una
 * constante declarada dentro de un módulo `'use client'` no cruza esa frontera
 * (ADR-0078).
 */
export const CALIDAD_EXACTA: Record<string, string> = {
  UNION_MEMBER: 'Agremiado',
  HONORARY_AFFILIATE: 'Afiliado honorario',
};

export const ESTADO_DE_TRAMITE: Record<string, string> = {
  PENDING: 'Pendiente',
  PREPARED: 'Preparado',
  SUBMITTED: 'Presentado',
  ACKNOWLEDGED: 'Acusado por la autoridad',
  NOT_REQUIRED: 'No hacía falta informarlo',
};

export const MOVIMIENTO: Record<string, string> = {
  ROSTER_ADDITION: 'Alta',
  ROSTER_REMOVAL: 'Baja',
};

/** Los avances posibles del trámite, con lo que significa cada uno. */
export const AVANCES = [
  { value: 'PREPARED', label: 'Preparado', hint: 'Ya se reunió lo que hay que presentar.' },
  { value: 'SUBMITTED', label: 'Presentado', hint: 'Se entregó ante la autoridad.' },
  {
    value: 'ACKNOWLEDGED',
    label: 'Acusado',
    hint: 'La autoridad acusó de recibo. Exige el número de trámite.',
  },
  {
    value: 'NOT_REQUIRED',
    label: 'No hacía falta informarlo',
    hint: 'Exige explicar por qué, para que alguien pueda revisarlo después.',
  },
] as const;
