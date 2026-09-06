/**
 * Interfaz pública del dominio de documentos institucionales.
 *
 * Lo que se exporta aquí es puro y determinista: la sustitución de variables,
 * la composición del documento y el escape del texto. Se comprueba sin base de
 * datos, y quien reciba un documento puede recomponerlo con la plantilla y la
 * instantánea de variables para verificar que dice lo que dijo.
 */
export {
  variablesUsadas,
  variablesDeclaradas,
  renderizarCuerpo,
  componerDocumento,
  escaparHtml,
  MARCA_DE_VARIABLE,
  CODIGO_DE_PLANTILLA,
  NOMBRE_DE_VARIABLE,
} from './templates';
