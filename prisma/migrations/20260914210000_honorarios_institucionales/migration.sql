ALTER TYPE "HonoraryProfile" ADD VALUE IF NOT EXISTS 'INSTITUTION';

ALTER TABLE "membership_application"
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "organizationPublicListingAuthorized" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "membership"
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "organizationPublicListingAuthorized" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership"
  ADD CONSTRAINT "membership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_organizacion_solo_honoraria" CHECK (
    "organizationId" IS NULL OR "category" = 'HONORARY_AFFILIATE'
  ),
  ADD CONSTRAINT "membership_application_publicacion_organizacional_valida" CHECK (
    NOT "organizationPublicListingAuthorized" OR "organizationId" IS NOT NULL
  );

ALTER TABLE "membership"
  ADD CONSTRAINT "membership_organizacion_solo_honoraria" CHECK (
    "organizationId" IS NULL OR "category" = 'HONORARY_AFFILIATE'
  ),
  ADD CONSTRAINT "membership_publicacion_organizacional_valida" CHECK (
    NOT "organizationPublicListingAuthorized" OR "organizationId" IS NOT NULL
  );

CREATE INDEX "membership_application_organizationId_status_idx"
  ON "membership_application"("organizationId", "status");
CREATE INDEX "membership_organizationId_status_idx"
  ON "membership"("organizationId", "status");
CREATE UNIQUE INDEX "organization_legalEntityId_taxId_key"
  ON "organization"("legalEntityId", "taxId");

CREATE UNIQUE INDEX "membership_organization_honorary_live_unique"
  ON "membership"("organizationId", "legalEntityId")
  WHERE "organizationId" IS NOT NULL
    AND "category" = 'HONORARY_AFFILIATE'
    AND "status" IN ('ACTIVE', 'SUSPENDED', 'DISCIPLINARY_PROCESS');
