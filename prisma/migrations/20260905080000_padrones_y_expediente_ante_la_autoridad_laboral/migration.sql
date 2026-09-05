-- Padrones separados y expediente ante la autoridad laboral
-- (PRD §7.1, §8.1 paso 14, §9.7; F4-PAD-001 a F4-PAD-004).

-- CreateEnum
CREATE TYPE "LabourFilingKind" AS ENUM ('ROSTER_ADDITION', 'ROSTER_REMOVAL');

-- CreateEnum
CREATE TYPE "LabourFilingStatus" AS ENUM ('PENDING', 'PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'NOT_REQUIRED');


-- CreateTable
CREATE TABLE "labour_authority_filing" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(22) NOT NULL,
    "legalEntityId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "kind" "LabourFilingKind" NOT NULL,
    "status" "LabourFilingStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "preparedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "authorityReference" VARCHAR(120),
    "notes" VARCHAR(1000),
    "evidenceFileId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,

    CONSTRAINT "labour_authority_filing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labour_authority_filing_publicId_key" ON "labour_authority_filing"("publicId");

-- CreateIndex
CREATE INDEX "labour_authority_filing_legalEntityId_status_idx" ON "labour_authority_filing"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "labour_authority_filing_membershipId_idx" ON "labour_authority_filing"("membershipId");

-- CreateIndex
CREATE INDEX "labour_authority_filing_occurredAt_idx" ON "labour_authority_filing"("occurredAt");

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_authority_filing" ADD CONSTRAINT "labour_authority_filing_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 1. Los estados del trámite no se contradicen con sus fechas.
--
--    Un expediente presentado sin fecha de presentación, o acusado sin fecha de
--    acuse, es un expediente que dice haber avanzado sin poder decir cuándo. La
--    pregunta «¿cuándo se informó esta alta?» se hace ante una autoridad, y no
--    admite «consta que sí, pero no sabemos qué día».
-- ---------------------------------------------------------------------------
ALTER TABLE "labour_authority_filing"
  ADD CONSTRAINT "labour_filing_estado_con_su_fecha" CHECK (
    CASE "status"
      WHEN 'PENDING' THEN "preparedAt" IS NULL AND "submittedAt" IS NULL AND "acknowledgedAt" IS NULL
      WHEN 'PREPARED' THEN "preparedAt" IS NOT NULL AND "submittedAt" IS NULL AND "acknowledgedAt" IS NULL
      WHEN 'SUBMITTED' THEN "submittedAt" IS NOT NULL AND "acknowledgedAt" IS NULL
      WHEN 'ACKNOWLEDGED' THEN "submittedAt" IS NOT NULL AND "acknowledgedAt" IS NOT NULL
      ELSE TRUE
    END
  );

-- ---------------------------------------------------------------------------
-- 2. Descartar una obligación exige explicarlo.
--
--    `NOT_REQUIRED` dice que no había que informar este movimiento. Puede ser
--    cierto, y por eso existe; pero sin motivo escrito no hay forma de revisar
--    después si lo era. Una obligación que se cierra sin explicación es la
--    manera silenciosa de no cumplirla.
-- ---------------------------------------------------------------------------
ALTER TABLE "labour_authority_filing"
  ADD CONSTRAINT "labour_filing_descarte_explicado" CHECK (
    "status" <> 'NOT_REQUIRED' OR char_length(btrim("notes")) >= 15
  );

-- ---------------------------------------------------------------------------
-- 3. La autoridad que acusa deja referencia.
--
--    Un acuse sin número de trámite no sirve para acreditar nada ante nadie.
-- ---------------------------------------------------------------------------
ALTER TABLE "labour_authority_filing"
  ADD CONSTRAINT "labour_filing_acuse_con_referencia" CHECK (
    "status" <> 'ACKNOWLEDGED' OR char_length(btrim("authorityReference")) >= 3
  );

-- ---------------------------------------------------------------------------
-- 4. Un movimiento se informa una vez.
--
--    Parcial sobre `(membershipId, kind)`: una membresía tiene un alta y, si
--    llega, una baja. Dos expedientes del mismo movimiento harían que alguien
--    presentara el mismo trámite dos veces, o —peor— que diera por presentado
--    el que no lo estaba porque el otro sí.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "labour_filing_un_expediente_por_movimiento"
  ON "labour_authority_filing" ("membershipId", "kind");

-- ---------------------------------------------------------------------------
-- 5. Privilegios por columna.
--
--    Lo que ocurrió —qué membresía, de quién, qué movimiento y cuándo— no se
--    reescribe: es el hecho que obliga. La aplicación solo escribe el avance
--    del trámite. Y no borra: un expediente de cumplimiento que se puede
--    eliminar no acredita cumplimiento alguno.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "labour_authority_filing" FROM fuerza_app;
GRANT UPDATE (
  "status",
  "preparedAt",
  "submittedAt",
  "acknowledgedAt",
  "authorityReference",
  "notes",
  "evidenceFileId",
  "updatedAt",
  "updatedByActorId"
) ON TABLE "labour_authority_filing" TO fuerza_app;

-- ---------------------------------------------------------------------------
-- 6. Índices reales para los padrones (PRD §7.1, F4-PAD-001).
--
--    El padrón sindical se recorre por entidad, calidad y estado, y se ordena
--    por número de miembro. Sin este índice compuesto, cada consulta del padrón
--    recorre la tabla entera: hoy no se nota y el día de una asamblea, sí.
-- ---------------------------------------------------------------------------
CREATE INDEX "membership_padron_por_categoria" ON "membership" ("legalEntityId", "category", "status");
