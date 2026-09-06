/**
 * Entrada pura del módulo de casos.
 *
 * Traducciones y tablas con nombre, sin base de datos ni motor de permisos, de
 * modo que una pantalla del navegador pueda nombrar lo que enseña sin arrastrar
 * los casos de uso (ARCHITECTURE §4.2).
 */
export { compartimentoDe } from './access';
export {
  NOMBRE_DE_DOMINIO,
  NOMBRE_DE_ESTADO,
  NOMBRE_DE_PRIORIDAD,
  NOMBRE_DE_RESULTADO,
  TONO_DE_PRIORIDAD,
} from './labels';
