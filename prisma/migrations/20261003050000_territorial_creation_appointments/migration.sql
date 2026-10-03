ALTER TYPE "DesignationMethod" ADD VALUE 'DIRECT_APPOINTMENT';

CREATE TABLE "territorial_creation_appointment" (
  "id" UUID NOT NULL,
  "publicId" VARCHAR(22) NOT NULL,
  "number" VARCHAR(40) NOT NULL,
  "territorialUnitId" UUID NOT NULL,
  "delegateOfficeTermId" UUID NOT NULL,
  "appointedByOfficeTermId" UUID,
  "appointedOn" DATE NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "agreementText" TEXT NOT NULL,
  "signedFileId" UUID,
  "issuedByActorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "territorial_creation_appointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "territorial_creation_appointment_reason_check" CHECK (char_length(trim("reason")) >= 20),
  CONSTRAINT "territorial_creation_appointment_distinct_terms_check" CHECK (
    "appointedByOfficeTermId" IS NULL OR "appointedByOfficeTermId" <> "delegateOfficeTermId"
  )
);

CREATE UNIQUE INDEX "territorial_creation_appointment_publicId_key"
  ON "territorial_creation_appointment"("publicId");
CREATE UNIQUE INDEX "territorial_creation_appointment_number_key"
  ON "territorial_creation_appointment"("number");
CREATE UNIQUE INDEX "territorial_creation_appointment_territorialUnitId_key"
  ON "territorial_creation_appointment"("territorialUnitId");
CREATE UNIQUE INDEX "territorial_creation_appointment_delegateOfficeTermId_key"
  ON "territorial_creation_appointment"("delegateOfficeTermId");
CREATE UNIQUE INDEX "territorial_creation_appointment_signedFileId_key"
  ON "territorial_creation_appointment"("signedFileId");
CREATE INDEX "territorial_creation_appointment_appointedByOfficeTermId_idx"
  ON "territorial_creation_appointment"("appointedByOfficeTermId");
CREATE INDEX "territorial_creation_appointment_issuedByActorId_idx"
  ON "territorial_creation_appointment"("issuedByActorId");

ALTER TABLE "territorial_creation_appointment"
  ADD CONSTRAINT "territorial_creation_appointment_territorialUnitId_fkey"
  FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territorial_creation_appointment"
  ADD CONSTRAINT "territorial_creation_appointment_delegateOfficeTermId_fkey"
  FOREIGN KEY ("delegateOfficeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territorial_creation_appointment"
  ADD CONSTRAINT "territorial_creation_appointment_appointedByOfficeTermId_fkey"
  FOREIGN KEY ("appointedByOfficeTermId") REFERENCES "office_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territorial_creation_appointment"
  ADD CONSTRAINT "territorial_creation_appointment_signedFileId_fkey"
  FOREIGN KEY ("signedFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "territorial_creation_appointment"
  ADD CONSTRAINT "territorial_creation_appointment_issuedByActorId_fkey"
  FOREIGN KEY ("issuedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El acto expedido no se reescribe. La única mutación posterior permitida es
-- incorporar la copia firmada al mismo expediente.
GRANT SELECT, INSERT ON TABLE "territorial_creation_appointment" TO fuerza_app;
GRANT UPDATE ("signedFileId") ON TABLE "territorial_creation_appointment" TO fuerza_app;
