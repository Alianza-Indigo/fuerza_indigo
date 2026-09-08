/** Interfaz pública del módulo de tableros (PRD §6.3, §6.4, §24 Fase 9). */
export {
  panelDeGestion,
  type PanelDeGestion,
  type TareaDeGestion,
} from './application/management-panel';

export {
  territorialIndicators,
  territorialIndicatorsSchema,
  type IndicadoresTerritoriales,
  type TerritorialIndicatorsInput,
} from './application/territorial-indicators';

export {
  transparenciaPublica,
  type TransparenciaPublica,
} from './application/public-transparency';
