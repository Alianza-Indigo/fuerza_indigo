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
export { priceFor, type AppliedPrice } from './application/pricing';
