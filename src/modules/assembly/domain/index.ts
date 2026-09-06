/**
 * Interfaz pública del dominio de asambleas.
 *
 * La huella del padrón congelado se calcula aquí, sin base de datos, para que
 * quien reciba un padrón pueda recomputarla por su cuenta y comparar. Una
 * comprobación que solo sabe hacer quien emitió el dato no comprueba nada.
 */
export { huellaDePadron, type RosterEntryShape } from './roster-hash';
