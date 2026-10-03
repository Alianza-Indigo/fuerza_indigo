-- El registro protegido es una calidad persistente. La atención vive en
-- expedientes independientes y puede abrirse/cerrarse cuantas veces haga falta.

CREATE TYPE "ProtectedBeneficiaryProfile" AS ENUM (
  'NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER'
);
CREATE TYPE "BeneficiaryRevocationReason" AS ENUM (
  'IMPERSONATION', 'DUPLICATE', 'ADMINISTRATIVE_ERROR', 'FALSE_INFORMATION',
  'MISUSE', 'PERSON_REQUEST', 'OTHER'
);

ALTER TABLE "protected_beneficiary"
  ADD COLUMN "profileKind" "ProtectedBeneficiaryProfile",
  ADD COLUMN "revokedAt" TIMESTAMPTZ(3),
  ADD COLUMN "revocationReasonKind" "BeneficiaryRevocationReason",
  ADD COLUMN "revocationReason" TEXT,
  ADD COLUMN "revokedByActorId" UUID;

UPDATE "protected_beneficiary"
SET "profileKind" = CASE
  WHEN "initialNeed" ILIKE 'Perfil declarado: Persona cuidadora.%' THEN 'CAREGIVER'::"ProtectedBeneficiaryProfile"
  WHEN "initialNeed" ILIKE 'Perfil declarado: Familiar%' OR "originKind" = 'FAMILY_OR_CAREGIVER'
    THEN 'FAMILY_MEMBER'::"ProtectedBeneficiaryProfile"
  ELSE 'NEURODIVERGENT_PERSON'::"ProtectedBeneficiaryProfile"
END;

ALTER TABLE "protected_beneficiary"
  ALTER COLUMN "profileKind" SET NOT NULL;

ALTER TABLE "case_file" ADD COLUMN "protectedBeneficiaryId" UUID;

-- Cada atención que estaba incrustada en la ficha se conserva como expediente.
INSERT INTO "case_file" (
  "id", "folio", "publicId", "supportRequestId", "protectedBeneficiaryId",
  "legalEntityId", "domain", "caseType", "priority", "territorialUnitId",
  "originalSummary", "status", "openedAt", "closedAt", "closeOutcome",
  "closeReason", "createdAt", "updatedAt", "createdByActorId",
  "updatedByActorId", "rowVersion"
)
SELECT
  (substr(md5('beneficiary-case:' || b."id"::text), 1, 8) || '-' ||
   substr(md5('beneficiary-case:' || b."id"::text), 9, 4) || '-' ||
   substr(md5('beneficiary-case:' || b."id"::text), 13, 4) || '-' ||
   substr(md5('beneficiary-case:' || b."id"::text), 17, 4) || '-' ||
   substr(md5('beneficiary-case:' || b."id"::text), 21, 12))::uuid,
  'BM-' || substr(replace(b."id"::text, '-', ''), 1, 20),
  'BM' || substr(replace(b."id"::text, '-', ''), 1, 20),
  NULL,
  b."id",
  b."legalEntityId",
  'SOCIAL_ATTENTION'::"CaseDomain",
  'OTHER'::"SupportRequestType",
  CASE b."urgencyLevel"
    WHEN 'URGENT' THEN 'CRITICAL'::"CasePriority"
    WHEN 'PRIORITY' THEN 'HIGH'::"CasePriority"
    ELSE 'NORMAL'::"CasePriority"
  END,
  b."territorialUnitId",
  b."initialNeed",
  CASE b."status"
    WHEN 'IN_ATTENTION' THEN 'IN_PROGRESS'::"CaseStatus"
    WHEN 'REFERRED' THEN 'REFERRED'::"CaseStatus"
    WHEN 'CLOSED' THEN 'CLOSED'::"CaseStatus"
    WHEN 'ARCHIVED' THEN 'CLOSED'::"CaseStatus"
    ELSE 'OPEN'::"CaseStatus"
  END,
  b."createdAt",
  CASE WHEN b."status" IN ('CLOSED', 'ARCHIVED') THEN COALESCE(b."closedAt", b."updatedAt") END,
  CASE
    WHEN b."status" = 'CLOSED' THEN 'RESOLVED'::"CaseOutcome"
    WHEN b."status" = 'ARCHIVED' THEN 'NO_CONTACT'::"CaseOutcome"
  END,
  b."closeReason",
  b."createdAt",
  b."updatedAt",
  b."createdByActorId",
  b."updatedByActorId",
  b."rowVersion"
FROM "protected_beneficiary" b;
-- Los registros preventivos públicos no eran solicitudes de atención. Retirar
-- los expedientes artificiales que nacieron del texto de relleno anterior.
DELETE FROM "case_file"
WHERE "protectedBeneficiaryId" IN (
  SELECT "id" FROM "protected_beneficiary"
  WHERE "initialNeed" ILIKE '%Registro preventivo; por ahora no declaró una necesidad específica.%'
);

INSERT INTO "case_participant" (
  "id", "caseId", "personId", "role", "membershipQuality", "canViewCase",
  "addedAt", "createdAt", "updatedAt", "createdByActorId", "updatedByActorId", "rowVersion"
)
SELECT
  (substr(md5('beneficiary-participant:' || b."id"::text), 1, 8) || '-' ||
   substr(md5('beneficiary-participant:' || b."id"::text), 9, 4) || '-' ||
   substr(md5('beneficiary-participant:' || b."id"::text), 13, 4) || '-' ||
   substr(md5('beneficiary-participant:' || b."id"::text), 17, 4) || '-' ||
   substr(md5('beneficiary-participant:' || b."id"::text), 21, 12))::uuid,
  c."id", b."personId", 'APPLICANT'::"CaseParticipantRole",
  'PROTECTED_BENEFICIARY'::"CaseMembershipQuality", true,
  b."createdAt", b."createdAt", b."updatedAt", b."createdByActorId",
  b."updatedByActorId", 0
FROM "protected_beneficiary" b
JOIN "case_file" c ON c."protectedBeneficiaryId" = b."id";

INSERT INTO "case_assignment" (
  "id", "caseId", "userId", "assignmentRole", "assignedById", "assignedAt",
  "createdAt", "updatedAt", "createdByActorId", "updatedByActorId", "rowVersion"
)
SELECT
  (substr(md5('beneficiary-assignment:' || b."id"::text), 1, 8) || '-' ||
   substr(md5('beneficiary-assignment:' || b."id"::text), 9, 4) || '-' ||
   substr(md5('beneficiary-assignment:' || b."id"::text), 13, 4) || '-' ||
   substr(md5('beneficiary-assignment:' || b."id"::text), 17, 4) || '-' ||
   substr(md5('beneficiary-assignment:' || b."id"::text), 21, 12))::uuid,
  c."id", b."registeredById", 'OWNER'::"CaseAssignmentRole", b."registeredById",
  b."createdAt", b."createdAt", b."updatedAt", b."createdByActorId",
  b."updatedByActorId", 0
FROM "protected_beneficiary" b
JOIN "case_file" c ON c."protectedBeneficiaryId" = b."id"
WHERE b."registeredById" IS NOT NULL;

-- Consolidar altas históricas repetidas antes de imponer la unicidad actual.
CREATE TEMP TABLE beneficiary_keeper AS
SELECT "id", first_value("id") OVER (
  PARTITION BY "personId", "legalEntityId" ORDER BY "createdAt", "id"
) AS keeper_id
FROM "protected_beneficiary";

UPDATE "case_file" c
SET "protectedBeneficiaryId" = k.keeper_id
FROM beneficiary_keeper k
WHERE c."protectedBeneficiaryId" = k."id" AND k."id" <> k.keeper_id;

UPDATE "member_credential" mc
SET "protectedBeneficiaryId" = k.keeper_id
FROM beneficiary_keeper k
WHERE mc."protectedBeneficiaryId" = k."id" AND k."id" <> k.keeper_id;

UPDATE "protected_beneficiary" keeper
SET
  "hasDigitalAccount" = merged.has_digital,
  "physicalCredentialRequested" = merged.physical_requested
FROM (
  SELECT k.keeper_id, bool_or(b."hasDigitalAccount") AS has_digital,
         bool_or(b."physicalCredentialRequested") AS physical_requested
  FROM beneficiary_keeper k
  JOIN "protected_beneficiary" b ON b."id" = k."id"
  GROUP BY k.keeper_id
) merged
WHERE keeper."id" = merged.keeper_id;

DELETE FROM "protected_beneficiary" b
USING beneficiary_keeper k
WHERE b."id" = k."id" AND k."id" <> k.keeper_id;

-- Un cierre antiguo cerraba la atención y revocaba la credencial. Como ya no
-- termina el registro, se reactiva solo la credencial revocada por ese cierre.
WITH latest AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "protectedBeneficiaryId" ORDER BY "issuedAt" DESC, "id" DESC
  ) AS position
  FROM "member_credential"
  WHERE "protectedBeneficiaryId" IS NOT NULL
    AND "revokeReason" LIKE 'Terminó el registro protegido:%'
)
UPDATE "member_credential" mc
SET "status" = 'ACTIVE', "revokedAt" = NULL, "revokeReason" = NULL
FROM latest l
WHERE mc."id" = l."id" AND l.position = 1;

WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "protectedBeneficiaryId" ORDER BY "issuedAt" DESC, "id" DESC
  ) AS position
  FROM "member_credential"
  WHERE "protectedBeneficiaryId" IS NOT NULL AND "status" = 'ACTIVE'
)
UPDATE "member_credential" mc
SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP,
    "revokeReason" = 'Credencial duplicada consolidada durante la migración'
FROM ranked r
WHERE mc."id" = r."id" AND r.position > 1;

ALTER TABLE "protected_beneficiary"
  DROP CONSTRAINT "protected_beneficiary_cierre_con_motivo",
  DROP CONSTRAINT "protected_beneficiary_estado_coherente_con_el_cierre";

ALTER TABLE "protected_beneficiary" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "BeneficiaryStatus" RENAME TO "BeneficiaryAttentionStatus_legacy";
CREATE TYPE "BeneficiaryStatus" AS ENUM ('ACTIVE', 'REVOKED');
ALTER TABLE "protected_beneficiary"
  ALTER COLUMN "status" TYPE "BeneficiaryStatus" USING ('ACTIVE'::"BeneficiaryStatus"),
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "BeneficiaryAttentionStatus_legacy";

ALTER TABLE "protected_beneficiary"
  DROP COLUMN "initialNeed",
  DROP COLUMN "urgencyLevel",
  DROP COLUMN "closedAt",
  DROP COLUMN "closeReason",
  ADD CONSTRAINT "protected_beneficiary_revocation_consistency" CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revocationReasonKind" IS NULL
      AND "revocationReason" IS NULL AND "revokedByActorId" IS NULL)
    OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revocationReasonKind" IS NOT NULL
      AND "revocationReason" IS NOT NULL AND "revokedByActorId" IS NOT NULL)
  );
DROP TYPE "BeneficiaryUrgency";

DROP INDEX IF EXISTS "protected_beneficiary_personId_idx";
CREATE UNIQUE INDEX "protected_beneficiary_personId_legalEntityId_key"
  ON "protected_beneficiary"("personId", "legalEntityId");
CREATE INDEX "case_file_protectedBeneficiaryId_status_idx"
  ON "case_file"("protectedBeneficiaryId", "status");

ALTER TABLE "protected_beneficiary"
  ADD CONSTRAINT "protected_beneficiary_revokedByActorId_fkey"
  FOREIGN KEY ("revokedByActorId") REFERENCES "actor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_file"
  ADD CONSTRAINT "case_file_protectedBeneficiaryId_fkey"
  FOREIGN KEY ("protectedBeneficiaryId") REFERENCES "protected_beneficiary"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_file"
  ADD CONSTRAINT "case_file_protected_beneficiary_social_only" CHECK (
    "protectedBeneficiaryId" IS NULL OR "domain" = 'SOCIAL_ATTENTION'
  );

-- La Secretaría General puede revocar; el Superadmin raíz obtiene todo el
-- catálogo directamente del motor de políticas. La migración actualiza también
-- instalaciones existentes, que no vuelven a ejecutar la semilla al desplegar.
INSERT INTO "permission" (
  "id", "code", "module", "resource", "action", "sensitivity",
  "requiresReason", "needsAssignment", "compartment", "description",
  "createdAt", "updatedAt"
)
VALUES (
  (substr(md5('permission:membership.beneficiary.revoke'), 1, 8) || '-' ||
   substr(md5('permission:membership.beneficiary.revoke'), 9, 4) || '-' ||
   substr(md5('permission:membership.beneficiary.revoke'), 13, 4) || '-' ||
   substr(md5('permission:membership.beneficiary.revoke'), 17, 4) || '-' ||
   substr(md5('permission:membership.beneficiary.revoke'), 21, 12))::uuid,
  'membership.beneficiary.revoke', 'membership', 'beneficiary', 'revoke',
  'CRITICAL', true, false, NULL,
  'Revocar un registro de persona beneficiaria', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "sensitivity" = EXCLUDED."sensitivity",
  "requiresReason" = EXCLUDED."requiresReason",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "role" r
JOIN "permission" p ON p."code" = 'membership.beneficiary.revoke'
WHERE r."code" = 'EXECUTIVE_SECRETARY'
ON CONFLICT DO NOTHING;
