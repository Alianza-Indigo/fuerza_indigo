/** Interfaz pública del módulo del catálogo del ecosistema. */
export { catalogoPublicado } from './application/catalog';
export {
  catalogoCompleto,
  cambiarVisibilidad,
  editarFicha,
  editarFichaSchema,
  cambiarVisibilidadSchema,
  type EditarFichaInput,
  type CambiarVisibilidadInput,
  type FichaAdministrable,
} from './application/administration';
export type { FichaDelEcosistema, ModuloDeFicha } from './domain/link';
