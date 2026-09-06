-- Defensa, casos, protección y canalización social (PRD §10, Fase 6).
--
-- Lo que esta migración añade no es una tabla de tickets: es un expediente con
-- dos compartimentos que no se mezclan, cuyo acceso se concede por asignación y
-- del que nada sale hacia la otra entidad sin consentimiento de la persona
-- sobre los campos y archivos exactos que se transfieren.
--
-- Tres cosas quedan garantizadas por el motor y no por el código:
--
--   1. El relato original del expediente no se puede editar.
--   2. La bitácora del expediente no se puede alterar ni borrar.
--   3. Una canalización no puede pasar de «esperando consentimiento» sin uno.

-- CreateEnum
CREATE TYPE "CaseDomain" AS ENUM ('UNION_DEFENSE', 'SOCIAL_ATTENTION');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_PERSON', 'WAITING_ON_THIRD_PARTY', 'REFERRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('RESOLVED', 'PARTIALLY_RESOLVED', 'REFERRED', 'WITHDRAWN_BY_PERSON', 'NOT_COMPETENT', 'NO_CONTACT');

-- CreateEnum
CREATE TYPE "CaseParticipantRole" AS ENUM ('APPLICANT', 'AFFECTED_PERSON', 'REPRESENTATIVE', 'FAMILY_OR_CAREGIVER', 'WITNESS', 'COUNTERPART', 'EXTERNAL_INSTITUTION');

-- CreateEnum
CREATE TYPE "CaseMembershipQuality" AS ENUM ('UNION_MEMBER', 'HONORARY_AFFILIATE', 'PROTECTED_BENEFICIARY', 'NONE');

-- CreateEnum
CREATE TYPE "CaseAssignmentRole" AS ENUM ('OWNER', 'SUPPORT', 'SUPERVISOR', 'OBSERVER');

-- CreateEnum
CREATE TYPE "CaseEventKind" AS ENUM ('CREATED', 'ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_REMOVED', 'DOCUMENT_ADDED', 'MESSAGE_SENT', 'REFERRAL_CREATED', 'REFERRAL_ACCEPTED', 'REFERRAL_RETURNED', 'TASK_CREATED', 'TASK_COMPLETED', 'VIEWED_SENSITIVE', 'EXPORTED', 'EMERGENCY_RAISED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CaseTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseMessageAudience" AS ENUM ('PERSON_AND_TEAM', 'TEAM_ONLY', 'SUPERVISION_ONLY');

-- CreateEnum
CREATE TYPE "CaseDocumentKind" AS ENUM ('EVIDENCE', 'IDENTIFICATION', 'LEGAL_FILING', 'MEDICAL_OR_CLINICAL', 'CORRESPONDENCE', 'INTERNAL_WORKING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralTarget" AS ENUM ('UNION_DEFENSE', 'SOCIAL_ATTENTION', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PROPOSED', 'AWAITING_CONSENT', 'SENT', 'ACCEPTED', 'REJECTED', 'RETURNED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseEmergencySource" AS ENUM ('PERSON', 'STAFF', 'AUTOMATED_KEYWORD');

-- CreateEnum
CREATE TYPE "CaseRiskKind" AS ENUM ('VIOLENCE', 'SELF_HARM', 'CHILD_PROTECTION', 'HEALTH_EMERGENCY', 'OTHER');

-- El índice de prefijo territorial NO se retira, aunque `prisma migrate diff` lo
-- proponga: Prisma no sabe expresar `text_pattern_ops` en el esquema, así que
-- cada diferencia futura volverá a pedir borrarlo. Se escribió a mano al abrir
-- la Fase 5 (ADR-0027) y sin él el filtro territorial de cada consulta recorre
-- la tabla entera en cualquier instalación cuya configuración regional no sea C.

-- AlterTable
ALTER TABLE "support_request" ADD COLUMN     "confirmedAt" TIMESTAMPTZ(3),
ADD COLUMN     "confirmedById" UUID,
ADD COLUMN     "confirmedRoutingLegalEntityId" UUID,
ADD COLUMN     "submittedByPersonId" UUID,
ADD COLUMN     "suggestedRouting" JSONB,
ADD COLUMN     "territorialUnitId" UUID;

-- CreateTable
CREATE TABLE "case_file" (
    "id" UUID NOT NULL,
    "folio" VARCHAR(24) NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "supportRequestId" UUID,
    "legalEntityId" UUID NOT NULL,
    "domain" "CaseDomain" NOT NULL,
    "caseType" "SupportRequestType" NOT NULL,
    "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL',
    "territorialUnitId" UUID,
    "originalSummary" TEXT NOT NULL,
    "humanAssessment" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closeOutcome" "CaseOutcome",
    "closeReason" TEXT,
    "reopenedFromCaseId" UUID,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_participant" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "personId" UUID,
    "externalName" VARCHAR(160),
    "role" "CaseParticipantRole" NOT NULL,
    "membershipQuality" "CaseMembershipQuality" NOT NULL DEFAULT 'NONE',
    "canViewCase" BOOLEAN NOT NULL DEFAULT false,
    "consentId" UUID,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "removeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignment" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignmentRole" "CaseAssignmentRole" NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMPTZ(3),
    "unassignReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_event" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" "CaseEventKind" NOT NULL,
    "actorId" UUID,
    "summary" VARCHAR(400) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditEventId" UUID,

    CONSTRAINT "case_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_task" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assigneeId" UUID,
    "dueAt" TIMESTAMPTZ(3),
    "status" "CaseTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ(3),
    "completedById" UUID,
    "blockerNote" VARCHAR(600),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_message" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "authorId" UUID,
    "audience" "CaseMessageAudience" NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readReceipts" JSONB NOT NULL DEFAULT '[]',
    "editedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_message_attachment" (
    "messageId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "attachedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_message_attachment_pkey" PRIMARY KEY ("messageId","fileObjectId")
);

-- CreateTable
CREATE TABLE "case_document" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "kind" "CaseDocumentKind" NOT NULL,
    "description" VARCHAR(400) NOT NULL,
    "visibleToPerson" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "removeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "fromLegalEntityId" UUID NOT NULL,
    "toLegalEntityId" UUID NOT NULL,
    "toModule" "ReferralTarget" NOT NULL,
    "externalRecipient" VARCHAR(200),
    "reason" TEXT NOT NULL,
    "explanationShownToPerson" TEXT NOT NULL,
    "consentId" UUID,
    "sharedFields" TEXT[],
    "status" "ReferralStatus" NOT NULL DEFAULT 'PROPOSED',
    "sentAt" TIMESTAMPTZ(3),
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "returnReason" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "targetCaseId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_shared_file" (
    "referralId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "sharedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_shared_file_pkey" PRIMARY KEY ("referralId","fileObjectId")
);

-- CreateTable
CREATE TABLE "emergency_flag" (
    "id" UUID NOT NULL,
    "caseId" UUID,
    "supportRequestId" UUID,
    "personId" UUID,
    "raisedBy" "CaseEmergencySource" NOT NULL,
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskKind" "CaseRiskKind" NOT NULL,
    "protocolShownId" UUID NOT NULL,
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "emergency_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_file_folio_key" ON "case_file"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "case_file_publicId_key" ON "case_file"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "case_file_supportRequestId_key" ON "case_file"("supportRequestId");

-- CreateIndex
CREATE INDEX "case_file_legalEntityId_status_idx" ON "case_file"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "case_file_domain_status_idx" ON "case_file"("domain", "status");

-- CreateIndex
CREATE INDEX "case_file_priority_status_idx" ON "case_file"("priority", "status");

-- CreateIndex
CREATE INDEX "case_file_territorialUnitId_idx" ON "case_file"("territorialUnitId");

-- CreateIndex
CREATE INDEX "case_file_caseType_idx" ON "case_file"("caseType");

-- CreateIndex
CREATE INDEX "case_file_openedAt_idx" ON "case_file"("openedAt");

-- CreateIndex
CREATE INDEX "case_participant_caseId_removedAt_idx" ON "case_participant"("caseId", "removedAt");

-- CreateIndex
CREATE INDEX "case_participant_personId_idx" ON "case_participant"("personId");

-- CreateIndex
CREATE INDEX "case_assignment_caseId_unassignedAt_idx" ON "case_assignment"("caseId", "unassignedAt");

-- CreateIndex
CREATE INDEX "case_assignment_userId_unassignedAt_idx" ON "case_assignment"("userId", "unassignedAt");

-- CreateIndex
CREATE INDEX "case_event_caseId_occurredAt_idx" ON "case_event"("caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "case_event_kind_idx" ON "case_event"("kind");

-- CreateIndex
CREATE INDEX "case_task_caseId_status_idx" ON "case_task"("caseId", "status");

-- CreateIndex
CREATE INDEX "case_task_assigneeId_status_idx" ON "case_task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "case_task_dueAt_idx" ON "case_task"("dueAt");

-- CreateIndex
CREATE INDEX "case_message_caseId_sentAt_idx" ON "case_message"("caseId", "sentAt");

-- CreateIndex
CREATE INDEX "case_message_audience_idx" ON "case_message"("audience");

-- CreateIndex
CREATE INDEX "case_message_attachment_fileObjectId_idx" ON "case_message_attachment"("fileObjectId");

-- CreateIndex
CREATE INDEX "case_document_caseId_removedAt_idx" ON "case_document"("caseId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_document_caseId_fileObjectId_key" ON "case_document"("caseId", "fileObjectId");

-- CreateIndex
CREATE INDEX "referral_caseId_idx" ON "referral"("caseId");

-- CreateIndex
CREATE INDEX "referral_toLegalEntityId_status_idx" ON "referral"("toLegalEntityId", "status");

-- CreateIndex
CREATE INDEX "referral_status_idx" ON "referral"("status");

-- CreateIndex
CREATE INDEX "referral_shared_file_fileObjectId_idx" ON "referral_shared_file"("fileObjectId");

-- CreateIndex
CREATE INDEX "emergency_flag_caseId_idx" ON "emergency_flag"("caseId");

-- CreateIndex
CREATE INDEX "emergency_flag_supportRequestId_idx" ON "emergency_flag"("supportRequestId");

-- CreateIndex
CREATE INDEX "emergency_flag_acknowledgedAt_idx" ON "emergency_flag"("acknowledgedAt");

-- CreateIndex
CREATE INDEX "emergency_flag_raisedAt_idx" ON "emergency_flag"("raisedAt");

-- CreateIndex
CREATE INDEX "support_request_territorialUnitId_idx" ON "support_request"("territorialUnitId");

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_reopenedFromCaseId_fkey" FOREIGN KEY ("reopenedFromCaseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_file" ADD CONSTRAINT "case_file_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participant" ADD CONSTRAINT "case_participant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participant" ADD CONSTRAINT "case_participant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participant" ADD CONSTRAINT "case_participant_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participant" ADD CONSTRAINT "case_participant_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participant" ADD CONSTRAINT "case_participant_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignment" ADD CONSTRAINT "case_assignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignment" ADD CONSTRAINT "case_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignment" ADD CONSTRAINT "case_assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignment" ADD CONSTRAINT "case_assignment_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignment" ADD CONSTRAINT "case_assignment_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_event" ADD CONSTRAINT "case_event_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_event" ADD CONSTRAINT "case_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_event" ADD CONSTRAINT "case_event_auditEventId_fkey" FOREIGN KEY ("auditEventId") REFERENCES "audit_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_task" ADD CONSTRAINT "case_task_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_task" ADD CONSTRAINT "case_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_task" ADD CONSTRAINT "case_task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_task" ADD CONSTRAINT "case_task_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_task" ADD CONSTRAINT "case_task_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message" ADD CONSTRAINT "case_message_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message" ADD CONSTRAINT "case_message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message" ADD CONSTRAINT "case_message_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message" ADD CONSTRAINT "case_message_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message_attachment" ADD CONSTRAINT "case_message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "case_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_message_attachment" ADD CONSTRAINT "case_message_attachment_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_fromLegalEntityId_fkey" FOREIGN KEY ("fromLegalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_toLegalEntityId_fkey" FOREIGN KEY ("toLegalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_targetCaseId_fkey" FOREIGN KEY ("targetCaseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral" ADD CONSTRAINT "referral_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shared_file" ADD CONSTRAINT "referral_shared_file_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shared_file" ADD CONSTRAINT "referral_shared_file_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_shared_file" ADD CONSTRAINT "referral_shared_file_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "support_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_protocolShownId_fkey" FOREIGN KEY ("protocolShownId") REFERENCES "content_page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_flag" ADD CONSTRAINT "emergency_flag_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_submittedByPersonId_fkey" FOREIGN KEY ("submittedByPersonId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_confirmedRoutingLegalEntityId_fkey" FOREIGN KEY ("confirmedRoutingLegalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Invariantes que el motor sostiene
-- ---------------------------------------------------------------------------

-- 1. Un expediente cerrado dice cómo terminó.
--    Cerrar sin resultado y sin motivo deja un expediente que nadie puede
--    explicar después, y explicar después es justo lo que hace falta cuando
--    alguien reclama.
ALTER TABLE "case_file"
  ADD CONSTRAINT "case_cierre_explicado"
  CHECK (
    "closedAt" IS NULL
    OR ("closeOutcome" IS NOT NULL AND "closeReason" IS NOT NULL AND length(btrim("closeReason")) >= 10)
  );

-- 2. El estado y el cierre no se contradicen.
ALTER TABLE "case_file"
  ADD CONSTRAINT "case_estado_coherente_con_cierre"
  CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- 3. Un participante es una persona del padrón o alguien de fuera con nombre,
--    nunca las dos cosas y nunca ninguna. Una contraparte sin nombre no se
--    puede notificar, y un expediente con participantes anónimos no sirve.
ALTER TABLE "case_participant"
  ADD CONSTRAINT "participante_identificado"
  CHECK (num_nonnulls("personId", "externalName") = 1);

-- 4. Una marca de riesgo cuelga de una solicitud o de un expediente.
--    Una alerta que no está en ningún sitio no la ve nadie.
ALTER TABLE "emergency_flag"
  ADD CONSTRAINT "riesgo_con_expediente_o_solicitud"
  CHECK (num_nonnulls("caseId", "supportRequestId") >= 1);

-- 5. **Ninguna canalización avanza sin consentimiento.**
--    Es el invariante del PRD §10.4 y no vive en una guía de uso: la base
--    rechaza el paso a «enviada», «aceptada», «devuelta» o «cerrada» si no hay
--    consentimiento anotado. Un `PROPOSED` o un `AWAITING_CONSENT` sí pueden
--    existir sin él: son exactamente los dos estados anteriores a pedirlo.
ALTER TABLE "referral"
  ADD CONSTRAINT "canalizacion_exige_consentimiento"
  CHECK (
    "status" IN ('PROPOSED', 'AWAITING_CONSENT', 'REJECTED')
    OR "consentId" IS NOT NULL
  );

-- 6. Una canalización aceptada dice quién la aceptó y cuándo; una devuelta o
--    rechazada dice por qué. Aceptar sin nombre es no responder por ello.
ALTER TABLE "referral"
  ADD CONSTRAINT "canalizacion_aceptada_con_nombre"
  CHECK (
    "status" <> 'ACCEPTED'
    OR ("acceptedById" IS NOT NULL AND "acceptedAt" IS NOT NULL)
  );

ALTER TABLE "referral"
  ADD CONSTRAINT "canalizacion_devuelta_con_motivo"
  CHECK (
    "status" NOT IN ('RETURNED', 'REJECTED')
    OR ("returnReason" IS NOT NULL AND length(btrim("returnReason")) >= 10)
  );

-- 7. Una canalización a una entidad externa nombra al destinatario; una interna
--    no lo lleva. Mezclarlas dejaría expedientes «enviados a nadie».
ALTER TABLE "referral"
  ADD CONSTRAINT "canalizacion_externa_con_destinatario"
  CHECK (
    ("toModule" = 'EXTERNAL' AND "externalRecipient" IS NOT NULL)
    OR ("toModule" <> 'EXTERNAL' AND "externalRecipient" IS NULL)
  );

-- 8. Una tarea terminada dice cuándo y por quién; una bloqueada, por qué.
ALTER TABLE "case_task"
  ADD CONSTRAINT "tarea_terminada_con_constancia"
  CHECK (
    "status" <> 'DONE'
    OR ("completedAt" IS NOT NULL AND "completedById" IS NOT NULL)
  );

ALTER TABLE "case_task"
  ADD CONSTRAINT "tarea_bloqueada_con_motivo"
  CHECK ("status" <> 'BLOCKED' OR "blockerNote" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Privilegios: lo que el rol de la aplicación no puede tocar
-- ---------------------------------------------------------------------------

-- El relato original del expediente es lo que la persona contó. Una valoración
-- posterior se escribe al lado, en `humanAssessment`; reescribir el relato
-- borraría la única versión que no pasó por la organización.
--
-- El folio, el identificador público, el origen, la entidad responsable y el
-- dominio tampoco se editan: cambiar el dominio de un expediente lo movería de
-- compartimento sin que nadie lo autorizara, que es la forma silenciosa de
-- saltarse la separación del PRD §10.3.
REVOKE UPDATE ON TABLE "case_file" FROM fuerza_app;
GRANT UPDATE (
  "caseType", "priority", "territorialUnitId",
  "humanAssessment", "status",
  "firstResponseAt", "dueAt",
  "closedAt", "closeOutcome", "closeReason",
  "reopenCount",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "case_file" TO fuerza_app;

-- La bitácora del expediente no se altera ni se borra. Es el mismo criterio que
-- la bitácora de auditoría: un registro que quien es objeto de él puede editar
-- no prueba nada.
REVOKE UPDATE, DELETE ON TABLE "case_event" FROM fuerza_app;

-- Una comunicación enviada no se reescribe. Solo se admite la corrección previa
-- al primer acuse, que se hace escribiendo `editedAt` y el cuerpo corregido, y
-- se ve que se corrigió. El resto —de quién es, a quién va, cuándo se envió— es
-- inmutable.
REVOKE UPDATE ON TABLE "case_message" FROM fuerza_app;
GRANT UPDATE (
  "body", "editedAt", "readReceipts",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "case_message" TO fuerza_app;

-- Una canalización no cambia de origen, de destino, de motivo ni de lo que
-- explica. Lo que avanza es su estado y lo que se anota al aceptarla o
-- devolverla. Cambiar `sharedFields` después del consentimiento sería
-- transferir lo que nadie consintió.
REVOKE UPDATE ON TABLE "referral" FROM fuerza_app;
GRANT UPDATE (
  "consentId", "sharedFields", "status",
  "sentAt", "acceptedById", "acceptedAt", "returnReason", "closedAt",
  "targetCaseId",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "referral" TO fuerza_app;

-- Un archivo transferido, con el consentimiento que lo ampara, no se reescribe:
-- se agrega o se quita. Cambiar el consentimiento de un archivo ya compartido
-- reescribiría la prueba de qué se autorizó.
REVOKE UPDATE ON TABLE "referral_shared_file" FROM fuerza_app;
