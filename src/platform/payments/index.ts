/** Interfaz pública del cobro. */
export {
  stripe,
  stripeCapability,
  setStripeForTests,
  secretKeyFor,
  webhookSecretFor,
  accountFromSlug,
  type StripePort,
  type CheckoutSession,
  type CheckoutLineItem,
  type CreateCheckoutInput,
  type CreatePortalInput,
  type CreateRefundInput,
} from './stripe-port';
export {
  verifyStripeSignature,
  signStripePayload,
  DEFAULT_TOLERANCE_SECONDS,
  type SignatureResult,
  type SignatureFailure,
} from './signature';
