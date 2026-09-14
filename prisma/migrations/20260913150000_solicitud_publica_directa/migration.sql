-- La solicitud pública deja de ser un mensaje general y se convierte en un
-- expediente formal de afiliación. Los campos son opcionales para conservar
-- los expedientes históricos y obligatorios en el caso de uso público nuevo.

ALTER TABLE "person"
  ADD COLUMN "curp" CHAR(18);

CREATE UNIQUE INDEX "person_curp_key" ON "person"("curp");

ALTER TYPE "HonoraryProfile" ADD VALUE IF NOT EXISTS 'PROFESSIONAL_OR_COLLABORATOR';

ALTER TABLE "membership_application"
  ADD COLUMN "occupationText" VARCHAR(160),
  ADD COLUMN "territoryHint" VARCHAR(160),
  ADD COLUMN "promoterReference" VARCHAR(160),
  ADD COLUMN "originFingerprint" VARCHAR(64);

CREATE INDEX "membership_application_originFingerprint_createdAt_idx"
  ON "membership_application"("originFingerprint", "createdAt");

ALTER TABLE "protected_beneficiary"
  ADD COLUMN "occupationText" VARCHAR(160),
  ADD COLUMN "territoryHint" VARCHAR(160),
  ADD COLUMN "promoterReference" VARCHAR(160),
  ADD COLUMN "originFingerprint" VARCHAR(64);

CREATE INDEX "protected_beneficiary_originFingerprint_createdAt_idx"
  ON "protected_beneficiary"("originFingerprint", "createdAt");
