/**
 * Interfaz pública del dominio electoral: el cálculo de proporcionalidad y sus
 * alertas. Es puro, y por eso lo pueden usar tanto los casos de uso como la
 * pantalla que enseña la advertencia antes de registrar (docs/ARCHITECTURE.md §4.2).
 */
export {
  componerGenero,
  alertasDePlanilla,
  type ComposicionDeGenero,
  type AlertaDePlanilla,
  type GeneroDeclarado,
} from './proportionality';
