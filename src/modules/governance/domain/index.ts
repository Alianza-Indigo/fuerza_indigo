/**
 * Interfaz pública **del dominio** de la vida institucional.
 *
 * Es una segunda entrada del módulo, junto a `@/modules/governance`, y existe
 * por una razón concreta: las pantallas que corren en el navegador necesitan
 * los nombres y la forma de los umbrales estatutarios, y la interfaz de casos
 * de uso arrastra consigo la conexión a la base. Lo que se exporta aquí es puro
 * (docs/ARCHITECTURE.md §4.2).
 */
export {
  normativeRulesSchema,
  CLAVES_DE_REGLA,
  NOMBRE_DE_REGLA,
  FORMA_DE_REGLA,
  NOMBRE_DE_MAYORIA,
  NOMBRE_DE_QUORUM,
  MAYORIAS,
  QUORUMS,
  FRACCION_DE_MAYORIA,
  alcanzaMayoria,
  type NormativeRules,
  type MajorityRule,
  type QuorumRule,
  type FormaDeRegla,
} from './normative-rules';
