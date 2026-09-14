-- El beneficiario protegido tiene credencial propia. No acredita membresía ni
-- derechos políticos: acredita únicamente que la persona está bajo protección
-- y puede recibir ayuda de Fuerza Índigo.
ALTER TYPE "CredentialKind" ADD VALUE IF NOT EXISTS 'PROTECTED_BENEFICIARY';

ALTER TABLE "member_credential"
  ADD COLUMN "protectedBeneficiaryId" UUID;

CREATE INDEX "member_credential_protectedBeneficiaryId_idx"
  ON "member_credential"("protectedBeneficiaryId");

ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_protectedBeneficiaryId_fkey"
  FOREIGN KEY ("protectedBeneficiaryId") REFERENCES "protected_beneficiary"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credential"
  DROP CONSTRAINT "member_credential_membresia_segun_el_tipo";

ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_respaldo_segun_el_tipo" CHECK (
    (
      "credentialKind" IN ('UNION_MEMBER', 'HONORARY_AFFILIATE')
      AND "membershipId" IS NOT NULL
      AND "protectedBeneficiaryId" IS NULL
    )
    OR (
      "credentialKind" = 'PROTECTED_BENEFICIARY'
      AND "membershipId" IS NULL
      AND "protectedBeneficiaryId" IS NOT NULL
    )
    OR (
      "credentialKind" IN ('OFFICE_OR_REPRESENTATION', 'AUTHORIZED_PROFESSIONAL')
      AND "membershipId" IS NULL
      AND "protectedBeneficiaryId" IS NULL
    )
  );
