-- Corrección de alcance: CIAN y CENI son plataformas independientes y ya
-- desarrolladas, fuera de este repositorio. Fuerza Índigo solo las presenta
-- como servicios del ecosistema y ofrece su acceso mediante enlace externo
-- (PRD §12, §13 y §14).
--
-- El esquema anterior contenía **anticipos** de esas plataformas: valores de
-- enumeración, roles y una columna que ninguna función de este repositorio
-- escribía. Esta migración los retira.
--
-- PostgreSQL no permite eliminar un valor de un tipo enumerado. Cada tipo
-- afectado se renombra, se vuelve a crear sin los valores retirados, se
-- reasignan las columnas que lo usan y se elimina el tipo antiguo. No se
-- reescribe ninguna migración ya aplicada.
--
-- Antes de tocar los tipos se comprueba que ninguna fila conserve un valor
-- retirado. Si alguna lo hiciera, la migración se detiene con un mensaje
-- explícito en lugar de reinterpretar el dato: un anticipo se retira, un dato
-- real se resuelve a mano.

-- 1. Roles de operación de CIAN y CENI.
--
-- `role_permission` cae en cascada. `role_assignment` es RESTRICT: si alguien
-- tuviera uno de estos roles asignado, el borrado falla y hay que retirar la
-- asignación primero, que es exactamente lo que debe ocurrir.
DELETE FROM role
WHERE code::text IN (
  'CIAN_PROFESSIONAL',
  'CIAN_COORDINATION',
  'CENI_ORG_USER',
  'CENI_ASSESSOR',
  'CENI_COORDINATION'
);

-- 2. Permisos del compartimento clínico, que solo existía para CIAN.
DELETE FROM permission WHERE compartment::text = 'CLINICAL';

-- 3. Comprobación: ninguna fila puede conservar un valor retirado.
DO $$
DECLARE
  sobrante text;
BEGIN
  SELECT string_agg(descripcion, E'\n')
    INTO sobrante
    FROM (
      SELECT 'role.code = ' || code::text AS descripcion FROM role
        WHERE code::text IN ('CIAN_PROFESSIONAL','CIAN_COORDINATION','CENI_ORG_USER','CENI_ASSESSOR','CENI_COORDINATION')
      UNION ALL
      SELECT 'permission.compartment = CLINICAL' FROM permission WHERE compartment::text = 'CLINICAL'
      UNION ALL
      SELECT 'consent.purpose = ' || purpose::text FROM consent
        WHERE purpose::text IN ('CIAN_CARE','CLINICAL_DATA_SHARING','TOOL_IDENTITY_EXCHANGE')
      UNION ALL
      SELECT 'file_object.contextKind = ' || "contextKind"::text FROM file_object
        WHERE "contextKind"::text IN ('CIAN','CENI')
      UNION ALL
      SELECT 'file_object.classification = CLINICAL' FROM file_object WHERE classification::text = 'CLINICAL'
      UNION ALL
      SELECT 'catalog_product.kind = ' || kind::text FROM catalog_product
        WHERE kind::text IN ('CIAN_SERVICE','CENI_PROGRAM','CENI_ASSESSMENT','CENI_CERTIFICATION')
      UNION ALL
      SELECT 'catalog_product.moduleBinding = ' || "moduleBinding"::text FROM catalog_product
        WHERE "moduleBinding"::text IN ('TOOL_ACCESS','CIAN_SERVICE','CENI_PROGRAM')
      UNION ALL
      SELECT 'payment.appliesToKind = ' || "appliesToKind"::text FROM payment
        WHERE "appliesToKind"::text IN ('TOOL_ENTITLEMENT','CIAN_SERVICE','CENI_PROGRAM')
      UNION ALL
      SELECT 'protected_beneficiary.originKind = CIAN' FROM protected_beneficiary WHERE "originKind"::text = 'CIAN'
      UNION ALL
      SELECT 'support_request.requestType = CIAN_ATTENTION' FROM support_request WHERE "requestType"::text = 'CIAN_ATTENTION'
      UNION ALL
      SELECT 'subscription.toolEntitlementId con valor' FROM subscription WHERE "toolEntitlementId" IS NOT NULL
      UNION ALL
      SELECT 'consent_version.requiredFor contiene ' || v FROM consent_version, unnest("requiredFor"::text[]) AS v
        WHERE v IN ('CIAN_CARE','CLINICAL_DATA_SHARING','TOOL_IDENTITY_EXCHANGE')
      UNION ALL
      SELECT 'retention_policy.appliesToClassification contiene CLINICAL' FROM retention_policy
        WHERE 'CLINICAL' = ANY("appliesToClassification"::text[])
      UNION ALL
      SELECT 'retention_policy.appliesToContextKind contiene ' || v FROM retention_policy, unnest("appliesToContextKind"::text[]) AS v
        WHERE v IN ('CIAN','CENI')
    ) AS pendientes;

  IF sobrante IS NOT NULL THEN
    RAISE EXCEPTION 'La corrección de alcance encontró datos que usan valores retirados de CIAN, CENI o derechos de herramienta. Resuélvelos antes de migrar:%', E'\n' || sobrante;
  END IF;
END $$;

-- 4. Columna de derechos de acceso a herramientas. El acceso a una plataforma
--    del ecosistema es una redirección externa: no hay derecho que sostener.
ALTER TABLE "subscription" DROP COLUMN "toolEntitlementId";

-- 5. Tipos enumerados sin los valores retirados.

ALTER TYPE "RoleCode" RENAME TO "RoleCode_anterior";
CREATE TYPE "RoleCode" AS ENUM (
  'PUBLIC',
  'APPLICANT',
  'PROTECTED_BENEFICIARY',
  'HONORARY_AFFILIATE',
  'UNION_MEMBER',
  'TERRITORIAL_DELEGATE',
  'EXECUTIVE_SECRETARY',
  'OVERSIGHT_COMMISSION',
  'ELECTORAL_COMMISSION',
  'SOCIAL_STAFF',
  'FINANCE',
  'COMMUNICATIONS',
  'AUDITOR',
  'SUPERADMIN'
);
ALTER TABLE "role" ALTER COLUMN "code" TYPE "RoleCode" USING "code"::text::"RoleCode";
DROP TYPE "RoleCode_anterior";

ALTER TYPE "Compartment" RENAME TO "Compartment_anterior";
CREATE TYPE "Compartment" AS ENUM ('UNION', 'SOCIAL', 'DISCIPLINARY');
ALTER TABLE "permission" ALTER COLUMN "compartment" TYPE "Compartment" USING "compartment"::text::"Compartment";
DROP TYPE "Compartment_anterior";

ALTER TYPE "ConsentPurpose" RENAME TO "ConsentPurpose_anterior";
CREATE TYPE "ConsentPurpose" AS ENUM (
  'MEMBERSHIP',
  'DIRECTORY_PUBLICATION',
  'CASE_PROCESSING',
  'INTER_ENTITY_REFERRAL',
  'AI_ASSISTANCE',
  'MARKETING_COMMUNICATIONS',
  'EVENT_PARTICIPATION',
  'MINOR_REPRESENTATION'
);
ALTER TABLE "consent" ALTER COLUMN "purpose" TYPE "ConsentPurpose" USING "purpose"::text::"ConsentPurpose";
ALTER TABLE "consent_version" ALTER COLUMN "requiredFor" TYPE "ConsentPurpose"[] USING "requiredFor"::text[]::"ConsentPurpose"[];
DROP TYPE "ConsentPurpose_anterior";

ALTER TYPE "FileClassification" RENAME TO "FileClassification_anterior";
CREATE TYPE "FileClassification" AS ENUM (
  'PUBLIC',
  'INTERNAL',
  'RESTRICTED',
  'SENSITIVE_PERSONAL',
  'LEGAL_PRIVILEGED'
);
ALTER TABLE "file_object" ALTER COLUMN "classification" TYPE "FileClassification" USING "classification"::text::"FileClassification";
ALTER TABLE "retention_policy" ALTER COLUMN "appliesToClassification" TYPE "FileClassification"[] USING "appliesToClassification"::text[]::"FileClassification"[];
DROP TYPE "FileClassification_anterior";

ALTER TYPE "FileContextKind" RENAME TO "FileContextKind_anterior";
CREATE TYPE "FileContextKind" AS ENUM (
  'APPLICATION',
  'CASE',
  'GOVERNANCE',
  'FINANCE',
  'CONTENT',
  'CREDENTIAL',
  'SYSTEM'
);
ALTER TABLE "file_object" ALTER COLUMN "contextKind" TYPE "FileContextKind" USING "contextKind"::text::"FileContextKind";
ALTER TABLE "retention_policy" ALTER COLUMN "appliesToContextKind" TYPE "FileContextKind"[] USING "appliesToContextKind"::text[]::"FileContextKind"[];
DROP TYPE "FileContextKind_anterior";

ALTER TYPE "CatalogProductKind" RENAME TO "CatalogProductKind_anterior";
CREATE TYPE "CatalogProductKind" AS ENUM (
  'ENROLLMENT_FEE',
  'UNION_DUE_ORDINARY',
  'UNION_DUE_EXTRAORDINARY',
  'HONORARY_MEMBERSHIP',
  'SERVICE_SUBSCRIPTION',
  'COURSE',
  'RENEWAL',
  'DONATION'
);
ALTER TABLE "catalog_product" ALTER COLUMN "kind" TYPE "CatalogProductKind" USING "kind"::text::"CatalogProductKind";
DROP TYPE "CatalogProductKind_anterior";

ALTER TYPE "ModuleBinding" RENAME TO "ModuleBinding_anterior";
CREATE TYPE "ModuleBinding" AS ENUM ('MEMBERSHIP', 'HONORARY_AFFILIATION', 'EVENT_REGISTRATION', 'NONE');
ALTER TABLE "catalog_product" ALTER COLUMN "moduleBinding" TYPE "ModuleBinding" USING "moduleBinding"::text::"ModuleBinding";
DROP TYPE "ModuleBinding_anterior";

ALTER TYPE "PaymentAppliesTo" RENAME TO "PaymentAppliesTo_anterior";
CREATE TYPE "PaymentAppliesTo" AS ENUM (
  'NONE',
  'MEMBERSHIP',
  'HONORARY_AFFILIATION',
  'EVENT_REGISTRATION',
  'DONATION'
);
ALTER TABLE "payment" ALTER COLUMN "appliesToKind" DROP DEFAULT;
ALTER TABLE "payment" ALTER COLUMN "appliesToKind" TYPE "PaymentAppliesTo" USING "appliesToKind"::text::"PaymentAppliesTo";
ALTER TABLE "payment" ALTER COLUMN "appliesToKind" SET DEFAULT 'NONE';
DROP TYPE "PaymentAppliesTo_anterior";

-- `CIAN_SERVICE` y `TOOL_ACCESS` se funden en `SERVICE`: una beca es la
-- constancia de que alguien no puede pagar, y eso no se borra porque el
-- catálogo se haya reordenado. La beca sobrevive con su cobertura, su
-- justificación y su vigencia; lo que cambia es el nombre del programa.
ALTER TYPE "ScholarshipProgram" RENAME TO "ScholarshipProgram_anterior";
CREATE TYPE "ScholarshipProgram" AS ENUM ('MEMBERSHIP', 'SERVICE', 'COURSE');
ALTER TABLE "scholarship" ALTER COLUMN "programKind" TYPE "ScholarshipProgram"
  USING (CASE WHEN "programKind"::text IN ('CIAN_SERVICE', 'TOOL_ACCESS') THEN 'SERVICE' ELSE "programKind"::text END)::"ScholarshipProgram";
DROP TYPE "ScholarshipProgram_anterior";

ALTER TYPE "BeneficiaryOrigin" RENAME TO "BeneficiaryOrigin_anterior";
CREATE TYPE "BeneficiaryOrigin" AS ENUM (
  'SELF',
  'FAMILY_OR_CAREGIVER',
  'UNION_MEMBER',
  'DELEGATE',
  'SOCIAL_STAFF',
  'EXTERNAL_REFERRAL'
);
ALTER TABLE "protected_beneficiary" ALTER COLUMN "originKind" TYPE "BeneficiaryOrigin" USING "originKind"::text::"BeneficiaryOrigin";
DROP TYPE "BeneficiaryOrigin_anterior";

ALTER TYPE "SupportRequestType" RENAME TO "SupportRequestType_anterior";
CREATE TYPE "SupportRequestType" AS ENUM (
  'GENERAL_CONTACT',
  'INDIVIDUAL_LABOR_DISPUTE',
  'COLLECTIVE_DISPUTE',
  'DISCRIMINATION_OR_ADJUSTMENTS',
  'EDUCATION_ACCESS',
  'HEALTH_ACCESS',
  'ACCESSIBILITY',
  'FAMILY_GUIDANCE',
  'PSYCHOSOCIAL_RISK',
  'VIOLENCE_OR_URGENCY',
  'TRAINING_OR_INSTITUTIONAL_SUPPORT',
  'OTHER'
);
ALTER TABLE "support_request" ALTER COLUMN "requestType" TYPE "SupportRequestType" USING "requestType"::text::"SupportRequestType";
DROP TYPE "SupportRequestType_anterior";
