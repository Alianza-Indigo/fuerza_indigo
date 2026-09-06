/**
 * Entrada pura del módulo de entrada única.
 *
 * Lo que aquí vive no toca la base ni el motor de permisos: son tablas con
 * nombre y funciones que se pueden probar con una entrada y una salida. Existe
 * como segunda entrada pública para que las pantallas del navegador puedan
 * nombrar una materia sin arrastrar los casos de uso (ARCHITECTURE §4.2).
 */
export {
  proponerCanalizacion,
  NOMBRE_DE_ENTIDAD,
  NOMBRE_DE_MATERIA,
  type PropuestaDeCanalizacion,
  type EntradaDeClasificacion,
} from './routing';
