/**
 * Interfaz pública del módulo de finanzas.
 *
 * Solo casos de uso y consultas: lo que una pantalla o una ruta puede invocar.
 * Las piezas que un caso de uso usa por dentro —asentar en el libro desde la
 * transacción de un cobro, por ejemplo— **no** se exportan aquí, aunque otro
 * archivo del módulo las importe. Exportarlas anunciaría una superficie que
 * ninguna pantalla usa, y el control `C-F1-02` acusaría con razón que hay
 * funciones sin sitio desde el que ejercerlas.
 */
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
export {
  startCheckout,
  openBillingPortal,
  startCheckoutSchema,
  openPortalSchema,
  CHECKOUT_REUSE_MS,
  type StartCheckoutInput,
  type StartedCheckout,
} from './application/checkout';
export {
  ownPayments,
  ownPayment,
  ownSubscriptions,
  payableCatalog,
  type OwnPaymentRow,
  type OwnSubscriptionRow,
  type PayableRow,
} from './application/my-payments';
export { receiveWebhook, type ReceiveOutcome } from './application/webhooks';
export { processWebhookEvent, type ProcessOutcome } from './application/webhook-processing';
export {
  retryUnreconciledWebhooks,
  RETRY_AFTER_MS,
  MAX_ATTEMPTS,
  ALERT_AFTER_MS,
  type ReconcileSummary,
} from './application/webhook-retry';
export {
  registerManualPayment,
  approveManualPayment,
  rejectManualPayment,
  pendingManualPayments,
  registerManualPaymentSchema,
  approveManualPaymentSchema,
  rejectManualPaymentSchema,
  type RegisterManualPaymentInput,
  type PendingManualPayment,
} from './application/manual-payments';
export {
  requestRefund,
  approveRefund,
  rejectRefund,
  refundQueue,
  requestRefundSchema,
  resolveRefundSchema,
  rejectRefundSchema,
  type RefundRow,
} from './application/refunds';
export {
  grantDiscount,
  revokeDiscount,
  discountList,
  approveScholarship,
  revokeScholarship,
  scholarshipList,
  grantDiscountSchema,
  revokeDiscountSchema,
  approveScholarshipSchema,
  revokeScholarshipSchema,
  type GrantDiscountInput,
  type ApproveScholarshipInput,
  type DiscountRow,
  type ScholarshipRow,
} from './application/discounts';
export { type AppliedPrice } from './application/pricing';
export {
  postAdjustment,
  reverseEntry,
  ledgerEntries,
  postAdjustmentSchema,
  reverseEntrySchema,
  ACCOUNT_CODES,
  type AccountCode,
  type LedgerRow,
  type LedgerTotals,
} from './application/ledger';
export {
  runReconciliation,
  closeReconciliation,
  reconciliationList,
  runReconciliationSchema,
  closeReconciliationSchema,
  type ReconciliationResult,
  type ReconciliationRow,
} from './application/reconciliation';
export {
  registerAsset,
  moveAsset,
  assetRegister,
  registerAssetSchema,
  moveAssetSchema,
  type RegisterAssetInput,
  type MoveAssetInput,
  type AssetRow,
} from './application/assets';
export {
  accountabilityReport,
  exportLedger,
  semesterRange,
  reportSchema,
  exportSchema,
  type AccountabilityReport,
  type AccountTotal,
  type FinancialExport,
} from './application/reports';
