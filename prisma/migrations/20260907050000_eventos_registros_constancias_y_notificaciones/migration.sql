-- Eventos, registros, constancias y preferencias de notificación (PRD §16.3, §24 Fase 9).
--
-- El modelo de datos contrata `Event` y `EventRegistration` desde la Fase 0 y
-- nadie los había construido. Aquí nacen, con dos garantías que viven en el
-- dato y no en una pantalla: una constancia no se revoca si nunca se emitió, y
-- un evento que dice emitir constancias tiene que nombrar su plantilla. Y del
-- lado de las notificaciones, la garantía que gobierna la fase: **un aviso
-- obligatorio no es una preferencia y no se puede suprimir**.

CREATE TYPE "EventKind" AS ENUM ('ASSEMBLY_PUBLIC', 'COURSE', 'WORKSHOP', 'DIPLOMA', 'MEETING', 'CAMPAIGN');
CREATE TYPE "EventModality" AS ENUM ('IN_PERSON', 'REMOTE', 'HYBRID');
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'INVITATION');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EventRegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

/* ---------------------------------------------------------------- */
/* Eventos                                                           */
/* ---------------------------------------------------------------- */

CREATE TABLE "event" (
  "id"                  UUID NOT NULL,
  "publicId"            VARCHAR(30) NOT NULL,
  "slug"                VARCHAR(140) NOT NULL,
  "title"               VARCHAR(200) NOT NULL,
  "kind"                "EventKind" NOT NULL,
  "legalEntityId"       UUID NOT NULL,
  "territorialUnitId"   UUID,
  "startsAt"            TIMESTAMPTZ(3) NOT NULL,
  "endsAt"              TIMESTAMPTZ(3) NOT NULL,
  "modality"            "EventModality" NOT NULL,
  "venue"               VARCHAR(300),
  "capacity"            INTEGER,
  "eligibilityRules"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "catalogProductId"    UUID,
  "visibility"          "EventVisibility" NOT NULL DEFAULT 'MEMBERS',
  "issuesConstancy"     BOOLEAN NOT NULL DEFAULT false,
  "constancyTemplateId" UUID,
  "status"              "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"    UUID NOT NULL,
  "updatedByActorId"    UUID NOT NULL,
  "rowVersion"          INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_publicId_key" ON "event" ("publicId");
CREATE UNIQUE INDEX "event_slug_key" ON "event" ("slug");
CREATE INDEX "event_legalEntityId_idx" ON "event" ("legalEntityId");
CREATE INDEX "event_territorialUnitId_idx" ON "event" ("territorialUnitId");
CREATE INDEX "event_kind_idx" ON "event" ("kind");
CREATE INDEX "event_startsAt_idx" ON "event" ("startsAt");
CREATE INDEX "event_status_idx" ON "event" ("status");

-- Un aforo de cero no es un aforo, es un evento cerrado: nulo o positivo.
ALTER TABLE "event"
  ADD CONSTRAINT "event_aforo_positivo"
  CHECK ("capacity" IS NULL OR "capacity" > 0);

-- Un evento que dice emitir constancia tiene que nombrar la plantilla con la
-- que la emite. «Emite constancia» sin plantilla no se puede cumplir.
ALTER TABLE "event"
  ADD CONSTRAINT "event_constancia_con_plantilla"
  CHECK ("issuesConstancy" = false OR "constancyTemplateId" IS NOT NULL);

-- Un evento empieza antes de que termina.
ALTER TABLE "event"
  ADD CONSTRAINT "event_fechas_coherentes"
  CHECK ("endsAt" >= "startsAt");

/* ---------------------------------------------------------------- */
/* Inscripciones                                                     */
/* ---------------------------------------------------------------- */

CREATE TABLE "event_registration" (
  "id"                  UUID NOT NULL,
  "eventId"             UUID NOT NULL,
  "personId"            UUID NOT NULL,
  "registeredAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"              "EventRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
  "paymentId"           UUID,
  "attendanceAt"        TIMESTAMPTZ(3),
  "evaluationScore"     INTEGER,
  "constancyDocumentId" UUID,
  "constancyRevokedAt"  TIMESTAMPTZ(3),
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"    UUID NOT NULL,
  "rowVersion"          INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_registration_eventId_personId_key" ON "event_registration" ("eventId", "personId");
CREATE INDEX "event_registration_personId_idx" ON "event_registration" ("personId");
CREATE INDEX "event_registration_status_idx" ON "event_registration" ("status");

-- No se revoca una constancia que nunca se emitió: si hay fecha de revocación,
-- tiene que haber documento revocado. «Revocada» sin haber existido no dice nada.
ALTER TABLE "event_registration"
  ADD CONSTRAINT "registro_revocacion_con_constancia"
  CHECK ("constancyRevokedAt" IS NULL OR "constancyDocumentId" IS NOT NULL);

-- Una evaluación, si la hay, va de 0 a 100.
ALTER TABLE "event_registration"
  ADD CONSTRAINT "registro_evaluacion_en_rango"
  CHECK ("evaluationScore" IS NULL OR ("evaluationScore" >= 0 AND "evaluationScore" <= 100));

/* ---------------------------------------------------------------- */
/* Materiales                                                        */
/* ---------------------------------------------------------------- */

CREATE TABLE "event_material" (
  "id"               UUID NOT NULL,
  "eventId"          UUID NOT NULL,
  "title"            VARCHAR(200) NOT NULL,
  "fileObjectId"     UUID NOT NULL,
  "ordinal"          INTEGER NOT NULL DEFAULT 0,
  "membersOnly"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByActorId" UUID NOT NULL,
  CONSTRAINT "event_material_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_material_eventId_ordinal_key" ON "event_material" ("eventId", "ordinal");
CREATE INDEX "event_material_eventId_idx" ON "event_material" ("eventId");

/* ---------------------------------------------------------------- */
/* Preferencias de notificación                                      */
/* ---------------------------------------------------------------- */

CREATE TABLE "notification_preference" (
  "id"               UUID NOT NULL,
  "personId"         UUID NOT NULL,
  "category"         "NotificationCategory" NOT NULL,
  "channel"          "NotificationChannel" NOT NULL,
  "suppressed"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId" UUID NOT NULL,
  "rowVersion"       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preference_personId_category_channel_key" ON "notification_preference" ("personId", "category", "channel");
CREATE INDEX "notification_preference_personId_idx" ON "notification_preference" ("personId");

-- La garantía que gobierna la fase, en el dato: un aviso obligatorio de gobierno
-- no es una preferencia y no se puede suprimir. Una fila de preferencia sobre
-- `GOVERNANCE_MANDATORY` no puede quedar suprimida.
ALTER TABLE "notification_preference"
  ADD CONSTRAINT "preferencia_obligatoria_no_se_suprime"
  CHECK ("category" <> 'GOVERNANCE_MANDATORY' OR "suppressed" = false);

/* ---------------------------------------------------------------- */
/* Plantillas: quién publicó                                         */
/* ---------------------------------------------------------------- */

ALTER TABLE "notification_template" ADD COLUMN "publishedById" UUID;

/* ---------------------------------------------------------------- */
/* Claves foráneas                                                   */
/* ---------------------------------------------------------------- */

ALTER TABLE "event"
  ADD CONSTRAINT "event_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "catalog_product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_constancyTemplateId_fkey" FOREIGN KEY ("constancyTemplateId") REFERENCES "document_template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_registration"
  ADD CONSTRAINT "event_registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "event_registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_registration_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_registration_constancyDocumentId_fkey" FOREIGN KEY ("constancyDocumentId") REFERENCES "generated_document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_registration_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_material"
  ADD CONSTRAINT "event_material_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "event_material_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "event_material_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_preference"
  ADD CONSTRAINT "notification_preference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "notification_preference_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_template"
  ADD CONSTRAINT "notification_template_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/* ---------------------------------------------------------------- */
/* Privilegios: qué puede escribir la aplicación                     */
/* ---------------------------------------------------------------- */

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "event", "event_registration", "event_material", "notification_preference"
TO fuerza_app;

-- El identificador público y el slug de un evento identifican para siempre: un
-- enlace compartido no puede cambiar de destino. Lo demás del evento se edita.
REVOKE UPDATE ON TABLE "event" FROM fuerza_app;
GRANT UPDATE (
  "title", "kind", "legalEntityId", "territorialUnitId", "startsAt", "endsAt",
  "modality", "venue", "capacity", "eligibilityRules", "catalogProductId",
  "visibility", "issuesConstancy", "constancyTemplateId", "status",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "event" TO fuerza_app;

-- Una inscripción no cambia de evento ni de persona: eso es otra inscripción.
REVOKE UPDATE ON TABLE "event_registration" FROM fuerza_app;
GRANT UPDATE (
  "status", "paymentId", "attendanceAt", "evaluationScore",
  "constancyDocumentId", "constancyRevokedAt",
  "updatedAt", "rowVersion"
) ON TABLE "event_registration" TO fuerza_app;
