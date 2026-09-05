/**
 * Interfaz pública del dominio de la votación.
 *
 * Es puro y sin dependencias de plataforma: lo usan las pruebas adversarias
 * que comprueban el secreto del voto, que no deben arrastrar la base de datos
 * para verificar una firma (docs/ARCHITECTURE.md §4.2).
 */
export {
  nuevaSalDeProceso,
  emitirCredencial,
  credencialValida,
  huellaDeCredencial,
  nuevoCodigoDeVerificacion,
  nuevoCodigoDeAcuse,
} from './credentials';
