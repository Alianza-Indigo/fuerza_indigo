-- Catálogo financiero, cobro y libro auxiliar (PRD §11, Fase 3).
--
-- Veinte tablas. Lo que el motor fija aquí, y no el código de la aplicación:
--
--  · **Importes enteros.** `BIGINT` en unidades menores, nunca coma flotante.
--    `0.1 + 0.2` no es `0.3`, y en un libro de cuentas eso no es una curiosidad
--    sino un descuadre que nadie sabe explicar.
--  · **Idempotencia del cobro.** `payment.idempotencyKey` es único en toda la
--    instalación, y `stripe_webhook_event.stripeEventId` también. Stripe reenvía
--    el mismo evento cuando no recibe confirmación: sin esas dos restricciones,
--    un reintento cobra dos veces.
--  · **La entidad receptora en cada movimiento.** Aun operando una sola cuenta
--    de Stripe al principio, separar las cuentas después no obliga a
--    reconstruir el historial (PRD §11.2).

-- CreateEnum
CREATE TYPE "StripeAccountKey" AS ENUM ('FUERZA', 'ALIANZA');

-- CreateEnum
CREATE TYPE "CatalogProductKind" AS ENUM ('ENROLLMENT_FEE', 'UNION_DUE_ORDINARY', 'UNION_DUE_EXTRAORDINARY', 'HONORARY_MEMBERSHIP', 'SERVICE_SUBSCRIPTION', 'COURSE', 'CIAN_SERVICE', 'CENI_PROGRAM', 'CENI_ASSESSMENT', 'CENI_CERTIFICATION', 'RENEWAL', 'DONATION');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "ModuleBinding" AS ENUM ('MEMBERSHIP', 'HONORARY_AFFILIATION', 'TOOL_ACCESS', 'CIAN_SERVICE', 'CENI_PROGRAM', 'EVENT_REGISTRATION', 'NONE');

-- CreateEnum
CREATE TYPE "PriceInterval" AS ENUM ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR');

-- CreateEnum
CREATE TYPE "BillingHolderKind" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "BillingAccountStatus" AS ENUM ('ACTIVE', 'DELINQUENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_PAYMENT', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_CHECKOUT', 'STRIPE_SUBSCRIPTION', 'MANUAL_TRANSFER', 'MANUAL_CASH', 'EXEMPTION');

-- CreateEnum
CREATE TYPE "PaymentAppliesTo" AS ENUM ('NONE', 'MEMBERSHIP', 'HONORARY_AFFILIATION', 'TOOL_ENTITLEMENT', 'CIAN_SERVICE', 'CENI_PROGRAM', 'EVENT_REGISTRATION', 'DONATION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FULL_WAIVER');

-- CreateEnum
CREATE TYPE "ScholarshipProgram" AS ENUM ('MEMBERSHIP', 'CIAN_SERVICE', 'COURSE', 'TOOL_ACCESS');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerSourceKind" AS ENUM ('PAYMENT', 'REFUND', 'MANUAL_ADJUSTMENT', 'ASSET_MOVEMENT', 'EXEMPTION');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'BALANCED', 'WITH_DIFFERENCES', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReconciliationExceptionKind" AS ENUM ('UNMATCHED_IN_STRIPE', 'UNMATCHED_IN_LEDGER', 'AMOUNT_MISMATCH', 'UNPROCESSED_EVENT');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('REAL_ESTATE', 'VEHICLE', 'EQUIPMENT', 'FURNITURE', 'BANK_ACCOUNT', 'INTANGIBLE', 'OTHER');

-- CreateEnum
CREATE TYPE "AcquisitionMode" AS ENUM ('PURCHASE', 'DONATION', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'TRANSFERRED', 'DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "AssetMovementKind" AS ENUM ('REGISTERED', 'REVALUED', 'TRANSFERRED', 'ASSIGNED', 'DISPOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED', 'UNRECONCILED');


-- CreateTable
CREATE TABLE "stripe_account_configuration" (
    "id" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "accountKey" "StripeAccountKey" NOT NULL,
    "stripeAccountId" VARCHAR(80),
    "webhookPath" VARCHAR(120) NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL,
    "statementDescriptor" VARCHAR(22) NOT NULL,
    "customerPortalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stripe_account_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_product" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(600) NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "kind" "CatalogProductKind" NOT NULL,
    "stripeProductId" VARCHAR(80),
    "billingMode" "BillingMode" NOT NULL,
    "moduleBinding" "ModuleBinding",
    "requiresAuthorizingResolutionId" UUID,
    "authorizingResolutionNote" VARCHAR(400),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_price" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "interval" "PriceInterval",
    "stripePriceId" VARCHAR(80),
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActorId" UUID NOT NULL,

    CONSTRAINT "catalog_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_account" (
    "id" UUID NOT NULL,
    "holderKind" "BillingHolderKind" NOT NULL,
    "personId" UUID,
    "organizationId" UUID,
    "legalEntityId" UUID NOT NULL,
    "stripeCustomerId" VARCHAR(80),
    "billingEmail" VARCHAR(254) NOT NULL,
    "taxProfile" JSONB,
    "status" "BillingAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "billingAccountId" UUID NOT NULL,
    "catalogPriceId" UUID NOT NULL,
    "stripeSubscriptionId" VARCHAR(80),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "gracePeriodEndsAt" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(400),
    "membershipId" UUID,
    "toolEntitlementId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(24) NOT NULL,
    "billingAccountId" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "catalogPriceId" UUID,
    "stripeAccountKey" "StripeAccountKey" NOT NULL,
    "stripePaymentIntentId" VARCHAR(80),
    "stripeCheckoutSessionId" VARCHAR(80),
    "subscriptionId" UUID,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "netAmountMinor" BIGINT,
    "feeAmountMinor" BIGINT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(80),
    "discountGrantId" UUID,
    "scholarshipId" UUID,
    "manualEvidenceFileId" UUID,
    "manualRegisteredById" UUID,
    "manualApprovedById" UUID,
    "appliesToKind" "PaymentAppliesTo" NOT NULL DEFAULT 'NONE',
    "appliesToId" UUID,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "stripeRefundId" VARCHAR(80),
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "rejectedReason" VARCHAR(400),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_reference" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "externalSystem" VARCHAR(80) NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "series" VARCHAR(20),
    "folio" VARCHAR(40),
    "issuedAt" TIMESTAMPTZ(3),
    "fileObjectId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_grant" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40),
    "name" VARCHAR(160) NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "kind" "DiscountKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "stripeCouponId" VARCHAR(80),
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "agreementDocumentId" UUID,
    "authorizedById" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "discount_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_grant_product" (
    "discountGrantId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "discount_grant_product_pkey" PRIMARY KEY ("discountGrantId","productId")
);

-- CreateTable
CREATE TABLE "scholarship" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "programKind" "ScholarshipProgram" NOT NULL,
    "coveragePercent" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,
    "approvedById" UUID NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scholarship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_evidence" (
    "scholarshipId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarship_evidence_pkey" PRIMARY KEY ("scholarshipId","fileObjectId")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "entryDate" TIMESTAMPTZ(3) NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "accountCode" VARCHAR(40) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sourceKind" "LedgerSourceKind" NOT NULL,
    "sourceId" UUID NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "reason" VARCHAR(600),
    "createdByActorId" UUID NOT NULL,
    "reviewedById" UUID,
    "approvedById" UUID,
    "reconciliationId" UUID,
    "reversalOfEntryId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation" (
    "id" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "stripeAccountKey" "StripeAccountKey" NOT NULL,
    "expectedTotalMinor" BIGINT NOT NULL,
    "observedTotalMinor" BIGINT NOT NULL,
    "differenceMinor" BIGINT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "reportFileId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,

    CONSTRAINT "reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exception" (
    "id" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "kind" "ReconciliationExceptionKind" NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "detail" VARCHAR(600) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" VARCHAR(600),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_register" (
    "id" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "assetKind" "AssetKind" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "acquisitionMode" "AcquisitionMode" NOT NULL,
    "acquiredOn" DATE NOT NULL,
    "documentedValueMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "location" VARCHAR(300),
    "custodianPersonId" UUID,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorizingResolutionId" UUID,
    "authorizingResolutionNote" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_document" (
    "assetId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_document_pkey" PRIMARY KEY ("assetId","fileObjectId")
);

-- CreateTable
CREATE TABLE "asset_movement" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "movementKind" "AssetMovementKind" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "fromCustodianId" UUID,
    "toCustodianId" UUID,
    "amountMinor" BIGINT,
    "authorizingResolutionId" UUID,
    "authorizingResolutionNote" VARCHAR(400),
    "registeredById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_movement_evidence" (
    "movementId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_movement_evidence_pkey" PRIMARY KEY ("movementId","fileObjectId")
);

-- CreateTable
CREATE TABLE "stripe_webhook_event" (
    "id" UUID NOT NULL,
    "stripeAccountKey" "StripeAccountKey" NOT NULL,
    "stripeEventId" VARCHAR(120) NOT NULL,
    "eventType" VARCHAR(120) NOT NULL,
    "apiVersion" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000),
    "resultingPaymentId" UUID,
    "alertedAt" TIMESTAMPTZ(3),

    CONSTRAINT "stripe_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_account_configuration_legalEntityId_key" ON "stripe_account_configuration"("legalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_account_configuration_accountKey_key" ON "stripe_account_configuration"("accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_account_configuration_webhookPath_key" ON "stripe_account_configuration"("webhookPath");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_product_code_key" ON "catalog_product"("code");

-- CreateIndex
CREATE INDEX "catalog_product_legalEntityId_isActive_idx" ON "catalog_product"("legalEntityId", "isActive");

-- CreateIndex
CREATE INDEX "catalog_product_kind_idx" ON "catalog_product"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_price_stripePriceId_key" ON "catalog_price"("stripePriceId");

-- CreateIndex
CREATE INDEX "catalog_price_productId_effectiveFrom_idx" ON "catalog_price"("productId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_price_productId_version_key" ON "catalog_price"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "billing_account_stripeCustomerId_key" ON "billing_account"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "billing_account_personId_idx" ON "billing_account"("personId");

-- CreateIndex
CREATE INDEX "billing_account_organizationId_idx" ON "billing_account"("organizationId");

-- CreateIndex
CREATE INDEX "billing_account_legalEntityId_status_idx" ON "billing_account"("legalEntityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeSubscriptionId_key" ON "subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_billingAccountId_idx" ON "subscription"("billingAccountId");

-- CreateIndex
CREATE INDEX "subscription_status_currentPeriodEnd_idx" ON "subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "payment_publicId_key" ON "payment"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_stripePaymentIntentId_key" ON "payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_stripeCheckoutSessionId_key" ON "payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotencyKey_key" ON "payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_billingAccountId_idx" ON "payment"("billingAccountId");

-- CreateIndex
CREATE INDEX "payment_legalEntityId_status_idx" ON "payment"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE INDEX "payment_paidAt_idx" ON "payment"("paidAt");

-- CreateIndex
CREATE INDEX "payment_subscriptionId_idx" ON "payment"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "refund_stripeRefundId_key" ON "refund"("stripeRefundId");

-- CreateIndex
CREATE INDEX "refund_paymentId_idx" ON "refund"("paymentId");

-- CreateIndex
CREATE INDEX "refund_status_idx" ON "refund"("status");

-- CreateIndex
CREATE INDEX "invoice_reference_paymentId_idx" ON "invoice_reference"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_reference_externalSystem_externalId_key" ON "invoice_reference"("externalSystem", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "discount_grant_code_key" ON "discount_grant"("code");

-- CreateIndex
CREATE INDEX "discount_grant_legalEntityId_idx" ON "discount_grant"("legalEntityId");

-- CreateIndex
CREATE INDEX "discount_grant_validFrom_validTo_idx" ON "discount_grant"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "discount_grant_product_productId_idx" ON "discount_grant_product"("productId");

-- CreateIndex
CREATE INDEX "scholarship_personId_idx" ON "scholarship"("personId");

-- CreateIndex
CREATE INDEX "scholarship_legalEntityId_programKind_idx" ON "scholarship"("legalEntityId", "programKind");

-- CreateIndex
CREATE INDEX "scholarship_evidence_fileObjectId_idx" ON "scholarship_evidence"("fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_reversalOfEntryId_key" ON "ledger_entry"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "ledger_entry_legalEntityId_entryDate_idx" ON "ledger_entry"("legalEntityId", "entryDate");

-- CreateIndex
CREATE INDEX "ledger_entry_sourceKind_sourceId_idx" ON "ledger_entry"("sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "ledger_entry_reconciliationId_idx" ON "ledger_entry"("reconciliationId");

-- CreateIndex
CREATE INDEX "reconciliation_status_idx" ON "reconciliation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_legalEntityId_stripeAccountKey_periodStart_p_key" ON "reconciliation"("legalEntityId", "stripeAccountKey", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "reconciliation_exception_reconciliationId_idx" ON "reconciliation_exception"("reconciliationId");

-- CreateIndex
CREATE INDEX "asset_register_legalEntityId_status_idx" ON "asset_register"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "asset_register_assetKind_idx" ON "asset_register"("assetKind");

-- CreateIndex
CREATE INDEX "asset_document_fileObjectId_idx" ON "asset_document"("fileObjectId");

-- CreateIndex
CREATE INDEX "asset_movement_assetId_occurredOn_idx" ON "asset_movement"("assetId", "occurredOn");

-- CreateIndex
CREATE INDEX "asset_movement_evidence_fileObjectId_idx" ON "asset_movement_evidence"("fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_event_stripeEventId_key" ON "stripe_webhook_event"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_event_stripeAccountKey_receivedAt_idx" ON "stripe_webhook_event"("stripeAccountKey", "receivedAt");

-- CreateIndex
CREATE INDEX "stripe_webhook_event_eventType_idx" ON "stripe_webhook_event"("eventType");

-- CreateIndex
CREATE INDEX "stripe_webhook_event_processingStatus_receivedAt_idx" ON "stripe_webhook_event"("processingStatus", "receivedAt");

-- AddForeignKey
ALTER TABLE "stripe_account_configuration" ADD CONSTRAINT "stripe_account_configuration_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_price" ADD CONSTRAINT "catalog_price_productId_fkey" FOREIGN KEY ("productId") REFERENCES "catalog_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_price" ADD CONSTRAINT "catalog_price_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_catalogPriceId_fkey" FOREIGN KEY ("catalogPriceId") REFERENCES "catalog_price"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_catalogPriceId_fkey" FOREIGN KEY ("catalogPriceId") REFERENCES "catalog_price"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_discountGrantId_fkey" FOREIGN KEY ("discountGrantId") REFERENCES "discount_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_manualEvidenceFileId_fkey" FOREIGN KEY ("manualEvidenceFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_manualRegisteredById_fkey" FOREIGN KEY ("manualRegisteredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_manualApprovedById_fkey" FOREIGN KEY ("manualApprovedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reference" ADD CONSTRAINT "invoice_reference_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reference" ADD CONSTRAINT "invoice_reference_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_grant" ADD CONSTRAINT "discount_grant_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_grant" ADD CONSTRAINT "discount_grant_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_grant" ADD CONSTRAINT "discount_grant_agreementDocumentId_fkey" FOREIGN KEY ("agreementDocumentId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_grant_product" ADD CONSTRAINT "discount_grant_product_discountGrantId_fkey" FOREIGN KEY ("discountGrantId") REFERENCES "discount_grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_grant_product" ADD CONSTRAINT "discount_grant_product_productId_fkey" FOREIGN KEY ("productId") REFERENCES "catalog_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship" ADD CONSTRAINT "scholarship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship" ADD CONSTRAINT "scholarship_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship" ADD CONSTRAINT "scholarship_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_evidence" ADD CONSTRAINT "scholarship_evidence_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_evidence" ADD CONSTRAINT "scholarship_evidence_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "ledger_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_reportFileId_fkey" FOREIGN KEY ("reportFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exception" ADD CONSTRAINT "reconciliation_exception_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_register" ADD CONSTRAINT "asset_register_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_register" ADD CONSTRAINT "asset_register_custodianPersonId_fkey" FOREIGN KEY ("custodianPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_register" ADD CONSTRAINT "asset_register_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document" ADD CONSTRAINT "asset_document_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset_register"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document" ADD CONSTRAINT "asset_document_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement" ADD CONSTRAINT "asset_movement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset_register"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement" ADD CONSTRAINT "asset_movement_fromCustodianId_fkey" FOREIGN KEY ("fromCustodianId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement" ADD CONSTRAINT "asset_movement_toCustodianId_fkey" FOREIGN KEY ("toCustodianId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement" ADD CONSTRAINT "asset_movement_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_evidence" ADD CONSTRAINT "asset_movement_evidence_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "asset_movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_evidence" ADD CONSTRAINT "asset_movement_evidence_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_webhook_event" ADD CONSTRAINT "stripe_webhook_event_resultingPaymentId_fkey" FOREIGN KEY ("resultingPaymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Inmutabilidad del libro auxiliar y de los eventos recibidos.
--
-- Un libro que se puede editar no sirve para rendir cuentas: lo que muestra hoy
-- no demuestra lo que mostraba ayer. Una corrección es un asiento nuevo con
-- `reversalOfEntryId`, y por eso la aplicación conserva `INSERT` y pierde
-- `UPDATE` y `DELETE`. Lo único actualizable es el enlace al corte de
-- conciliación, que no altera el hecho asentado sino que dice en qué corte
-- quedó incluido.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "ledger_entry" FROM fuerza_app;
GRANT UPDATE ("reconciliationId") ON TABLE "ledger_entry" TO fuerza_app;

-- El evento de Stripe se persiste íntegro **antes** de mirarlo (PRD §11.4). Lo
-- que llegó no se toca nunca: si el procesamiento falla, sigue estando para
-- reintentar y para auditar. Lo que sí avanza es el estado del procesamiento.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "stripe_webhook_event" FROM fuerza_app;
GRANT UPDATE (
  "processedAt", "processingStatus", "attempts", "lastError",
  "resultingPaymentId", "alertedAt"
) ON TABLE "stripe_webhook_event" TO fuerza_app;

-- Un movimiento patrimonial es un hecho ocurrido, no un registro editable.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "asset_movement" FROM fuerza_app;

-- El importe y la moneda de un pago no se corrigen: se reembolsa o se asienta
-- una reversión. Lo que sí cambia es su estado, que es lo que el webhook mueve.
REVOKE UPDATE ON TABLE "payment" FROM fuerza_app;
GRANT UPDATE (
  "status", "stripePaymentIntentId", "stripeCheckoutSessionId",
  "netAmountMinor", "feeAmountMinor", "paidAt", "failureCode",
  "manualApprovedById", "appliesToKind", "appliesToId",
  "updatedAt", "rowVersion"
) ON TABLE "payment" TO fuerza_app;
