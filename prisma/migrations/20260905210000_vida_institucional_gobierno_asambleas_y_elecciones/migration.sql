-- Vida institucional: gobierno, territorio, asambleas, elecciones, negociación
-- colectiva y régimen disciplinario (PRD §9, Fase 5).
--
-- Además de las tablas, esta migración instala lo que hace que las garantías
-- del PRD sean del **motor** y no de la aplicación:
--
--  · La urna no tiene identidad ni tiempo. `ballot` y `spent_vote_credential`
--    no llevan `createdAt`, y el rol de la aplicación **no puede actualizarlas
--    ni borrarlas**: una boleta que se puede editar después de depositada no
--    es una boleta.
--  · El padrón congelado es inmutable. Se retira el privilegio de actualización
--    sobre sus columnas: un padrón recalculable no prueba ningún quórum.
--  · Un procedimiento de huelga exige acuerdo humano. Lo impide una restricción
--    CHECK, no una comprobación de la aplicación.
--  · Una resolución disciplinaria exige notificación y audiencia —o constancia
--    de renuncia expresa a ella—. También por CHECK.
--  · Las opciones de una votación abierta no se reescriben, y el resultado solo
--    existe cuando el proceso está escrutado.

-- CreateEnum
CREATE TYPE "AssemblyType" AS ENUM ('ORDINARY', 'EXTRAORDINARY', 'SECTIONAL');

-- CreateEnum
CREATE TYPE "AssemblyModality" AS ENUM ('IN_PERSON', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('PLANNED', 'CALLED', 'SECOND_CALL', 'IN_SESSION', 'CLOSED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublicationLevel" AS ENUM ('RESERVED', 'MEMBERS_ONLY', 'PUBLIC_REDACTED');

-- CreateEnum
CREATE TYPE "CallOrdinal" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "QuorumRule" AS ENUM ('HALF_PLUS_ONE', 'THOSE_PRESENT');

-- CreateEnum
CREATE TYPE "AgendaItemKind" AS ENUM ('INFORMATIVE', 'DELIBERATIVE', 'ELECTIVE', 'STATUTE_REFORM', 'FINANCIAL_REPORT', 'DISSOLUTION');

-- CreateEnum
CREATE TYPE "RequiredMajority" AS ENUM ('SIMPLE', 'QUALIFIED_TWO_THIRDS', 'QUALIFIED_STATUTORY');

-- CreateEnum
CREATE TYPE "AgendaItemStatus" AS ENUM ('PENDING', 'IN_DISCUSSION', 'VOTED', 'DEFERRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('QR_CREDENTIAL', 'MANUAL', 'REMOTE_SESSION');

-- CreateEnum
CREATE TYPE "ResolutionOutcome" AS ENUM ('APPROVED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "BargainingKind" AS ENUM ('COLLECTIVE_AGREEMENT_NEGOTIATION', 'CONTRACT_REVIEW', 'WAGE_REVIEW', 'COLLECTIVE_DISPUTE', 'STRIKE_PROCEDURE');

-- CreateEnum
CREATE TYPE "BargainingStatus" AS ENUM ('OPEN', 'NEGOTIATION', 'CONSULTATION', 'CONCILIATION', 'STRIKE_PROCEDURE', 'CONCLUDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ObligationKind" AS ENUM ('MEMBER_REGISTRY_UPDATE', 'LEADERSHIP_CHANGE', 'STATUTE_AMENDMENT', 'FINANCIAL_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'OBSERVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisciplinaryStatus" AS ENUM ('REPORTED', 'UNDER_INSTRUCTION', 'NOTIFIED', 'HEARING_SCHEDULED', 'HEARING_HELD', 'DECIDED', 'APPEALED', 'CLOSED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "EvidenceOfferedBy" AS ENUM ('INSTRUCTING_BODY', 'MEMBER', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('DOCUMENT', 'TESTIMONY', 'RECORD', 'OTHER');

-- CreateEnum
CREATE TYPE "DisciplinaryOutcome" AS ENUM ('NO_LIABILITY', 'WARNING', 'SUSPENSION_OF_RIGHTS', 'EXPULSION', 'OTHER_STATUTORY');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('FILED', 'ADMITTED', 'INADMISSIBLE', 'RESOLVED_CONFIRMED', 'RESOLVED_MODIFIED', 'RESOLVED_REVOKED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('MEMBERSHIP_RESOLUTION', 'CREDENTIAL', 'ASSEMBLY_MINUTES', 'CALL_NOTICE', 'ELECTION_RESULT', 'DISCIPLINARY_DECISION', 'POWER_GRANT', 'RECEIPT', 'CERTIFICATE', 'ATTENDANCE_CONSTANCY', 'REPORT');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "DocumentSubject" AS ENUM ('MEMBERSHIP', 'MEMBERSHIP_APPLICATION', 'CREDENTIAL', 'ASSEMBLY', 'ASSEMBLY_CALL', 'VOTE_PROCESS', 'ELECTION', 'OFFICE_TERM', 'POWER_GRANT', 'DISCIPLINARY_CASE', 'BARGAINING_FILE', 'PAYMENT', 'COMPLIANCE_OBLIGATION');

-- CreateEnum
CREATE TYPE "GeneratedDocumentStatus" AS ENUM ('ISSUED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureKind" AS ENUM ('HANDWRITTEN_SCANNED', 'ELECTRONIC_SIMPLE', 'CERTIFIED_COPY');

-- CreateEnum
CREATE TYPE "UnionBodyKind" AS ENUM ('GENERAL_ASSEMBLY', 'NATIONAL_EXECUTIVE_COMMITTEE', 'OVERSIGHT_COMMISSION', 'ELECTORAL_COMMISSION', 'SECTION_DELEGATION', 'TEMPORARY_COMMISSION');

-- CreateEnum
CREATE TYPE "UnionBodyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISSOLVED');

-- CreateEnum
CREATE TYPE "OfficeKind" AS ENUM ('SECRETARY_GENERAL', 'SECRETARY_ORGANIZATION', 'SECRETARY_LABOR_DISPUTES', 'SECRETARY_FINANCE', 'SECRETARY_MINUTES', 'SECRETARY_NEUROINCLUSION', 'SECRETARY_GENDER_EQUITY', 'SECRETARY_PRESS', 'ADDITIONAL_SECRETARY', 'OVERSIGHT_MEMBER', 'ELECTORAL_MEMBER', 'SECTION_DELEGATE', 'COMMISSION_MEMBER');

-- CreateEnum
CREATE TYPE "DesignationMethod" AS ENUM ('ELECTION', 'ASSEMBLY_APPOINTMENT', 'SUBSTITUTION', 'INTERIM');

-- CreateEnum
CREATE TYPE "PowerKind" AS ENUM ('LEGAL_REPRESENTATION', 'BANKING', 'LABOR_AUTHORITY', 'ADMINISTRATIVE', 'SPECIAL');

-- CreateEnum
CREATE TYPE "VoteContext" AS ENUM ('ASSEMBLY_ITEM', 'ELECTION', 'COLLECTIVE_CONSULTATION', 'DISCIPLINARY_APPEAL');

-- CreateEnum
CREATE TYPE "VoteMethod" AS ENUM ('SECRET', 'OPEN_ROLL_CALL');

-- CreateEnum
CREATE TYPE "VoteProcessStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'TALLIED', 'CERTIFIED', 'ANNULLED');

-- CreateEnum
CREATE TYPE "IneligibilityReason" AS ENUM ('NO_POLITICAL_RIGHTS', 'SUSPENDED', 'DUES_ARREARS', 'NOT_IN_ROSTER', 'HONORARY_AFFILIATE', 'PROTECTED_BENEFICIARY');

-- CreateEnum
CREATE TYPE "BallotNullity" AS ENUM ('BLANK', 'INVALID');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('PLANNED', 'CALL_ISSUED', 'REGISTRATION_OPEN', 'CAMPAIGN', 'VOTING', 'TALLYING', 'RESULTS_DECLARED', 'CHALLENGED', 'CLOSED', 'ANNULLED');

-- CreateEnum
CREATE TYPE "SlateStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'VALIDATED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('PROCEDURAL', 'ELIGIBILITY', 'TECHNICAL', 'CONDUCT', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED', 'ESCALATED');

-- DropIndex
DROP INDEX "territorial_unit_path_prefix_idx";

-- AlterTable
ALTER TABLE "application_review" ADD COLUMN     "reviewerOfficeTermId" UUID;

-- AlterTable
ALTER TABLE "member_credential" ADD COLUMN     "officeTermId" UUID;

-- AlterTable
ALTER TABLE "normative_rule_set" ADD COLUMN     "approvedByResolutionId" UUID,
ADD COLUMN     "documentId" UUID;

-- AlterTable
ALTER TABLE "territorial_unit" ADD COLUMN     "enablingResolutionId" UUID;

-- CreateTable
CREATE TABLE "assembly" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "unionBodyId" UUID NOT NULL,
    "territorialUnitId" UUID NOT NULL,
    "type" "AssemblyType" NOT NULL,
    "convenedByOfficeTermId" UUID,
    "convenedByPetition" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "modality" "AssemblyModality" NOT NULL,
    "venue" VARCHAR(400),
    "status" "AssemblyStatus" NOT NULL DEFAULT 'PLANNED',
    "normativeRuleSetId" UUID NOT NULL,
    "quorumDeclaredById" UUID,
    "quorumDeclaredAt" TIMESTAMPTZ(3),
    "quorumBase" INTEGER,
    "quorumPresent" INTEGER,
    "callUsedId" UUID,
    "minutesDocumentId" UUID,
    "publicationLevel" "PublicationLevel" NOT NULL DEFAULT 'RESERVED',
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_call" (
    "id" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "ordinal" "CallOrdinal" NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "noticeDays" INTEGER NOT NULL,
    "quorumRule" "QuorumRule" NOT NULL,
    "publishedChannels" TEXT[],
    "documentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assembly_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_item" (
    "id" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "AgendaItemKind" NOT NULL,
    "requiredMajority" "RequiredMajority" NOT NULL,
    "status" "AgendaItemStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agenda_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_item_document" (
    "agendaItemId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_item_document_pkey" PRIMARY KEY ("agendaItemId","fileObjectId")
);

-- CreateTable
CREATE TABLE "assembly_roster_snapshot" (
    "id" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "frozenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenById" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "assembly_roster_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_roster_entry" (
    "rosterId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "memberNumber" VARCHAR(30) NOT NULL,
    "territorialUnitId" UUID,
    "hasVoice" BOOLEAN NOT NULL,
    "hasVote" BOOLEAN NOT NULL,

    CONSTRAINT "assembly_roster_entry_pkey" PRIMARY KEY ("rosterId","membershipId")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "AttendanceMethod" NOT NULL,
    "hasVoice" BOOLEAN NOT NULL,
    "hasVote" BOOLEAN NOT NULL,
    "registeredById" UUID,
    "leftAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "assemblyId" UUID NOT NULL,
    "agendaItemId" UUID,
    "number" VARCHAR(40),
    "text" TEXT NOT NULL,
    "outcome" "ResolutionOutcome" NOT NULL,
    "voteProcessId" UUID,
    "effectiveFrom" DATE,
    "followUpOwnerId" UUID,
    "followUpDueAt" TIMESTAMPTZ(3),
    "followUpStatus" "FollowUpStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "publicationLevel" "PublicationLevel" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bargaining_file" (
    "id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "kind" "BargainingKind" NOT NULL,
    "counterpartOrganizationId" UUID,
    "territorialUnitId" UUID NOT NULL,
    "affectedRosterSnapshotId" UUID,
    "enablingResolutionId" UUID,
    "status" "BargainingStatus" NOT NULL DEFAULT 'OPEN',
    "authorityCaseNumber" VARCHAR(80),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bargaining_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bargaining_commission_member" (
    "fileId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "officeTermId" UUID,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMPTZ(3),

    CONSTRAINT "bargaining_commission_member_pkey" PRIMARY KEY ("fileId","personId")
);

-- CreateTable
CREATE TABLE "bargaining_proposal" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "documentId" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" UUID NOT NULL,
    "summary" VARCHAR(600) NOT NULL,

    CONSTRAINT "bargaining_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_obligation" (
    "id" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "kind" "ObligationKind" NOT NULL,
    "triggerEventRef" VARCHAR(200) NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3),
    "authorityReference" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compliance_obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_obligation_document" (
    "obligationId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_obligation_document_pkey" PRIMARY KEY ("obligationId","fileObjectId")
);

-- CreateTable
CREATE TABLE "disciplinary_case" (
    "id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "membershipId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" UUID,
    "allegedFacts" TEXT NOT NULL,
    "normativeRuleSetId" UUID NOT NULL,
    "instructingBodyId" UUID NOT NULL,
    "conflictOfInterestChecks" JSONB NOT NULL,
    "status" "DisciplinaryStatus" NOT NULL DEFAULT 'REPORTED',
    "notifiedAt" TIMESTAMPTZ(3),
    "hearingScheduledAt" TIMESTAMPTZ(3),
    "hearingHeldAt" TIMESTAMPTZ(3),
    "hearingWaivedAt" TIMESTAMPTZ(3),
    "memberAccessGrantedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "disciplinary_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_evidence" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "offeredBy" "EvidenceOfferedBy" NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "description" VARCHAR(600) NOT NULL,
    "fileObjectId" UUID,
    "offeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admitted" BOOLEAN,
    "admissionRationale" VARCHAR(600),
    "assessedById" UUID,
    "assessedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "disciplinary_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_decision" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "decidedByBodyId" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "DisciplinaryOutcome" NOT NULL,
    "sanctionStartsOn" DATE,
    "sanctionEndsOn" DATE,
    "rationale" TEXT NOT NULL,
    "documentId" UUID NOT NULL,
    "appealDeadlineAt" TIMESTAMPTZ(3),
    "executedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "disciplinary_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal" (
    "id" UUID NOT NULL,
    "decisionId" UUID NOT NULL,
    "filedById" UUID NOT NULL,
    "filedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grounds" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'FILED',
    "resolvedByAssemblyId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionText" TEXT,
    "rightsRestoredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "numberingSeries" VARCHAR(40),
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_document" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "templateId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "series" VARCHAR(40) NOT NULL,
    "folio" VARCHAR(40),
    "subjectKind" "DocumentSubject" NOT NULL,
    "subjectId" UUID NOT NULL,
    "renderedFileId" UUID NOT NULL,
    "variablesSnapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" UUID NOT NULL,
    "status" "GeneratedDocumentStatus" NOT NULL DEFAULT 'ISSUED',
    "supersededById" UUID,
    "cancelReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "generated_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_record" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "signerPersonId" UUID NOT NULL,
    "signerOfficeTermId" UUID,
    "signatureKind" "SignatureKind" NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL,
    "fileObjectId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "signature_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "union_body" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "UnionBodyKind" NOT NULL,
    "territorialUnitId" UUID NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "normativeRuleSetId" UUID NOT NULL,
    "status" "UnionBodyStatus" NOT NULL DEFAULT 'ACTIVE',
    "installedOn" DATE,
    "dissolvedOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "union_body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_definition" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "unionBodyId" UUID NOT NULL,
    "kind" "OfficeKind" NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "reelectionAllowed" BOOLEAN NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "grantsRoleCode" "RoleCode" NOT NULL,
    "normativeRuleSetId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "office_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_definition_permission" (
    "officeDefinitionId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "office_definition_permission_pkey" PRIMARY KEY ("officeDefinitionId","permissionId")
);

-- CreateTable
CREATE TABLE "office_incompatibility" (
    "id" UUID NOT NULL,
    "leftId" UUID NOT NULL,
    "rightId" UUID NOT NULL,
    "rationale" VARCHAR(400) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,

    CONSTRAINT "office_incompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_term" (
    "id" UUID NOT NULL,
    "officeDefinitionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "territorialUnitId" UUID,
    "designationMethod" "DesignationMethod" NOT NULL,
    "electionId" UUID,
    "evidenceDocumentId" UUID,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "substitutedTermId" UUID,
    "endedEarlyOn" DATE,
    "endReason" VARCHAR(400),
    "roleAssignmentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "office_term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_grant" (
    "id" UUID NOT NULL,
    "officeTermId" UUID NOT NULL,
    "granteePersonId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "powerKind" "PowerKind" NOT NULL,
    "documentId" UUID NOT NULL,
    "notaryReference" VARCHAR(200),
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "revokedOn" DATE,
    "revokeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "power_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_process" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "context" "VoteContext" NOT NULL,
    "assemblyId" UUID,
    "agendaItemId" UUID,
    "electionId" UUID,
    "bargainingFileId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "method" "VoteMethod" NOT NULL,
    "options" JSONB NOT NULL,
    "rosterSnapshotId" UUID NOT NULL,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "VoteProcessStatus" NOT NULL DEFAULT 'SCHEDULED',
    "talliedAt" TIMESTAMPTZ(3),
    "results" JSONB,
    "resultDocumentId" UUID,
    "certifiedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vote_process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_eligibility" (
    "id" UUID NOT NULL,
    "voteProcessId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "reasonIfNot" "IneligibilityReason",
    "credentialIssued" BOOLEAN NOT NULL DEFAULT false,
    "credentialIssuedOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vote_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballot" (
    "id" UUID NOT NULL,
    "voteProcessId" UUID NOT NULL,
    "selection" JSONB NOT NULL,
    "nullifiedReason" "BallotNullity",
    "verificationCode" VARCHAR(40) NOT NULL,

    CONSTRAINT "ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spent_vote_credential" (
    "id" UUID NOT NULL,
    "voteProcessId" UUID NOT NULL,
    "credentialHash" VARCHAR(64) NOT NULL,

    CONSTRAINT "spent_vote_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_receipt" (
    "id" UUID NOT NULL,
    "voteProcessId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "receiptCode" VARCHAR(40) NOT NULL,
    "issuedOn" DATE NOT NULL,

    CONSTRAINT "vote_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "unionBodyId" UUID NOT NULL,
    "territorialUnitId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "calendar" JSONB NOT NULL,
    "callDocumentId" UUID,
    "rosterPublishedAt" TIMESTAMPTZ(3),
    "status" "ElectionStatus" NOT NULL DEFAULT 'PLANNED',
    "resultDocumentId" UUID,
    "normativeRuleSetId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_commission_member" (
    "electionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "officeTermId" UUID,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMPTZ(3),
    "noCandidacyDeclared" BOOLEAN NOT NULL DEFAULT false,
    "declaredAt" TIMESTAMPTZ(3),

    CONSTRAINT "election_commission_member_pkey" PRIMARY KEY ("electionId","personId")
);

-- CreateTable
CREATE TABLE "candidate_slate" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SlateStatus" NOT NULL DEFAULT 'SUBMITTED',
    "rejectionReason" VARCHAR(400),
    "genderComposition" JSONB NOT NULL,
    "complianceWarnings" JSONB NOT NULL,
    "validatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "candidate_slate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slate_member" (
    "slateId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "officeDefinitionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "isSubstitute" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "slate_member_pkey" PRIMARY KEY ("slateId","personId","officeDefinitionId")
);

-- CreateTable
CREATE TABLE "election_incident" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "reportedById" UUID NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "IncidentKind" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "election_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_incident_evidence" (
    "incidentId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "election_incident_evidence_pkey" PRIMARY KEY ("incidentId","fileObjectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "assembly_publicId_key" ON "assembly"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_callUsedId_key" ON "assembly"("callUsedId");

-- CreateIndex
CREATE INDEX "assembly_unionBodyId_idx" ON "assembly"("unionBodyId");

-- CreateIndex
CREATE INDEX "assembly_scheduledAt_idx" ON "assembly"("scheduledAt");

-- CreateIndex
CREATE INDEX "assembly_status_idx" ON "assembly"("status");

-- CreateIndex
CREATE INDEX "assembly_call_assemblyId_idx" ON "assembly_call"("assemblyId");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_call_assemblyId_ordinal_key" ON "assembly_call"("assemblyId", "ordinal");

-- CreateIndex
CREATE INDEX "agenda_item_assemblyId_idx" ON "agenda_item"("assemblyId");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_item_assemblyId_position_key" ON "agenda_item"("assemblyId", "position");

-- CreateIndex
CREATE INDEX "agenda_item_document_fileObjectId_idx" ON "agenda_item_document"("fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_roster_snapshot_assemblyId_key" ON "assembly_roster_snapshot"("assemblyId");

-- CreateIndex
CREATE INDEX "assembly_roster_entry_membershipId_idx" ON "assembly_roster_entry"("membershipId");

-- CreateIndex
CREATE INDEX "attendance_assemblyId_idx" ON "attendance"("assemblyId");

-- CreateIndex
CREATE INDEX "attendance_membershipId_idx" ON "attendance"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_assemblyId_membershipId_key" ON "attendance"("assemblyId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_publicId_key" ON "resolution"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_voteProcessId_key" ON "resolution"("voteProcessId");

-- CreateIndex
CREATE INDEX "resolution_assemblyId_idx" ON "resolution"("assemblyId");

-- CreateIndex
CREATE INDEX "resolution_followUpStatus_idx" ON "resolution"("followUpStatus");

-- CreateIndex
CREATE UNIQUE INDEX "bargaining_file_folio_key" ON "bargaining_file"("folio");

-- CreateIndex
CREATE INDEX "bargaining_file_territorialUnitId_idx" ON "bargaining_file"("territorialUnitId");

-- CreateIndex
CREATE INDEX "bargaining_file_status_idx" ON "bargaining_file"("status");

-- CreateIndex
CREATE INDEX "bargaining_file_kind_idx" ON "bargaining_file"("kind");

-- CreateIndex
CREATE INDEX "bargaining_commission_member_personId_idx" ON "bargaining_commission_member"("personId");

-- CreateIndex
CREATE INDEX "bargaining_proposal_fileId_idx" ON "bargaining_proposal"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "bargaining_proposal_fileId_version_key" ON "bargaining_proposal"("fileId", "version");

-- CreateIndex
CREATE INDEX "compliance_obligation_dueAt_idx" ON "compliance_obligation"("dueAt");

-- CreateIndex
CREATE INDEX "compliance_obligation_status_idx" ON "compliance_obligation"("status");

-- CreateIndex
CREATE INDEX "compliance_obligation_document_fileObjectId_idx" ON "compliance_obligation_document"("fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplinary_case_folio_key" ON "disciplinary_case"("folio");

-- CreateIndex
CREATE INDEX "disciplinary_case_membershipId_idx" ON "disciplinary_case"("membershipId");

-- CreateIndex
CREATE INDEX "disciplinary_case_status_idx" ON "disciplinary_case"("status");

-- CreateIndex
CREATE INDEX "disciplinary_case_personId_idx" ON "disciplinary_case"("personId");

-- CreateIndex
CREATE INDEX "disciplinary_evidence_caseId_idx" ON "disciplinary_evidence"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplinary_decision_caseId_key" ON "disciplinary_decision"("caseId");

-- CreateIndex
CREATE INDEX "appeal_decisionId_idx" ON "appeal"("decisionId");

-- CreateIndex
CREATE INDEX "appeal_status_idx" ON "appeal"("status");

-- CreateIndex
CREATE INDEX "document_template_code_idx" ON "document_template"("code");

-- CreateIndex
CREATE INDEX "document_template_kind_idx" ON "document_template"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_code_version_key" ON "document_template"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_publicId_key" ON "generated_document"("publicId");

-- CreateIndex
CREATE INDEX "generated_document_templateId_idx" ON "generated_document"("templateId");

-- CreateIndex
CREATE INDEX "generated_document_legalEntityId_idx" ON "generated_document"("legalEntityId");

-- CreateIndex
CREATE INDEX "generated_document_subjectId_idx" ON "generated_document"("subjectId");

-- CreateIndex
CREATE INDEX "generated_document_status_idx" ON "generated_document"("status");

-- CreateIndex
CREATE INDEX "signature_record_documentId_idx" ON "signature_record"("documentId");

-- CreateIndex
CREATE INDEX "signature_record_signerPersonId_idx" ON "signature_record"("signerPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "union_body_code_key" ON "union_body"("code");

-- CreateIndex
CREATE INDEX "union_body_territorialUnitId_idx" ON "union_body"("territorialUnitId");

-- CreateIndex
CREATE INDEX "union_body_kind_idx" ON "union_body"("kind");

-- CreateIndex
CREATE INDEX "union_body_status_idx" ON "union_body"("status");

-- CreateIndex
CREATE UNIQUE INDEX "office_definition_code_key" ON "office_definition"("code");

-- CreateIndex
CREATE INDEX "office_definition_unionBodyId_idx" ON "office_definition"("unionBodyId");

-- CreateIndex
CREATE INDEX "office_definition_kind_idx" ON "office_definition"("kind");

-- CreateIndex
CREATE INDEX "office_definition_permission_permissionId_idx" ON "office_definition_permission"("permissionId");

-- CreateIndex
CREATE INDEX "office_incompatibility_rightId_idx" ON "office_incompatibility"("rightId");

-- CreateIndex
CREATE UNIQUE INDEX "office_incompatibility_leftId_rightId_key" ON "office_incompatibility"("leftId", "rightId");

-- CreateIndex
CREATE UNIQUE INDEX "office_term_roleAssignmentId_key" ON "office_term"("roleAssignmentId");

-- CreateIndex
CREATE INDEX "office_term_officeDefinitionId_idx" ON "office_term"("officeDefinitionId");

-- CreateIndex
CREATE INDEX "office_term_personId_idx" ON "office_term"("personId");

-- CreateIndex
CREATE INDEX "office_term_endsOn_idx" ON "office_term"("endsOn");

-- CreateIndex
CREATE INDEX "office_term_membershipId_idx" ON "office_term"("membershipId");

-- CreateIndex
CREATE INDEX "power_grant_officeTermId_idx" ON "power_grant"("officeTermId");

-- CreateIndex
CREATE INDEX "power_grant_granteePersonId_idx" ON "power_grant"("granteePersonId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_process_publicId_key" ON "vote_process"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_process_electionId_key" ON "vote_process"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_process_bargainingFileId_key" ON "vote_process"("bargainingFileId");

-- CreateIndex
CREATE INDEX "vote_process_context_idx" ON "vote_process"("context");

-- CreateIndex
CREATE INDEX "vote_process_closesAt_idx" ON "vote_process"("closesAt");

-- CreateIndex
CREATE INDEX "vote_process_status_idx" ON "vote_process"("status");

-- CreateIndex
CREATE INDEX "vote_eligibility_voteProcessId_idx" ON "vote_eligibility"("voteProcessId");

-- CreateIndex
CREATE INDEX "vote_eligibility_membershipId_idx" ON "vote_eligibility"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_eligibility_voteProcessId_membershipId_key" ON "vote_eligibility"("voteProcessId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ballot_verificationCode_key" ON "ballot"("verificationCode");

-- CreateIndex
CREATE INDEX "ballot_voteProcessId_idx" ON "ballot"("voteProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "spent_vote_credential_credentialHash_key" ON "spent_vote_credential"("credentialHash");

-- CreateIndex
CREATE INDEX "spent_vote_credential_voteProcessId_idx" ON "spent_vote_credential"("voteProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_receipt_receiptCode_key" ON "vote_receipt"("receiptCode");

-- CreateIndex
CREATE INDEX "vote_receipt_voteProcessId_idx" ON "vote_receipt"("voteProcessId");

-- CreateIndex
CREATE INDEX "vote_receipt_membershipId_idx" ON "vote_receipt"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_receipt_voteProcessId_membershipId_key" ON "vote_receipt"("voteProcessId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "election_publicId_key" ON "election"("publicId");

-- CreateIndex
CREATE INDEX "election_territorialUnitId_idx" ON "election"("territorialUnitId");

-- CreateIndex
CREATE INDEX "election_status_idx" ON "election"("status");

-- CreateIndex
CREATE INDEX "election_commission_member_personId_idx" ON "election_commission_member"("personId");

-- CreateIndex
CREATE INDEX "candidate_slate_electionId_idx" ON "candidate_slate"("electionId");

-- CreateIndex
CREATE INDEX "slate_member_personId_idx" ON "slate_member"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "slate_member_slateId_officeDefinitionId_isSubstitute_key" ON "slate_member"("slateId", "officeDefinitionId", "isSubstitute");

-- CreateIndex
CREATE INDEX "election_incident_electionId_idx" ON "election_incident"("electionId");

-- CreateIndex
CREATE INDEX "election_incident_status_idx" ON "election_incident"("status");

-- CreateIndex
CREATE INDEX "election_incident_evidence_fileObjectId_idx" ON "election_incident_evidence"("fileObjectId");

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_unionBodyId_fkey" FOREIGN KEY ("unionBodyId") REFERENCES "union_body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_convenedByOfficeTermId_fkey" FOREIGN KEY ("convenedByOfficeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_normativeRuleSetId_fkey" FOREIGN KEY ("normativeRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_quorumDeclaredById_fkey" FOREIGN KEY ("quorumDeclaredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_callUsedId_fkey" FOREIGN KEY ("callUsedId") REFERENCES "assembly_call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_minutesDocumentId_fkey" FOREIGN KEY ("minutesDocumentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_call" ADD CONSTRAINT "assembly_call_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_call" ADD CONSTRAINT "assembly_call_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_call" ADD CONSTRAINT "assembly_call_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_call" ADD CONSTRAINT "assembly_call_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item_document" ADD CONSTRAINT "agenda_item_document_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "agenda_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item_document" ADD CONSTRAINT "agenda_item_document_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_roster_snapshot" ADD CONSTRAINT "assembly_roster_snapshot_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_roster_snapshot" ADD CONSTRAINT "assembly_roster_snapshot_frozenById_fkey" FOREIGN KEY ("frozenById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_roster_entry" ADD CONSTRAINT "assembly_roster_entry_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "assembly_roster_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_roster_entry" ADD CONSTRAINT "assembly_roster_entry_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "agenda_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_voteProcessId_fkey" FOREIGN KEY ("voteProcessId") REFERENCES "vote_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_followUpOwnerId_fkey" FOREIGN KEY ("followUpOwnerId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_counterpartOrganizationId_fkey" FOREIGN KEY ("counterpartOrganizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_affectedRosterSnapshotId_fkey" FOREIGN KEY ("affectedRosterSnapshotId") REFERENCES "assembly_roster_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_enablingResolutionId_fkey" FOREIGN KEY ("enablingResolutionId") REFERENCES "resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_file" ADD CONSTRAINT "bargaining_file_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_commission_member" ADD CONSTRAINT "bargaining_commission_member_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "bargaining_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_commission_member" ADD CONSTRAINT "bargaining_commission_member_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_proposal" ADD CONSTRAINT "bargaining_proposal_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "bargaining_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_proposal" ADD CONSTRAINT "bargaining_proposal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bargaining_proposal" ADD CONSTRAINT "bargaining_proposal_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligation" ADD CONSTRAINT "compliance_obligation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligation" ADD CONSTRAINT "compliance_obligation_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligation" ADD CONSTRAINT "compliance_obligation_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligation_document" ADD CONSTRAINT "compliance_obligation_document_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "compliance_obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligation_document" ADD CONSTRAINT "compliance_obligation_document_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_normativeRuleSetId_fkey" FOREIGN KEY ("normativeRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_instructingBodyId_fkey" FOREIGN KEY ("instructingBodyId") REFERENCES "union_body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_case" ADD CONSTRAINT "disciplinary_case_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_evidence" ADD CONSTRAINT "disciplinary_evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "disciplinary_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_evidence" ADD CONSTRAINT "disciplinary_evidence_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_evidence" ADD CONSTRAINT "disciplinary_evidence_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_evidence" ADD CONSTRAINT "disciplinary_evidence_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_evidence" ADD CONSTRAINT "disciplinary_evidence_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_decision" ADD CONSTRAINT "disciplinary_decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "disciplinary_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_decision" ADD CONSTRAINT "disciplinary_decision_decidedByBodyId_fkey" FOREIGN KEY ("decidedByBodyId") REFERENCES "union_body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_decision" ADD CONSTRAINT "disciplinary_decision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_decision" ADD CONSTRAINT "disciplinary_decision_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_decision" ADD CONSTRAINT "disciplinary_decision_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "disciplinary_decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_resolvedByAssemblyId_fkey" FOREIGN KEY ("resolvedByAssemblyId") REFERENCES "assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_renderedFileId_fkey" FOREIGN KEY ("renderedFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document" ADD CONSTRAINT "generated_document_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_record" ADD CONSTRAINT "signature_record_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_record" ADD CONSTRAINT "signature_record_signerPersonId_fkey" FOREIGN KEY ("signerPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_record" ADD CONSTRAINT "signature_record_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_record" ADD CONSTRAINT "signature_record_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_record" ADD CONSTRAINT "signature_record_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_requiresAuthorizingResolutionId_fkey" FOREIGN KEY ("requiresAuthorizingResolutionId") REFERENCES "resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_register" ADD CONSTRAINT "asset_register_authorizingResolutionId_fkey" FOREIGN KEY ("authorizingResolutionId") REFERENCES "resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "union_body" ADD CONSTRAINT "union_body_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "union_body" ADD CONSTRAINT "union_body_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "union_body" ADD CONSTRAINT "union_body_normativeRuleSetId_fkey" FOREIGN KEY ("normativeRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "union_body" ADD CONSTRAINT "union_body_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "union_body" ADD CONSTRAINT "union_body_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition" ADD CONSTRAINT "office_definition_unionBodyId_fkey" FOREIGN KEY ("unionBodyId") REFERENCES "union_body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition" ADD CONSTRAINT "office_definition_normativeRuleSetId_fkey" FOREIGN KEY ("normativeRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition" ADD CONSTRAINT "office_definition_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition" ADD CONSTRAINT "office_definition_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition_permission" ADD CONSTRAINT "office_definition_permission_officeDefinitionId_fkey" FOREIGN KEY ("officeDefinitionId") REFERENCES "office_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_definition_permission" ADD CONSTRAINT "office_definition_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_incompatibility" ADD CONSTRAINT "office_incompatibility_leftId_fkey" FOREIGN KEY ("leftId") REFERENCES "office_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_incompatibility" ADD CONSTRAINT "office_incompatibility_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "office_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_incompatibility" ADD CONSTRAINT "office_incompatibility_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_incompatibility" ADD CONSTRAINT "office_incompatibility_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_officeDefinitionId_fkey" FOREIGN KEY ("officeDefinitionId") REFERENCES "office_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_substitutedTermId_fkey" FOREIGN KEY ("substitutedTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_roleAssignmentId_fkey" FOREIGN KEY ("roleAssignmentId") REFERENCES "role_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_term" ADD CONSTRAINT "office_term_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_grant" ADD CONSTRAINT "power_grant_officeTermId_fkey" FOREIGN KEY ("officeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_grant" ADD CONSTRAINT "power_grant_granteePersonId_fkey" FOREIGN KEY ("granteePersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_grant" ADD CONSTRAINT "power_grant_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_grant" ADD CONSTRAINT "power_grant_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_grant" ADD CONSTRAINT "power_grant_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_unit" ADD CONSTRAINT "territorial_unit_enablingResolutionId_fkey" FOREIGN KEY ("enablingResolutionId") REFERENCES "resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_rule_set" ADD CONSTRAINT "normative_rule_set_approvedByResolutionId_fkey" FOREIGN KEY ("approvedByResolutionId") REFERENCES "resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normative_rule_set" ADD CONSTRAINT "normative_rule_set_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_review" ADD CONSTRAINT "application_review_reviewerOfficeTermId_fkey" FOREIGN KEY ("reviewerOfficeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_credential" ADD CONSTRAINT "member_credential_officeTermId_fkey" FOREIGN KEY ("officeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "agenda_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_bargainingFileId_fkey" FOREIGN KEY ("bargainingFileId") REFERENCES "bargaining_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_rosterSnapshotId_fkey" FOREIGN KEY ("rosterSnapshotId") REFERENCES "assembly_roster_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_resultDocumentId_fkey" FOREIGN KEY ("resultDocumentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_process" ADD CONSTRAINT "vote_process_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_eligibility" ADD CONSTRAINT "vote_eligibility_voteProcessId_fkey" FOREIGN KEY ("voteProcessId") REFERENCES "vote_process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_eligibility" ADD CONSTRAINT "vote_eligibility_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_eligibility" ADD CONSTRAINT "vote_eligibility_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_eligibility" ADD CONSTRAINT "vote_eligibility_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_voteProcessId_fkey" FOREIGN KEY ("voteProcessId") REFERENCES "vote_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spent_vote_credential" ADD CONSTRAINT "spent_vote_credential_voteProcessId_fkey" FOREIGN KEY ("voteProcessId") REFERENCES "vote_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_receipt" ADD CONSTRAINT "vote_receipt_voteProcessId_fkey" FOREIGN KEY ("voteProcessId") REFERENCES "vote_process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_receipt" ADD CONSTRAINT "vote_receipt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_unionBodyId_fkey" FOREIGN KEY ("unionBodyId") REFERENCES "union_body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_callDocumentId_fkey" FOREIGN KEY ("callDocumentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_resultDocumentId_fkey" FOREIGN KEY ("resultDocumentId") REFERENCES "generated_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_normativeRuleSetId_fkey" FOREIGN KEY ("normativeRuleSetId") REFERENCES "normative_rule_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election" ADD CONSTRAINT "election_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_commission_member" ADD CONSTRAINT "election_commission_member_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_commission_member" ADD CONSTRAINT "election_commission_member_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_slate" ADD CONSTRAINT "candidate_slate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_slate" ADD CONSTRAINT "candidate_slate_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_slate" ADD CONSTRAINT "candidate_slate_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_slate" ADD CONSTRAINT "candidate_slate_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slate_member" ADD CONSTRAINT "slate_member_slateId_fkey" FOREIGN KEY ("slateId") REFERENCES "candidate_slate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slate_member" ADD CONSTRAINT "slate_member_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slate_member" ADD CONSTRAINT "slate_member_officeDefinitionId_fkey" FOREIGN KEY ("officeDefinitionId") REFERENCES "office_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident" ADD CONSTRAINT "election_incident_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident" ADD CONSTRAINT "election_incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident" ADD CONSTRAINT "election_incident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident" ADD CONSTRAINT "election_incident_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident" ADD CONSTRAINT "election_incident_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident_evidence" ADD CONSTRAINT "election_incident_evidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "election_incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_incident_evidence" ADD CONSTRAINT "election_incident_evidence_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Garantías del dominio, en la base
-- ---------------------------------------------------------------------------

-- 1. El secreto del voto.
--
-- La urna es de una sola dirección: se deposita y no se toca más. Sin esto, un
-- rol con acceso de escritura podría alterar el sentido de un voto ya emitido,
-- o borrar la credencial consumida para permitir un segundo depósito.
REVOKE UPDATE, DELETE ON "ballot" FROM fuerza_app;
REVOKE UPDATE, DELETE ON "spent_vote_credential" FROM fuerza_app;

-- El acuse tampoco se edita: prueba que se emitió una credencial, y esa
-- emisión ya ocurrió.
REVOKE UPDATE, DELETE ON "vote_receipt" FROM fuerza_app;

-- 2. El padrón congelado.
--
-- Se congela una vez y no se recalcula. La huella deja de significar nada si
-- las filas que resume pueden cambiar después.
REVOKE UPDATE, DELETE ON "assembly_roster_snapshot" FROM fuerza_app;
REVOKE UPDATE, DELETE ON "assembly_roster_entry" FROM fuerza_app;

-- 3. Lo que un documento dice, dicho queda.
REVOKE UPDATE ("variablesSnapshot", "templateVersion", "renderedFileId", "issuedAt")
  ON "generated_document" FROM fuerza_app;

-- 4. Ninguna automatización inicia un procedimiento de huelga (PRD §9.6).
ALTER TABLE "bargaining_file"
  ADD CONSTRAINT "bargaining_huelga_exige_acuerdo"
  CHECK (
    ("kind" <> 'STRIKE_PROCEDURE' AND "status" <> 'STRIKE_PROCEDURE')
    OR "enablingResolutionId" IS NOT NULL
  );

-- 5. Sin notificación y sin audiencia no hay resolución (PRD §9.8).
--
-- La renuncia expresa a la audiencia es una constancia con fecha, no una
-- omisión: quien renuncia lo hace por escrito y queda registrado.
ALTER TABLE "disciplinary_case"
  ADD CONSTRAINT "disciplinary_resolucion_exige_debido_proceso"
  CHECK (
    "status" NOT IN ('DECIDED', 'APPEALED', 'CLOSED')
    OR ("notifiedAt" IS NOT NULL AND ("hearingHeldAt" IS NOT NULL OR "hearingWaivedAt" IS NOT NULL))
  );

-- 6. Una sanción con vigencia empieza antes de terminar.
ALTER TABLE "disciplinary_decision"
  ADD CONSTRAINT "disciplinary_sancion_coherente"
  CHECK ("sanctionEndsOn" IS NULL OR "sanctionStartsOn" IS NULL OR "sanctionEndsOn" >= "sanctionStartsOn");

-- 7. Un periodo de cargo empieza antes de terminar.
ALTER TABLE "office_term"
  ADD CONSTRAINT "office_term_vigencia_coherente"
  CHECK ("endsOn" > "startsOn");

-- 8. Un cargo no es incompatible consigo mismo, y la pareja se guarda una sola
--    vez con el identificador menor primero: una incompatibilidad es simétrica.
ALTER TABLE "office_incompatibility"
  ADD CONSTRAINT "office_incompatibility_par_canonico"
  CHECK ("leftId" < "rightId");

-- 9. El quórum declarado va completo o no va: quién, cuándo, base y presentes.
ALTER TABLE "assembly"
  ADD CONSTRAINT "assembly_quorum_completo"
  CHECK (
    ("quorumDeclaredById" IS NULL AND "quorumDeclaredAt" IS NULL AND "quorumBase" IS NULL AND "quorumPresent" IS NULL)
    OR ("quorumDeclaredById" IS NOT NULL AND "quorumDeclaredAt" IS NOT NULL AND "quorumBase" IS NOT NULL AND "quorumPresent" IS NOT NULL)
  );

-- Y una asamblea en sesión ya declaró su quórum.
ALTER TABLE "assembly"
  ADD CONSTRAINT "assembly_sesion_exige_quorum"
  CHECK ("status" NOT IN ('IN_SESSION', 'CLOSED', 'PUBLISHED') OR "quorumDeclaredAt" IS NOT NULL);

-- 10. Un proceso escrutado tiene resultados; uno que no lo está, no los tiene.
ALTER TABLE "vote_process"
  ADD CONSTRAINT "vote_process_resultado_coherente"
  CHECK (
    ("status" IN ('TALLIED', 'CERTIFIED') AND "results" IS NOT NULL AND "talliedAt" IS NOT NULL)
    OR ("status" NOT IN ('TALLIED', 'CERTIFIED') AND "results" IS NULL)
  );

-- Y se abre antes de cerrarse.
ALTER TABLE "vote_process"
  ADD CONSTRAINT "vote_process_ventana_coherente"
  CHECK ("closesAt" > "opensAt");

-- 11. Una credencial de voto emitida tiene fecha de emisión, y solo se emite a
--     quien es elegible.
ALTER TABLE "vote_eligibility"
  ADD CONSTRAINT "vote_eligibility_credencial_coherente"
  CHECK (
    ("credentialIssued" = false AND "credentialIssuedOn" IS NULL)
    OR ("credentialIssued" = true AND "credentialIssuedOn" IS NOT NULL AND "eligible" = true)
  );

-- Y quien no es elegible dice por qué no lo es.
ALTER TABLE "vote_eligibility"
  ADD CONSTRAINT "vote_eligibility_motivo_obligatorio"
  CHECK ("eligible" = true OR "reasonIfNot" IS NOT NULL);

-- 12. Una unidad territorial disuelta tiene fecha de disolución, y al revés.
ALTER TABLE "union_body"
  ADD CONSTRAINT "union_body_disolucion_coherente"
  CHECK (("status" = 'DISSOLVED') = ("dissolvedOn" IS NOT NULL));

-- 13. Una planilla rechazada dice por qué.
ALTER TABLE "candidate_slate"
  ADD CONSTRAINT "candidate_slate_rechazo_con_motivo"
  CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);

-- 14. Serie documental: el folio es único dentro de su entidad y su serie, y
--     solo cuando existe.
CREATE UNIQUE INDEX "generated_document_folio_por_serie"
  ON "generated_document" ("legalEntityId", "series", "folio")
  WHERE "folio" IS NOT NULL;

-- 15. Serie de resoluciones: el número es único cuando se asigna.
CREATE UNIQUE INDEX "resolution_numero_unico"
  ON "resolution" ("number")
  WHERE "number" IS NOT NULL;

-- 16. Una persona no ocupa dos veces el mismo cargo en el mismo momento.
CREATE UNIQUE INDEX "office_term_sin_traslape_vivo"
  ON "office_term" ("officeDefinitionId", "personId", "startsOn")
  WHERE "endedEarlyOn" IS NULL;

-- 17. La ruta materializada del territorio se consulta por prefijo.
--     El índice de igualdad no sirve para `LIKE 'ruta/%'`.
CREATE INDEX "territorial_unit_path_prefijo"
  ON "territorial_unit" ("path" text_pattern_ops);
