CREATE TYPE "IndigoAmbassadorStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

CREATE TABLE "indigo_ambassador" (
  "id" UUID NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "givenName" VARCHAR(80) NOT NULL,
  "familyName" VARCHAR(80) NOT NULL,
  "secondFamilyName" VARCHAR(80),
  "email" VARCHAR(320) NOT NULL,
  "phone" VARCHAR(40),
  "territory" VARCHAR(160),
  "status" "IndigoAmbassadorStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId" UUID NOT NULL,
  "updatedByActorId" UUID NOT NULL,
  "rowVersion" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "indigo_ambassador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "indigo_ambassador_code_key" ON "indigo_ambassador"("code");
CREATE UNIQUE INDEX "indigo_ambassador_email_key" ON "indigo_ambassador"("email");
CREATE INDEX "indigo_ambassador_status_idx" ON "indigo_ambassador"("status");
CREATE INDEX "indigo_ambassador_familyName_givenName_idx" ON "indigo_ambassador"("familyName", "givenName");

ALTER TABLE "membership_application" ADD COLUMN "ambassadorId" UUID;
ALTER TABLE "protected_beneficiary" ADD COLUMN "ambassadorId" UUID;
ALTER TABLE "membership_application" ADD COLUMN "physicalCredentialRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "protected_beneficiary" ADD COLUMN "physicalCredentialRequested" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "membership_application_ambassadorId_createdAt_idx"
  ON "membership_application"("ambassadorId", "createdAt");
CREATE INDEX "protected_beneficiary_ambassadorId_createdAt_idx"
  ON "protected_beneficiary"("ambassadorId", "createdAt");

ALTER TABLE "indigo_ambassador"
  ADD CONSTRAINT "indigo_ambassador_createdByActorId_fkey"
  FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "indigo_ambassador"
  ADD CONSTRAINT "indigo_ambassador_updatedByActorId_fkey"
  FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_ambassadorId_fkey"
  FOREIGN KEY ("ambassadorId") REFERENCES "indigo_ambassador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protected_beneficiary"
  ADD CONSTRAINT "protected_beneficiary_ambassadorId_fkey"
  FOREIGN KEY ("ambassadorId") REFERENCES "indigo_ambassador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "indigo_ambassador" TO fuerza_app;
