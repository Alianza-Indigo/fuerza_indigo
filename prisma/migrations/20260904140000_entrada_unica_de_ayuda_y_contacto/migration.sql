-- Entrada única de ayuda y contacto (PRD §10.1, docs/DATA_MODEL.md §7).
--
-- Una sola tabla para lo que llega por la puerta de la calle. No crea personas
-- del padrón ni expedientes: quien escribe todavía no es nadie en el sistema, y
-- el expediente de caso con su valoración humana y su canalización es de la
-- Fase 6, que ampliará esta misma tabla en lugar de crear otra.
--
-- Tres cosas quedan fijadas aquí y no en el código de la aplicación:
--
--  · El relato original es `TEXT` y ninguna ruta lo actualiza. Es la voz de
--    quien escribió y es lo primero que hace falta cuando un caso se tuerce.
--  · La versión del aviso de privacidad aceptada es una llave foránea
--    obligatoria. Un «acepto» sin decir a qué no prueba nada.
--  · El origen se guarda como huella con clave y nunca como dirección: sirve
--    para limitar envíos y no se puede volver atrás desde ella (PRD §20.4).

-- CreateEnum
CREATE TYPE "SupportRequestType" AS ENUM ('GENERAL_CONTACT', 'INDIVIDUAL_LABOR_DISPUTE', 'COLLECTIVE_DISPUTE', 'DISCRIMINATION_OR_ADJUSTMENTS', 'EDUCATION_ACCESS', 'HEALTH_ACCESS', 'ACCESSIBILITY', 'FAMILY_GUIDANCE', 'CIAN_ATTENTION', 'PSYCHOSOCIAL_RISK', 'VIOLENCE_OR_URGENCY', 'TRAINING_OR_INSTITUTIONAL_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "SupportUrgency" AS ENUM ('ROUTINE', 'PRIORITY', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('RECEIVED', 'TRIAGE', 'CONVERTED_TO_CASE', 'REFERRED_EXTERNALLY', 'HANDLED', 'CLOSED_NO_ACTION', 'DUPLICATE');


-- CreateTable
CREATE TABLE "support_request" (
    "id" UUID NOT NULL,
    "folio" VARCHAR(20) NOT NULL,
    "requestType" "SupportRequestType" NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "personId" UUID,
    "contactName" VARCHAR(120) NOT NULL,
    "contactEmail" VARCHAR(254),
    "contactPhone" VARCHAR(30),
    "preferredChannel" "SupportChannel" NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "narrative" TEXT NOT NULL,
    "territoryHint" VARCHAR(160),
    "urgency" "SupportUrgency" NOT NULL DEFAULT 'ROUTINE',
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "handledByActorId" UUID,
    "handledAt" TIMESTAMPTZ(3),
    "handlingNote" VARCHAR(1000),
    "consentId" UUID,
    "privacyNoticeVersionId" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originFingerprint" VARCHAR(64) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "support_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_request_folio_key" ON "support_request"("folio");

-- CreateIndex
CREATE INDEX "support_request_status_receivedAt_idx" ON "support_request"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "support_request_legalEntityId_status_idx" ON "support_request"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "support_request_requestType_status_idx" ON "support_request"("requestType", "status");

-- CreateIndex
CREATE INDEX "support_request_originFingerprint_receivedAt_idx" ON "support_request"("originFingerprint", "receivedAt");

-- CreateIndex
CREATE INDEX "support_request_personId_idx" ON "support_request"("personId");

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_handledByActorId_fkey" FOREIGN KEY ("handledByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_privacyNoticeVersionId_fkey" FOREIGN KEY ("privacyNoticeVersionId") REFERENCES "consent_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Inmutabilidad del relato original, impuesta por el motor.
--
-- Que ninguna ruta de la aplicación toque el texto es una promesa del código;
-- que no se pueda es un hecho del motor. Se quita `UPDATE` sobre toda la tabla
-- y se devuelve solo sobre las columnas de atención, de modo que cambiar lo que
-- alguien escribió falle con «permiso denegado» aunque un descuido futuro lo
-- intente.
--
-- `DELETE` se conserva a propósito: las políticas de retención tienen que poder
-- purgar, y una entrada que no se puede borrar nunca sería un dato personal
-- guardado para siempre (PRD §20.5).
--
-- La lista de columnas actualizables incluye las que abrirá la Fase 6
-- —`urgency`, `status`, `personId`, `consentId`— porque son campos de proceso y
-- no del relato. Ampliarla entonces sería una migración más; dejar fuera lo que
-- ya está contratado sería una trampa para quien las implemente.
REVOKE UPDATE ON TABLE "support_request" FROM fuerza_app;
GRANT UPDATE (
  "status", "urgency", "personId", "consentId",
  "handledByActorId", "handledAt", "handlingNote",
  "updatedAt", "rowVersion"
) ON TABLE "support_request" TO fuerza_app;
