-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('PUBLIC', 'APPLICANT', 'PROTECTED_BENEFICIARY', 'HONORARY_AFFILIATE', 'UNION_MEMBER', 'TERRITORIAL_DELEGATE', 'EXECUTIVE_SECRETARY', 'OVERSIGHT_COMMISSION', 'ELECTORAL_COMMISSION', 'SOCIAL_STAFF', 'CIAN_PROFESSIONAL', 'CIAN_COORDINATION', 'CENI_ORG_USER', 'CENI_ASSESSOR', 'CENI_COORDINATION', 'FINANCE', 'COMMUNICATIONS', 'AUDITOR', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "ScopeKind" AS ENUM ('GLOBAL', 'LEGAL_ENTITY', 'TERRITORIAL', 'ASSIGNMENT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PermissionSensitivity" AS ENUM ('NORMAL', 'SENSITIVE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Compartment" AS ENUM ('UNION', 'SOCIAL', 'CLINICAL', 'DISCIPLINARY');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SecurityEventKind" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'RATE_LIMITED', 'ACCESS_DENIED', 'PRIVILEGE_GRANTED', 'PRIVILEGE_REVOKED', 'SUPERADMIN_LOGIN', 'SUPERADMIN_ACTION', 'SUSPECTED_ENUMERATION', 'WEBHOOK_SIGNATURE_INVALID', 'FILE_ACCESS_DENIED');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "UserAgentClass" AS ENUM ('MOBILE', 'DESKTOP', 'BOT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConsentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('MEMBERSHIP', 'DIRECTORY_PUBLICATION', 'CASE_PROCESSING', 'INTER_ENTITY_REFERRAL', 'CIAN_CARE', 'CLINICAL_DATA_SHARING', 'AI_ASSISTANCE', 'TOOL_IDENTITY_EXCHANGE', 'MARKETING_COMMUNICATIONS', 'EVENT_PARTICIPATION', 'MINOR_REPRESENTATION');

-- CreateEnum
CREATE TYPE "FileClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'SENSITIVE_PERSONAL', 'CLINICAL', 'LEGAL_PRIVILEGED');

-- CreateEnum
CREATE TYPE "FileContextKind" AS ENUM ('APPLICATION', 'CASE', 'CIAN', 'CENI', 'GOVERNANCE', 'FINANCE', 'CONTENT', 'CREDENTIAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetentionAction" AS ENUM ('ANONYMIZE', 'DELETE', 'ARCHIVE_COLD');

-- CreateEnum
CREATE TYPE "LegalHoldScope" AS ENUM ('PERSON', 'CASE', 'FILE', 'LEGAL_ENTITY', 'DISCIPLINARY_CASE', 'BARGAINING_FILE');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('PERSON', 'ROOT_SUPERADMIN', 'SYSTEM_JOB', 'MIGRATION');

-- CreateEnum
CREATE TYPE "GenderIdentity" AS ENUM ('WOMAN', 'MAN', 'NON_BINARY', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PASSWORD', 'RECOVERY_CODE');

-- CreateEnum
CREATE TYPE "SessionActor" AS ENUM ('PERSON', 'ROOT_SUPERADMIN');

-- CreateEnum
CREATE TYPE "SessionRevoke" AS ENUM ('LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_ACTION', 'EXPIRY', 'SESSION_VERSION_BUMP');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('COMPANY', 'SCHOOL', 'PUBLIC_INSTITUTION', 'CIVIL_SOCIETY', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationSize" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrganizationUserRole" AS ENUM ('OWNER', 'ADMIN', 'CONTACT', 'EVIDENCE_UPLOADER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "SpecialtyKind" AS ENUM ('TRADE', 'PROFESSION', 'CLINICAL_DISCIPLINE');

-- CreateEnum
CREATE TYPE "LegalEntityCode" AS ENUM ('FUERZA_INDIGO', 'ALIANZA_INDIGO');

-- CreateEnum
CREATE TYPE "LegalEntityKind" AS ENUM ('UNION', 'CIVIL_ASSOCIATION');

-- CreateEnum
CREATE TYPE "TerritorialUnitType" AS ENUM ('NATIONAL', 'FOREIGN_COUNTRY', 'STATE', 'MUNICIPALITY', 'SECTION', 'DELEGATION', 'OFFICE', 'VIRTUAL_THEMATIC');

-- CreateEnum
CREATE TYPE "TerritorialStatus" AS ENUM ('PLANNED', 'ACTIVE', 'SUSPENDED', 'DISSOLVED');

-- CreateEnum
CREATE TYPE "NormativeRuleStatus" AS ENUM ('DRAFT', 'IN_FORCE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WEB_PUSH');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('GOVERNANCE_MANDATORY', 'MEMBERSHIP', 'PAYMENT', 'CASE', 'APPOINTMENT', 'EVENT', 'SECURITY', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DELIVERING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "scopeKind" "ScopeKind" NOT NULL,
    "requiresOfficeTerm" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "resource" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "sensitivity" "PermissionSensitivity" NOT NULL DEFAULT 'NORMAL',
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "needsAssignment" BOOLEAN NOT NULL DEFAULT false,
    "compartment" "Compartment",
    "description" VARCHAR(400) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "legalEntityId" UUID,
    "organizationId" UUID,
    "officeTermRef" UUID,
    "grantedById" UUID NOT NULL,
    "grantReason" VARCHAR(400) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" UUID,
    "revokeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorial_scope" (
    "id" UUID NOT NULL,
    "roleAssignmentId" UUID NOT NULL,
    "territorialUnitId" UUID NOT NULL,
    "includesDescendants" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territorial_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID NOT NULL,
    "onBehalfOfPersonId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "objectKind" VARCHAR(60) NOT NULL,
    "objectId" VARCHAR(60) NOT NULL,
    "legalEntityId" UUID,
    "territorialUnitId" UUID,
    "outcome" "AuditOutcome" NOT NULL,
    "reason" VARCHAR(600),
    "scope" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlationId" VARCHAR(64) NOT NULL,
    "previousHash" CHAR(64) NOT NULL,
    "hash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_event" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "SecurityEventKind" NOT NULL,
    "actorId" UUID,
    "subjectLabel" VARCHAR(120),
    "ipHash" VARCHAR(64),
    "userAgentClass" "UserAgentClass",
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'INFO',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "correlationId" VARCHAR(64) NOT NULL,

    CONSTRAINT "security_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_version" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "plainLanguageSummary" TEXT NOT NULL,
    "requiredFor" "ConsentPurpose"[],
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "ConsentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consent_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "consentVersionId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "grantedById" UUID NOT NULL,
    "representationRef" UUID,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(400),
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_object" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "ownerPersonId" UUID,
    "classification" "FileClassification" NOT NULL,
    "contextKind" "FileContextKind" NOT NULL,
    "contextId" UUID,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "currentVersionId" UUID,
    "retentionPolicyId" UUID,
    "legalHoldId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "file_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_version" (
    "id" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "blobPathname" VARCHAR(400) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "uploadedByActorId" UUID NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanDetail" VARCHAR(400),

    CONSTRAINT "file_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policy" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "appliesToClassification" "FileClassification"[],
    "appliesToContextKind" "FileContextKind"[],
    "retentionMonths" INTEGER NOT NULL,
    "basis" VARCHAR(600) NOT NULL,
    "actionOnExpiry" "RetentionAction" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retention_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_hold" (
    "id" UUID NOT NULL,
    "scopeKind" "LegalHoldScope" NOT NULL,
    "scopeId" UUID NOT NULL,
    "reason" VARCHAR(600) NOT NULL,
    "orderedBy" VARCHAR(200) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actor" (
    "id" UUID NOT NULL,
    "kind" "ActorKind" NOT NULL,
    "userId" UUID,
    "label" VARCHAR(160) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "givenName" VARCHAR(80) NOT NULL,
    "middleName" VARCHAR(80),
    "familyName" VARCHAR(80) NOT NULL,
    "secondFamilyName" VARCHAR(80),
    "preferredName" VARCHAR(80),
    "birthDate" DATE,
    "genderIdentity" "GenderIdentity" NOT NULL DEFAULT 'UNDISCLOSED',
    "nationality" VARCHAR(60),
    "primaryEmail" VARCHAR(320),
    "primaryPhone" VARCHAR(40),
    "alternateContact" VARCHAR(200),
    "addressLine" VARCHAR(400),
    "postalCode" VARCHAR(15),
    "countryCode" CHAR(2) NOT NULL DEFAULT 'MX',
    "stateCode" VARCHAR(10),
    "municipalityCode" VARCHAR(15),
    "territorialUnitId" UUID,
    "timeZone" VARCHAR(60) NOT NULL DEFAULT 'America/Mexico_City',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'es-MX',
    "accessibilityPreferences" JSONB NOT NULL DEFAULT '{}',
    "deceasedAt" TIMESTAMPTZ(3),
    "mergedIntoPersonId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMPTZ(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CredentialType" NOT NULL,
    "secretHash" VARCHAR(255) NOT NULL,
    "algorithmParams" JSONB NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "actorKind" "SessionActor" NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" "SessionRevoke",
    "ipHash" VARCHAR(64),
    "userAgentSummary" VARCHAR(200),
    "deviceLabel" VARCHAR(80),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "requestIpHash" VARCHAR(64),
    "invalidatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "password_reset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "tradeName" VARCHAR(200),
    "taxId" VARCHAR(30),
    "kind" "OrganizationKind" NOT NULL,
    "sector" VARCHAR(120),
    "sizeBand" "OrganizationSize",
    "countryCode" CHAR(2) NOT NULL DEFAULT 'MX',
    "territorialUnitId" UUID,
    "website" VARCHAR(300),
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PROSPECT',
    "legalEntityId" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_user" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" "OrganizationUserRole" NOT NULL,
    "jobTitle" VARCHAR(120),
    "startsAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialty_catalog" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "SpecialtyKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "specialty_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entity" (
    "id" UUID NOT NULL,
    "code" "LegalEntityCode" NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "shortName" VARCHAR(80) NOT NULL,
    "kind" "LegalEntityKind" NOT NULL,
    "taxId" VARCHAR(30),
    "registryNumber" VARCHAR(60),
    "address" VARCHAR(400) NOT NULL,
    "contactEmail" VARCHAR(320) NOT NULL,
    "privacyNoticeUrl" VARCHAR(500),
    "documentSeriesPrefix" VARCHAR(10) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "legal_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorial_unit" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "TerritorialUnitType" NOT NULL,
    "parentId" UUID,
    "path" VARCHAR(500) NOT NULL,
    "depth" INTEGER NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "stateCode" VARCHAR(10),
    "municipalityCode" VARCHAR(15),
    "status" "TerritorialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdOn" DATE NOT NULL,
    "dissolvedOn" DATE,
    "contactEmail" VARCHAR(320),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "territorial_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normative_rule_set" (
    "id" UUID NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "NormativeRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "normative_rule_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'es-MX',
    "subject" VARCHAR(300),
    "bodyTemplate" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "templateId" UUID,
    "category" "NotificationCategory" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" VARCHAR(400),
    "channels" "NotificationChannel"[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "relatedKind" VARCHAR(60),
    "relatedId" VARCHAR(60),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempt" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "providerMessageId" VARCHAR(200),
    "attemptNumber" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "errorCode" VARCHAR(120),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_job" (
    "id" UUID NOT NULL,
    "jobType" VARCHAR(80) NOT NULL,
    "businessKey" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ(3),
    "claimedBy" VARCHAR(80),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" VARCHAR(2000),
    "result" JSONB,
    "alertedAt" TIMESTAMPTZ(3),
    "correlationId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "background_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_message" (
    "id" UUID NOT NULL,
    "eventName" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "legalEntityId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(2000),
    "correlationId" VARCHAR(64) NOT NULL,
    "createdByActorId" UUID NOT NULL,

    CONSTRAINT "outbox_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_delivery" (
    "id" UUID NOT NULL,
    "outboxMessageId" UUID NOT NULL,
    "handlerCode" VARCHAR(120) NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL,
    "source" VARCHAR(60) NOT NULL,
    "externalId" VARCHAR(200),
    "eventType" VARCHAR(120) NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(2000),

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "permission_module_idx" ON "permission"("module");

-- CreateIndex
CREATE INDEX "role_assignment_userId_idx" ON "role_assignment"("userId");

-- CreateIndex
CREATE INDEX "role_assignment_roleId_idx" ON "role_assignment"("roleId");

-- CreateIndex
CREATE INDEX "role_assignment_legalEntityId_idx" ON "role_assignment"("legalEntityId");

-- CreateIndex
CREATE INDEX "role_assignment_organizationId_idx" ON "role_assignment"("organizationId");

-- CreateIndex
CREATE INDEX "role_assignment_endsAt_idx" ON "role_assignment"("endsAt");

-- CreateIndex
CREATE INDEX "territorial_scope_territorialUnitId_idx" ON "territorial_scope"("territorialUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_scope_roleAssignmentId_territorialUnitId_key" ON "territorial_scope"("roleAssignmentId", "territorialUnitId");

-- CreateIndex
CREATE INDEX "audit_event_occurredAt_idx" ON "audit_event"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_objectKind_objectId_occurredAt_idx" ON "audit_event"("objectKind", "objectId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_actorId_occurredAt_idx" ON "audit_event"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_correlationId_idx" ON "audit_event"("correlationId");

-- CreateIndex
CREATE INDEX "audit_event_legalEntityId_idx" ON "audit_event"("legalEntityId");

-- CreateIndex
CREATE INDEX "security_event_occurredAt_idx" ON "security_event"("occurredAt");

-- CreateIndex
CREATE INDEX "security_event_kind_idx" ON "security_event"("kind");

-- CreateIndex
CREATE INDEX "security_event_severity_idx" ON "security_event"("severity");

-- CreateIndex
CREATE INDEX "security_event_actorId_idx" ON "security_event"("actorId");

-- CreateIndex
CREATE INDEX "security_event_correlationId_idx" ON "security_event"("correlationId");

-- CreateIndex
CREATE INDEX "consent_version_code_idx" ON "consent_version"("code");

-- CreateIndex
CREATE UNIQUE INDEX "consent_version_code_version_key" ON "consent_version"("code", "version");

-- CreateIndex
CREATE INDEX "consent_personId_idx" ON "consent"("personId");

-- CreateIndex
CREATE INDEX "consent_consentVersionId_idx" ON "consent"("consentVersionId");

-- CreateIndex
CREATE INDEX "consent_purpose_idx" ON "consent"("purpose");

-- CreateIndex
CREATE INDEX "consent_revokedAt_idx" ON "consent"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_object_publicId_key" ON "file_object"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "file_object_currentVersionId_key" ON "file_object"("currentVersionId");

-- CreateIndex
CREATE INDEX "file_object_legalEntityId_idx" ON "file_object"("legalEntityId");

-- CreateIndex
CREATE INDEX "file_object_ownerPersonId_idx" ON "file_object"("ownerPersonId");

-- CreateIndex
CREATE INDEX "file_object_classification_idx" ON "file_object"("classification");

-- CreateIndex
CREATE INDEX "file_object_contextKind_contextId_idx" ON "file_object"("contextKind", "contextId");

-- CreateIndex
CREATE INDEX "file_object_legalHoldId_idx" ON "file_object"("legalHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "file_version_blobPathname_key" ON "file_version"("blobPathname");

-- CreateIndex
CREATE INDEX "file_version_sha256_idx" ON "file_version"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "file_version_fileObjectId_version_key" ON "file_version"("fileObjectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policy_code_key" ON "retention_policy"("code");

-- CreateIndex
CREATE INDEX "legal_hold_scopeKind_scopeId_idx" ON "legal_hold"("scopeKind", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "actor_userId_key" ON "actor"("userId");

-- CreateIndex
CREATE INDEX "actor_kind_idx" ON "actor"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "person_publicId_key" ON "person"("publicId");

-- CreateIndex
CREATE INDEX "person_familyName_givenName_idx" ON "person"("familyName", "givenName");

-- CreateIndex
CREATE INDEX "person_territorialUnitId_idx" ON "person"("territorialUnitId");

-- CreateIndex
CREATE INDEX "person_primaryEmail_idx" ON "person"("primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_personId_key" ON "user_account"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_email_key" ON "user_account"("email");

-- CreateIndex
CREATE INDEX "user_account_status_idx" ON "user_account"("status");

-- CreateIndex
CREATE INDEX "credential_userId_type_idx" ON "credential"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokenHash_key" ON "session"("tokenHash");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokenHash_key" ON "password_reset"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_userId_idx" ON "password_reset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_publicId_key" ON "organization"("publicId");

-- CreateIndex
CREATE INDEX "organization_legalEntityId_idx" ON "organization"("legalEntityId");

-- CreateIndex
CREATE INDEX "organization_taxId_idx" ON "organization"("taxId");

-- CreateIndex
CREATE INDEX "organization_territorialUnitId_idx" ON "organization"("territorialUnitId");

-- CreateIndex
CREATE INDEX "organization_user_organizationId_idx" ON "organization_user"("organizationId");

-- CreateIndex
CREATE INDEX "organization_user_personId_idx" ON "organization_user"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "specialty_catalog_code_key" ON "specialty_catalog"("code");

-- CreateIndex
CREATE INDEX "specialty_catalog_kind_idx" ON "specialty_catalog"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_code_key" ON "legal_entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_documentSeriesPrefix_key" ON "legal_entity"("documentSeriesPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_unit_publicId_key" ON "territorial_unit"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_unit_code_key" ON "territorial_unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_unit_path_key" ON "territorial_unit"("path");

-- CreateIndex
CREATE INDEX "territorial_unit_parentId_idx" ON "territorial_unit"("parentId");

-- CreateIndex
CREATE INDEX "territorial_unit_type_idx" ON "territorial_unit"("type");

-- CreateIndex
CREATE INDEX "territorial_unit_status_idx" ON "territorial_unit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "normative_rule_set_version_key" ON "normative_rule_set"("version");

-- CreateIndex
CREATE INDEX "normative_rule_set_status_idx" ON "normative_rule_set"("status");

-- CreateIndex
CREATE INDEX "notification_template_code_idx" ON "notification_template"("code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_code_version_channel_locale_key" ON "notification_template"("code", "version", "channel", "locale");

-- CreateIndex
CREATE INDEX "notification_personId_createdAt_idx" ON "notification"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_category_idx" ON "notification"("category");

-- CreateIndex
CREATE INDEX "delivery_attempt_notificationId_idx" ON "delivery_attempt"("notificationId");

-- CreateIndex
CREATE INDEX "delivery_attempt_status_idx" ON "delivery_attempt"("status");

-- CreateIndex
CREATE INDEX "delivery_attempt_occurredAt_idx" ON "delivery_attempt"("occurredAt");

-- CreateIndex
CREATE INDEX "background_job_status_runAt_idx" ON "background_job"("status", "runAt");

-- CreateIndex
CREATE INDEX "background_job_jobType_idx" ON "background_job"("jobType");

-- CreateIndex
CREATE INDEX "outbox_message_status_availableAt_idx" ON "outbox_message"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_message_eventName_idx" ON "outbox_message"("eventName");

-- CreateIndex
CREATE INDEX "outbox_message_correlationId_idx" ON "outbox_message"("correlationId");

-- CreateIndex
CREATE INDEX "outbox_delivery_status_idx" ON "outbox_delivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_delivery_outboxMessageId_handlerCode_key" ON "outbox_delivery"("outboxMessageId", "handlerCode");

-- CreateIndex
CREATE INDEX "webhook_event_source_idx" ON "webhook_event"("source");

-- CreateIndex
CREATE INDEX "webhook_event_receivedAt_idx" ON "webhook_event"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_source_externalId_key" ON "webhook_event"("source", "externalId");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_scope" ADD CONSTRAINT "territorial_scope_roleAssignmentId_fkey" FOREIGN KEY ("roleAssignmentId") REFERENCES "role_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_scope" ADD CONSTRAINT "territorial_scope_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_version" ADD CONSTRAINT "consent_version_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_consentVersionId_fkey" FOREIGN KEY ("consentVersionId") REFERENCES "consent_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "retention_policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_legalHoldId_fkey" FOREIGN KEY ("legalHoldId") REFERENCES "legal_hold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "file_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_version" ADD CONSTRAINT "file_version_uploadedByActorId_fkey" FOREIGN KEY ("uploadedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actor" ADD CONSTRAINT "actor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_mergedIntoPersonId_fkey" FOREIGN KEY ("mergedIntoPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential" ADD CONSTRAINT "credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user" ADD CONSTRAINT "organization_user_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_user" ADD CONSTRAINT "organization_user_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_unit" ADD CONSTRAINT "territorial_unit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_unit" ADD CONSTRAINT "territorial_unit_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_unit" ADD CONSTRAINT "territorial_unit_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_rule_set" ADD CONSTRAINT "normative_rule_set_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_rule_set" ADD CONSTRAINT "normative_rule_set_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_message" ADD CONSTRAINT "outbox_message_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_message" ADD CONSTRAINT "outbox_message_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_delivery" ADD CONSTRAINT "outbox_delivery_outboxMessageId_fkey" FOREIGN KEY ("outboxMessageId") REFERENCES "outbox_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
