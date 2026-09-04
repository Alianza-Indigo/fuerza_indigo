-- Afiliación, padrones, directorios y credenciales (PRD §3, §7, §8; Fase 4).
--
-- Catorce tablas. Lo que el motor fija aquí, y no el código de la aplicación:
--
--  · **El honorario no vota.** Una comprobación impide que un tipo de membresía
--    honoraria conceda derechos políticos, compute para el quórum o aparezca en
--    el padrón que se remite a la autoridad laboral. El criterio del PRD §24
--    Fase 4 dice «nunca por error»: un error es exactamente lo que una pantalla
--    no puede impedir y una restricción sí.
--  · **Los campos condicionales de la solicitud.** La categoría se copia en la
--    solicitud y en la membresía, atada al catálogo por clave foránea compuesta,
--    para que la comprobación pueda leerla sin consultar otra tabla. Sin la
--    copia, la regla del PRD §8.1 solo viviría en el código de la aplicación.
--  · **La solicitud original no se altera.** Un disparador impide cambiar
--    `originalSummary` una vez escrita. Es el primer disparador del repositorio
--    y hay una razón: los privilegios por columna saben decir «nunca» y no saben
--    decir «una sola vez».
--  · **Una calidad activa por categoría.** Un índice único parcial impide dos
--    membresías sindicales vivas de la misma persona, sin estorbar al historial
--    de las que terminaron.
--  · **Lo que se asienta no se edita.** Revisiones, transiciones de estado y
--    consultas al verificador pierden `UPDATE` y `DELETE`.

-- CreateEnum
CREATE TYPE "MembershipCategory" AS ENUM ('UNION_MEMBER', 'HONORARY_AFFILIATE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED', 'APPROVED', 'PENDING_PAYMENT', 'ACTIVATED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WorkRelationKind" AS ENUM ('SUBORDINATE', 'INDEPENDENT', 'AUTONOMOUS', 'SELF_EMPLOYED');

-- CreateEnum
CREATE TYPE "OtherUnionMembership" AS ENUM ('NONE', 'SAME_TRADE', 'DIFFERENT_TRADE');

-- CreateEnum
CREATE TYPE "HonoraryProfile" AS ENUM ('NEURODIVERGENT_PERSON', 'FAMILY_MEMBER', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "ApplicationDocumentKind" AS ENUM ('IDENTITY', 'WORK_PROOF', 'CERTIFICATE', 'REFERENCE', 'STATEMENT', 'CLARIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationDocumentStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApplicationReviewAction" AS ENUM ('ASSIGNED', 'INFORMATION_REQUESTED', 'INTERVIEW_SCHEDULED', 'RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'DISCIPLINARY_PROCESS', 'VOLUNTARY_WITHDRAWAL', 'STATUS_LOSS', 'DECEASED', 'CANCELLED_DUPLICATE');

-- CreateEnum
CREATE TYPE "MembershipEndReason" AS ENUM ('VOLUNTARY_WITHDRAWAL', 'EXPULSION', 'INACTIVITY', 'DECEASED', 'ADMIN_CORRECTION', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "BeneficiaryOrigin" AS ENUM ('SELF', 'FAMILY_OR_CAREGIVER', 'UNION_MEMBER', 'DELEGATE', 'SOCIAL_STAFF', 'CIAN', 'EXTERNAL_REFERRAL');

-- CreateEnum
CREATE TYPE "BeneficiaryUrgency" AS ENUM ('ROUTINE', 'PRIORITY', 'URGENT');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('REGISTERED', 'IN_ATTENTION', 'REFERRED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('STANDARD', 'REINFORCED');

-- CreateEnum
CREATE TYPE "CareRelationshipKind" AS ENUM ('PARENT_OR_GUARDIAN', 'CHILD', 'SPOUSE_OR_PARTNER', 'RELATIVE', 'PRIMARY_CAREGIVER', 'SECONDARY_CAREGIVER', 'AUTHORIZED_REPRESENTATIVE', 'EMERGENCY_CONTACT', 'RESPONSIBLE_PROFESSIONAL');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('IN_PERSON', 'REMOTE');

-- CreateEnum
CREATE TYPE "ProfessionalAvailability" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DirectoryVisibility" AS ENUM ('HIDDEN', 'NAME_AND_TERRITORY', 'PROFESSIONAL_PROFILE');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('UNION_MEMBER', 'HONORARY_AFFILIATE', 'OFFICE_OR_REPRESENTATION', 'AUTHORIZED_PROFESSIONAL');

-- CreateEnum
CREATE TYPE "MemberCredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'REPLACED');

-- CreateEnum
CREATE TYPE "CredentialVerificationResult" AS ENUM ('VALID', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "membership_type" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" "MembershipCategory" NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "grantsPoliticalRights" BOOLEAN NOT NULL DEFAULT false,
    "countsForQuorum" BOOLEAN NOT NULL DEFAULT false,
    "appearsInAuthorityRoster" BOOLEAN NOT NULL DEFAULT false,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "requiresPayment" BOOLEAN NOT NULL DEFAULT false,
    "durationMonths" INTEGER,
    "renewable" BOOLEAN NOT NULL DEFAULT true,
    "catalogProductId" UUID,
    "benefitsSummary" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "membership_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_application" (
    "id" UUID NOT NULL,
    "folio" VARCHAR(30) NOT NULL,
    "personId" UUID NOT NULL,
    "membershipTypeId" UUID NOT NULL,
    "category" "MembershipCategory" NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "territorialUnitId" UUID,
    "occupationSpecialtyId" UUID,
    "workRelationKind" "WorkRelationKind",
    "neurodivergentContactStatement" TEXT,
    "otherUnionMembership" "OtherUnionMembership",
    "otherUnionClarification" TEXT,
    "honoraryProfile" "HonoraryProfile",
    "acceptedRuleSetId" UUID NOT NULL,
    "originalSummary" JSONB,
    "autosavedDraft" JSONB,
    "clarificationDueAt" TIMESTAMPTZ(3),
    "resolutionAt" TIMESTAMPTZ(3),
    "resolutionReason" TEXT,
    "resolvedById" UUID,
    "paymentId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "membership_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_document" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "documentKind" "ApplicationDocumentKind" NOT NULL,
    "status" "ApplicationDocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_review" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "action" "ApplicationReviewAction" NOT NULL,
    "rationale" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "memberNumber" VARCHAR(30) NOT NULL,
    "personId" UUID NOT NULL,
    "membershipTypeId" UUID NOT NULL,
    "category" "MembershipCategory" NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "applicationId" UUID,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "territorialUnitId" UUID,
    "sectionId" UUID,
    "politicalRightsSuspendedUntil" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "endReason" "MembershipEndReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_status_event" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "fromStatus" "MembershipStatus",
    "toStatus" "MembershipStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" UUID,
    "actorId" UUID NOT NULL,
    "evidenceFileId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_status_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protected_beneficiary" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "personId" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "originKind" "BeneficiaryOrigin" NOT NULL,
    "registeredById" UUID,
    "initialNeed" TEXT NOT NULL,
    "urgencyLevel" "BeneficiaryUrgency" NOT NULL DEFAULT 'ROUTINE',
    "territorialUnitId" UUID,
    "responsiblePersonId" UUID,
    "hasDigitalAccount" BOOLEAN NOT NULL DEFAULT false,
    "status" "BeneficiaryStatus" NOT NULL DEFAULT 'REGISTERED',
    "privacyLevel" "PrivacyLevel" NOT NULL DEFAULT 'REINFORCED',
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "protected_beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_relationship" (
    "id" UUID NOT NULL,
    "fromPersonId" UUID NOT NULL,
    "toPersonId" UUID NOT NULL,
    "kind" "CareRelationshipKind" NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "consentId" UUID,
    "evidenceFileId" UUID,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "care_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_profile" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "headline" VARCHAR(200) NOT NULL,
    "credentialsSummary" TEXT,
    "yearsOfExperience" INTEGER,
    "serviceModes" "ServiceMode"[],
    "availability" "ProfessionalAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "professionalEmail" VARCHAR(320),
    "professionalPhone" VARCHAR(40),
    "verifiedSkills" JSONB NOT NULL DEFAULT '[]',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "professional_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_specialty" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_preference" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "visibility" "DirectoryVisibility" NOT NULL DEFAULT 'HIDDEN',
    "showPhoto" BOOLEAN NOT NULL DEFAULT false,
    "showProfessionalContact" BOOLEAN NOT NULL DEFAULT false,
    "allowSearchEngineIndexing" BOOLEAN NOT NULL DEFAULT false,
    "consentVersionId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActorId" UUID NOT NULL,

    CONSTRAINT "directory_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directory_publication" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "publishedFields" JSONB NOT NULL,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(3),
    "sourcePreferenceId" UUID NOT NULL,

    CONSTRAINT "directory_publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_credential" (
    "id" UUID NOT NULL,
    "publicCode" VARCHAR(40) NOT NULL,
    "signingKeyId" VARCHAR(40) NOT NULL,
    "signature" VARCHAR(120) NOT NULL,
    "membershipId" UUID,
    "personId" UUID NOT NULL,
    "credentialKind" "CredentialKind" NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "photoFileId" UUID,
    "territoryLabel" VARCHAR(160),
    "status" "MemberCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "replacedByCredentialId" UUID,
    "renderedFileId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "member_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_verification" (
    "id" UUID NOT NULL,
    "credentialId" UUID,
    "queriedCode" VARCHAR(40) NOT NULL,
    "result" "CredentialVerificationResult" NOT NULL,
    "occurredAtHour" TIMESTAMPTZ(3) NOT NULL,
    "countryCodeHint" CHAR(2),
    "userAgentClass" "UserAgentClass",

    CONSTRAINT "credential_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_type_code_key" ON "membership_type"("code");

-- CreateIndex
CREATE INDEX "membership_type_legalEntityId_idx" ON "membership_type"("legalEntityId");

-- CreateIndex
CREATE INDEX "membership_type_category_isActive_idx" ON "membership_type"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "membership_type_id_category_key" ON "membership_type"("id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "membership_application_folio_key" ON "membership_application"("folio");

-- CreateIndex
CREATE INDEX "membership_application_personId_idx" ON "membership_application"("personId");

-- CreateIndex
CREATE INDEX "membership_application_membershipTypeId_idx" ON "membership_application"("membershipTypeId");

-- CreateIndex
CREATE INDEX "membership_application_status_idx" ON "membership_application"("status");

-- CreateIndex
CREATE INDEX "membership_application_territorialUnitId_idx" ON "membership_application"("territorialUnitId");

-- CreateIndex
CREATE INDEX "membership_application_legalEntityId_status_idx" ON "membership_application"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "application_document_applicationId_idx" ON "application_document"("applicationId");

-- CreateIndex
CREATE INDEX "application_document_status_idx" ON "application_document"("status");

-- CreateIndex
CREATE INDEX "application_review_applicationId_idx" ON "application_review"("applicationId");

-- CreateIndex
CREATE INDEX "application_review_reviewerId_idx" ON "application_review"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_publicId_key" ON "membership"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_memberNumber_key" ON "membership"("memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "membership_applicationId_key" ON "membership"("applicationId");

-- CreateIndex
CREATE INDEX "membership_personId_idx" ON "membership"("personId");

-- CreateIndex
CREATE INDEX "membership_legalEntityId_status_idx" ON "membership"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "membership_expiresAt_idx" ON "membership"("expiresAt");

-- CreateIndex
CREATE INDEX "membership_territorialUnitId_idx" ON "membership"("territorialUnitId");

-- CreateIndex
CREATE INDEX "membership_sectionId_idx" ON "membership"("sectionId");

-- CreateIndex
CREATE INDEX "membership_status_event_membershipId_occurredAt_idx" ON "membership_status_event"("membershipId", "occurredAt");

-- CreateIndex
CREATE INDEX "membership_status_event_occurredAt_idx" ON "membership_status_event"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "protected_beneficiary_publicId_key" ON "protected_beneficiary"("publicId");

-- CreateIndex
CREATE INDEX "protected_beneficiary_personId_idx" ON "protected_beneficiary"("personId");

-- CreateIndex
CREATE INDEX "protected_beneficiary_legalEntityId_status_idx" ON "protected_beneficiary"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "protected_beneficiary_territorialUnitId_idx" ON "protected_beneficiary"("territorialUnitId");

-- CreateIndex
CREATE INDEX "protected_beneficiary_privacyLevel_idx" ON "protected_beneficiary"("privacyLevel");

-- CreateIndex
CREATE INDEX "care_relationship_fromPersonId_idx" ON "care_relationship"("fromPersonId");

-- CreateIndex
CREATE INDEX "care_relationship_toPersonId_idx" ON "care_relationship"("toPersonId");

-- CreateIndex
CREATE INDEX "care_relationship_kind_idx" ON "care_relationship"("kind");

-- CreateIndex
CREATE INDEX "care_relationship_revokedAt_idx" ON "care_relationship"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "professional_profile_personId_key" ON "professional_profile"("personId");

-- CreateIndex
CREATE INDEX "professional_profile_availability_idx" ON "professional_profile"("availability");

-- CreateIndex
CREATE INDEX "professional_specialty_specialtyId_idx" ON "professional_specialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "professional_specialty_profileId_specialtyId_key" ON "professional_specialty"("profileId", "specialtyId");

-- CreateIndex
CREATE INDEX "directory_preference_personId_grantedAt_idx" ON "directory_preference"("personId", "grantedAt");

-- CreateIndex
CREATE INDEX "directory_preference_revokedAt_idx" ON "directory_preference"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "directory_publication_slug_key" ON "directory_publication"("slug");

-- CreateIndex
CREATE INDEX "directory_publication_personId_idx" ON "directory_publication"("personId");

-- CreateIndex
CREATE INDEX "directory_publication_withdrawnAt_idx" ON "directory_publication"("withdrawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "member_credential_publicCode_key" ON "member_credential"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "member_credential_replacedByCredentialId_key" ON "member_credential"("replacedByCredentialId");

-- CreateIndex
CREATE INDEX "member_credential_personId_idx" ON "member_credential"("personId");

-- CreateIndex
CREATE INDEX "member_credential_membershipId_idx" ON "member_credential"("membershipId");

-- CreateIndex
CREATE INDEX "member_credential_status_idx" ON "member_credential"("status");

-- CreateIndex
CREATE INDEX "member_credential_expiresAt_idx" ON "member_credential"("expiresAt");

-- CreateIndex
CREATE INDEX "member_credential_signingKeyId_idx" ON "member_credential"("signingKeyId");

-- CreateIndex
CREATE INDEX "credential_verification_credentialId_idx" ON "credential_verification"("credentialId");

-- CreateIndex
CREATE INDEX "credential_verification_occurredAtHour_idx" ON "credential_verification"("occurredAtHour");

-- CreateIndex
CREATE INDEX "credential_verification_result_idx" ON "credential_verification"("result");

-- CreateIndex
CREATE INDEX "consent_representationRef_idx" ON "consent"("representationRef");

-- CreateIndex
CREATE INDEX "subscription_membershipId_idx" ON "subscription"("membershipId");

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_representationRef_fkey" FOREIGN KEY ("representationRef") REFERENCES "care_relationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_type" ADD CONSTRAINT "membership_type_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_type" ADD CONSTRAINT "membership_type_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "catalog_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_membershipTypeId_category_fkey" FOREIGN KEY ("membershipTypeId", "category") REFERENCES "membership_type"("id", "category") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_occupationSpecialtyId_fkey" FOREIGN KEY ("occupationSpecialtyId") REFERENCES "specialty_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_acceptedRuleSetId_fkey" FOREIGN KEY ("acceptedRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "membership_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_review" ADD CONSTRAINT "application_review_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "membership_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_review" ADD CONSTRAINT "application_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_membershipTypeId_category_fkey" FOREIGN KEY ("membershipTypeId", "category") REFERENCES "membership_type"("id", "category") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "membership_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_status_event" ADD CONSTRAINT "membership_status_event_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_status_event" ADD CONSTRAINT "membership_status_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_status_event" ADD CONSTRAINT "membership_status_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_status_event" ADD CONSTRAINT "membership_status_event_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_responsiblePersonId_fkey" FOREIGN KEY ("responsiblePersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protected_beneficiary" ADD CONSTRAINT "protected_beneficiary_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationship" ADD CONSTRAINT "care_relationship_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profile" ADD CONSTRAINT "professional_profile_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialty" ADD CONSTRAINT "professional_specialty_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "professional_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialty" ADD CONSTRAINT "professional_specialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialty_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_preference" ADD CONSTRAINT "directory_preference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_preference" ADD CONSTRAINT "directory_preference_consentVersionId_fkey" FOREIGN KEY ("consentVersionId") REFERENCES "consent_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_preference" ADD CONSTRAINT "directory_preference_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_publication" ADD CONSTRAINT "directory_publication_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directory_publication" ADD CONSTRAINT "directory_publication_sourcePreferenceId_fkey" FOREIGN KEY ("sourcePreferenceId") REFERENCES "directory_preference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_renderedFileId_fkey" FOREIGN KEY ("renderedFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_replacedByCredentialId_fkey" FOREIGN KEY ("replacedByCredentialId") REFERENCES "member_credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_verification" ADD CONSTRAINT "credential_verification_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "member_credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- 1. El afiliado honorario nunca obtiene voto por error (PRD §3.3, §24 Fase 4).
--
--    No es una validación de formulario. Es que la fila no cabe en la tabla.
-- ---------------------------------------------------------------------------
ALTER TABLE "membership_type"
  ADD CONSTRAINT "membership_type_honoraria_sin_derechos_politicos" CHECK (
    "category" <> 'HONORARY_AFFILIATE'
    OR (
      "grantsPoliticalRights" IS FALSE
      AND "countsForQuorum" IS FALSE
      AND "appearsInAuthorityRoster" IS FALSE
    )
  );

-- Una vigencia que termina antes de empezar no es una vigencia.
ALTER TABLE "membership_type"
  ADD CONSTRAINT "membership_type_vigencia_coherente" CHECK (
    "effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"
  );

-- Los meses de vigencia son un plazo, no un número cualquiera.
ALTER TABLE "membership_type"
  ADD CONSTRAINT "membership_type_duracion_positiva" CHECK (
    "durationMonths" IS NULL OR "durationMonths" > 0
  );

-- ---------------------------------------------------------------------------
-- 2. Campos condicionales de la solicitud (PRD §8.1, defecto `D-F0-004`).
--
--    Dos comprobaciones y no una, porque dicen cosas distintas:
--
--     · La de nulidad rige SIEMPRE, borrador incluido. Quien elige afiliación
--       honoraria no ve los campos laborales; que no los vea y que la fila los
--       guarde sería la misma incoherencia con distinto disfraz.
--     · La de presencia rige desde que se envía. Un borrador a medio llenar es
--       exactamente lo que un borrador debe poder ser.
-- ---------------------------------------------------------------------------
ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_campos_ajenos_a_la_categoria" CHECK (
    CASE "category"
      WHEN 'UNION_MEMBER' THEN "honoraryProfile" IS NULL
      WHEN 'HONORARY_AFFILIATE' THEN
        "occupationSpecialtyId" IS NULL
        AND "workRelationKind" IS NULL
        AND "otherUnionMembership" IS NULL
        AND "otherUnionClarification" IS NULL
    END
  );

ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_campos_obligatorios_al_enviar" CHECK (
    "status" = 'DRAFT'
    OR CASE "category"
      WHEN 'UNION_MEMBER' THEN
        "occupationSpecialtyId" IS NOT NULL
        AND "workRelationKind" IS NOT NULL
        AND "neurodivergentContactStatement" IS NOT NULL
        AND "otherUnionMembership" IS NOT NULL
      WHEN 'HONORARY_AFFILIATE' THEN "honoraryProfile" IS NOT NULL
    END
  );

-- Declarar pertenencia a otro sindicato sin aclarar nada deja la declaración a
-- medias, que es peor que no haberla pedido (PRD §8.1.5).
ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_aclaracion_de_otro_sindicato" CHECK (
    "otherUnionMembership" IS NULL
    OR "otherUnionMembership" = 'NONE'
    OR ("otherUnionClarification" IS NOT NULL AND length(btrim("otherUnionClarification")) > 0)
  );

-- Enviada significa: con fecha de envío y con resumen inmutable escrito.
ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_enviada_con_resumen" CHECK (
    "status" = 'DRAFT'
    OR ("submittedAt" IS NOT NULL AND "originalSummary" IS NOT NULL)
  );

-- Una resolución sin motivo no es una resolución (PRD §3.6).
ALTER TABLE "membership_application"
  ADD CONSTRAINT "membership_application_resolucion_fundada" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED')
    OR (
      "resolutionAt" IS NOT NULL
      AND "resolvedById" IS NOT NULL
      AND "resolutionReason" IS NOT NULL
      AND length(btrim("resolutionReason")) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- 3. El resumen enviado se escribe una vez y no se toca (PRD §8.1.9).
--
--    Los privilegios por columna no sirven aquí: la solicitud nace en borrador
--    y el resumen se escribe al enviarla, así que quitar `UPDATE` sobre la
--    columna impediría también el único momento en que debe escribirse. Lo que
--    hace falta es «una sola vez», y eso lo dice un disparador.
--
--    Vive en el motor, y no en el caso de uso, porque la promesa que sostiene
--    es fuerte: quien revisa una solicitud no puede alterar lo que la persona
--    envió. Una promesa así no se apoya en que nadie escriba mañana un `update`
--    distraído.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "fuerza_resumen_de_solicitud_inmutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."originalSummary" IS NOT NULL
     AND NEW."originalSummary" IS DISTINCT FROM OLD."originalSummary" THEN
    -- Sin `USING ERRCODE`: el código por omisión, `raise_exception`, es el que
    -- deja llegar el mensaje al cliente. Con `restrict_violation` el
    -- controlador lo traduce a «clave foránea violada», que dice justo lo
    -- contrario de lo que pasó y manda a quien lo lea a buscar la relación
    -- equivocada.
    RAISE EXCEPTION
      'El resumen enviado de una solicitud no se puede modificar (solicitud %).', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "membership_application_resumen_inmutable"
  BEFORE UPDATE ON "membership_application"
  FOR EACH ROW
  EXECUTE FUNCTION "fuerza_resumen_de_solicitud_inmutable"();

-- ---------------------------------------------------------------------------
-- 4. Una sola calidad activa por categoría (docs/DATA_MODEL.md §5).
--
--    Parcial: el historial de membresías terminadas no estorba, y de hecho hace
--    falta —una persona que se dio de baja y volvió tiene dos filas y una sola
--    viva—. La conversión sin duplicidad del PRD §8.4 se apoya justo en esto.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "membership_una_activa_por_persona_y_categoria"
  ON "membership" ("personId", "category")
  WHERE "status" = 'ACTIVE';

-- Terminar es un hecho con fecha y con motivo, o no es terminar.
ALTER TABLE "membership"
  ADD CONSTRAINT "membership_baja_con_fecha_y_motivo" CHECK (
    ("endedAt" IS NULL) = ("endReason" IS NULL)
  );

-- Los estados terminales exigen baja registrada; los vivos la prohíben.
ALTER TABLE "membership"
  ADD CONSTRAINT "membership_estado_coherente_con_la_baja" CHECK (
    CASE
      WHEN "status" IN ('ACTIVE', 'SUSPENDED', 'DISCIPLINARY_PROCESS') THEN "endedAt" IS NULL
      ELSE "endedAt" IS NOT NULL
    END
  );

-- Una vigencia anterior al alta no vence: nace vencida.
ALTER TABLE "membership"
  ADD CONSTRAINT "membership_vigencia_posterior_al_alta" CHECK (
    "expiresAt" IS NULL OR "expiresAt" > "startedAt"
  );

-- ---------------------------------------------------------------------------
-- 5. Beneficiario protegido (PRD §3.4).
-- ---------------------------------------------------------------------------
ALTER TABLE "protected_beneficiary"
  ADD CONSTRAINT "protected_beneficiary_cierre_con_motivo" CHECK (
    ("closedAt" IS NULL) = ("closeReason" IS NULL)
  );

ALTER TABLE "protected_beneficiary"
  ADD CONSTRAINT "protected_beneficiary_estado_coherente_con_el_cierre" CHECK (
    CASE
      WHEN "status" IN ('CLOSED', 'ARCHIVED') THEN "closedAt" IS NOT NULL
      ELSE "closedAt" IS NULL
    END
  );

-- Una persona no es responsable de sí misma: si lo fuera, la representación
-- dejaría de significar nada.
ALTER TABLE "protected_beneficiary"
  ADD CONSTRAINT "protected_beneficiary_responsable_distinto" CHECK (
    "responsiblePersonId" IS NULL OR "responsiblePersonId" <> "personId"
  );

-- ---------------------------------------------------------------------------
-- 6. Relaciones familiares y de cuidado (PRD §3.5).
-- ---------------------------------------------------------------------------
ALTER TABLE "care_relationship"
  ADD CONSTRAINT "care_relationship_personas_distintas" CHECK (
    "fromPersonId" <> "toPersonId"
  );

ALTER TABLE "care_relationship"
  ADD CONSTRAINT "care_relationship_revocacion_con_motivo" CHECK (
    ("revokedAt" IS NULL) = ("revokeReason" IS NULL)
  );

ALTER TABLE "care_relationship"
  ADD CONSTRAINT "care_relationship_vigencia_coherente" CHECK (
    "endsAt" IS NULL OR "endsAt" > "startsAt"
  );

-- Una misma relación no se registra dos veces mientras siga viva. El histórico
-- de relaciones revocadas sí se conserva, y por eso el índice es parcial.
CREATE UNIQUE INDEX "care_relationship_una_viva_por_par_y_tipo"
  ON "care_relationship" ("fromPersonId", "toPersonId", "kind")
  WHERE "revokedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Directorio: publicar es consecuencia de consentir (PRD §7.3).
--
--    La preferencia no se edita: se otorga una nueva. Lo único que cambia en
--    una preferencia otorgada es que se revoque. Igual la publicación: lo único
--    que cambia es que se retire. Sin esto, «retirar el consentimiento retira
--    la publicación» sería una frase, no una garantía.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "directory_preference" FROM fuerza_app;
GRANT UPDATE ("revokedAt") ON TABLE "directory_preference" TO fuerza_app;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "directory_publication" FROM fuerza_app;
GRANT UPDATE ("withdrawnAt", "indexable") ON TABLE "directory_publication" TO fuerza_app;

-- Oculto es oculto: no se indexa, no se muestra foto y no se muestra contacto.
ALTER TABLE "directory_preference"
  ADD CONSTRAINT "directory_preference_oculta_no_publica_nada" CHECK (
    "visibility" <> 'HIDDEN'
    OR (
      "showPhoto" IS FALSE
      AND "showProfessionalContact" IS FALSE
      AND "allowSearchEngineIndexing" IS FALSE
    )
  );

-- Una publicación indexable retirada dejaría la señal de indexación puesta
-- sobre algo que ya no existe.
ALTER TABLE "directory_publication"
  ADD CONSTRAINT "directory_publication_retirada_no_indexable" CHECK (
    "withdrawnAt" IS NULL OR "indexable" IS FALSE
  );

-- ---------------------------------------------------------------------------
-- 8. Credenciales (PRD §7.4).
--
--    Lo que identifica a la credencial —código, firma, clave de firma, persona,
--    tipo y fecha de emisión— no se modifica jamás. Si cambiara, el código del
--    QR dejaría de acreditar lo que acreditaba cuando se imprimió.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "member_credential" FROM fuerza_app;
GRANT UPDATE (
  "status",
  "expiresAt",
  "revokedAt",
  "revokeReason",
  "replacedByCredentialId",
  "renderedFileId",
  "displayName",
  "territoryLabel",
  "photoFileId",
  "updatedAt",
  "updatedByActorId",
  "rowVersion"
) ON TABLE "member_credential" TO fuerza_app;

ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_revocacion_con_motivo" CHECK (
    ("revokedAt" IS NULL) = ("revokeReason" IS NULL)
  );

ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_estado_coherente_con_la_revocacion" CHECK (
    ("status" = 'REVOKED') = ("revokedAt" IS NOT NULL)
  );

ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_reemplazo_marcado" CHECK (
    "replacedByCredentialId" IS NULL OR "status" = 'REPLACED'
  );

-- Una credencial de agremiado u honoraria acredita una membresía; si no la
-- lleva, no acredita nada. Las de cargo y las profesionales no la necesitan.
ALTER TABLE "member_credential"
  ADD CONSTRAINT "member_credential_membresia_segun_el_tipo" CHECK (
    "credentialKind" NOT IN ('UNION_MEMBER', 'HONORARY_AFFILIATE')
    OR "membershipId" IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 9. Lo que se asienta no se edita.
--
--    Una revisión anotada, una transición de estado y una consulta al
--    verificador son hechos ocurridos. Un hecho corregido a posteriori no es un
--    hecho: es una versión.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "application_review" FROM fuerza_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "membership_status_event" FROM fuerza_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "credential_verification" FROM fuerza_app;

-- La medición del verificador es agregada por hora. La comprobación impide que
-- alguien guarde el instante exacto «solo por ahora»: con minuto y segundo, un
-- registro agregado se convierte en un rastro de quién miró qué y cuándo.
ALTER TABLE "credential_verification"
  ADD CONSTRAINT "credential_verification_hora_truncada" CHECK (
    "occurredAtHour" = date_trunc('hour', "occurredAtHour")
  );

-- Un resultado distinto de NOT_FOUND tiene credencial; NOT_FOUND, por
-- definición, no la tiene.
ALTER TABLE "credential_verification"
  ADD CONSTRAINT "credential_verification_resultado_coherente" CHECK (
    ("result" = 'NOT_FOUND') = ("credentialId" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 10. Documentos de la solicitud: revisar es un acto con firma y fecha.
-- ---------------------------------------------------------------------------
ALTER TABLE "application_document"
  ADD CONSTRAINT "application_document_revision_con_persona_y_fecha" CHECK (
    "status" = 'SUBMITTED'
    OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  );

ALTER TABLE "application_document"
  ADD CONSTRAINT "application_document_rechazo_con_nota" CHECK (
    "status" <> 'REJECTED'
    OR ("reviewNote" IS NOT NULL AND length(btrim("reviewNote")) > 0)
  );



-- ---------------------------------------------------------------------------
-- 11. Clave de comparación de nombres (ADR-0070).
--
--     «Muñoz» y «Munoz» son la misma persona escrita por dos personas
--     distintas, y el padrón no puede tener dos filas por una diferencia de
--     teclado. La detección de duplicidad compara sobre esta columna.
--
--     La escribe un disparador y no la aplicación, y la diferencia importa:
--     vale igual para las filas que crea una semilla, una prueba, una
--     importación o cualquier código futuro. Una clave que hubiera que
--     acordarse de escribir estaría vacía justo en las filas que nadie revisó,
--     que son las que producen duplicados.
--
--     Se descartó una columna generada (`GENERATED ALWAYS AS ... STORED`), que
--     habría sido más directa: el comparador de esquemas la lee como una
--     columna con valor por omisión y propone quitárselo en cada ejecución. Un
--     aviso de deriva que hay que ignorar cada vez es un aviso que se acaba
--     ignorando siempre, incluido el día en que la deriva sea de verdad.
-- ---------------------------------------------------------------------------
ALTER TABLE "person" ADD COLUMN "matchKey" TEXT;

CREATE OR REPLACE FUNCTION "fuerza_clave_de_comparacion_de_persona"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."matchKey" := lower(translate(
    NEW."givenName" || ' ' || NEW."familyName" || ' ' || coalesce(NEW."secondFamilyName", ''),
    'áàäâãÁÀÄÂÃéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC'
  ));
  RETURN NEW;
END;
$$;

CREATE TRIGGER "person_clave_de_comparacion"
  BEFORE INSERT OR UPDATE OF "givenName", "familyName", "secondFamilyName" ON "person"
  FOR EACH ROW
  EXECUTE FUNCTION "fuerza_clave_de_comparacion_de_persona"();

CREATE INDEX "person_matchKey_idx" ON "person" ("matchKey");
