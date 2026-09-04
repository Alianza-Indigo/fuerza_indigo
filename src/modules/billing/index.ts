/** Interfaz pública del módulo de finanzas. */
export {
  createProduct,
  createPrice,
  archiveProduct,
  reactivateProduct,
  createProductSchema,
  createPriceSchema,
  archiveProductSchema,
  reactivateProductSchema,
  type CreateProductInput,
  type CreatePriceInput,
} from './application/catalog';
export {
  catalogList,
  priceHistory,
  currentPrice,
  billableEntities,
  type CatalogRow,
  type PriceRow,
  type BillableEntity,
} from './application/catalog-queries';
