/**
 * Entrada pura del módulo de casos.
 *
 * Traducciones y tablas con nombre, sin base de datos ni motor de permisos, de
 * modo que una pantalla del navegador pueda nombrar lo que enseña sin arrastrar
 * los casos de uso (ARCHITECTURE §4.2).
 */
export { compartimentoDe } from './access';
export { NOMBRE_DE_ASIGNACION, QUE_HACE_CADA_PAPEL } from './team';
export {
  CAMPOS_TRANSFERIBLES,
  NOMBRE_DE_CANALIZACION,
  CANALIZACIONES_CERRADAS,
  type CampoTransferible,
} from './referral';
export {
  RUTA_DEL_PROTOCOLO_DE_RIESGO,
  NOMBRE_DE_RIESGO,
  QUE_SIGNIFICA_EL_RIESGO,
  TIPOS_QUE_MUESTRAN_EL_PROTOCOLO,
} from './risk';
export {
  QUE_SIGNIFICA_EL_RESULTADO,
  EXIGEN_CANALIZACION_ACEPTADA,
  RESULTADOS_QUE_ADMITEN_REAPERTURA,
} from './closure';
export { NOMBRE_DE_DOCUMENTO, CLASIFICACION_MINIMA, SE_ENSENAN_A_LA_PERSONA } from './documents';
export { NOMBRE_DE_TAREA, DESTINOS_DE_TAREA, TAREAS_CERRADAS } from './tasks';
export {
  ALCANCE_DE_LECTURA,
  NOMBRE_DE_AUDIENCIA,
  QUE_SIGNIFICA_LA_AUDIENCIA,
  type ClaseDeLectura,
} from './audience';
export { EXIGEN_REPRESENTACION, NOMBRE_DE_PAPEL, VEN_EL_EXPEDIENTE } from './participation';
export {
  NOMBRE_DE_DOMINIO,
  NOMBRE_DE_ESTADO,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_RESULTADO,
  TONO_DE_PRIORIDAD,
} from './labels';
