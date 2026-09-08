/**
 * El umbral de privacidad de los indicadores de casos vive ahora en la capa
 * compartida (`@/platform/privacy/threshold`): la disciplina es una sola para
 * los casos (Fase 6) y los indicadores territoriales (Fase 9), y una sola
 * definición evita que alguien baje una privacidad y no la otra. Se re-exporta
 * aquí para no romper a quien ya lo importaba por el dominio de casos.
 */
export {
  UMBRAL_DE_PRIVACIDAD,
  aplicarUmbral,
  CIFRA_SUPRIMIDA,
  type Celda,
} from '@/platform/privacy/threshold';
