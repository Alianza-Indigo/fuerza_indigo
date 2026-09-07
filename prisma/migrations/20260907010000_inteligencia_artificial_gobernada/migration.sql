-- Inteligencia artificial gobernada (PRD §15, Fase 8).
--
-- Ocho entidades y una tabla de relación. Todas existen para una sola frase del
-- PRD §15.4: la IA no decide. Un modelo que redacta un borrador y una persona
-- que lo firma son dos cosas distintas, y la diferencia tiene que verse en el
-- dato.

-- La extensión de vectores. La imagen oficial de PostgreSQL no la trae; la
-- integración continua usa una que sí, y en desarrollo se instala el paquete
-- del sistema. Sin ella, la base documental del PRD §15.2 no se puede
-- construir: la búsqueda semántica necesita vecinos más próximos de verdad, no
-- una lista ordenada por parecido de palabras.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "AiProvider" AS ENUM ('GEMINI');
CREATE TYPE "AiCriticality" AS ENUM ('STANDARD', 'CRITICAL');
CREATE TYPE "AiPromptStatus" AS ENUM ('DRAFT', 'TESTING', 'PUBLISHED', 'RETIRED');
CREATE TYPE "AiPurpose" AS ENUM (
  'INITIAL_GUIDANCE', 'PROCEDURE_EXPLANATION', 'REQUEST_CLASSIFICATION', 'SUMMARY',
  'DRAFTING_ASSISTANCE', 'STRUCTURED_EXTRACTION', 'DELEGATE_REPORT', 'SEMANTIC_SEARCH', 'TRANSLATION'
);
CREATE TYPE "AiGenerationStatus" AS ENUM ('SUCCEEDED', 'SCHEMA_REJECTED', 'BLOCKED_BY_POLICY', 'PROVIDER_ERROR', 'TIMEOUT');
CREATE TYPE "AiReviewDecision" AS ENUM ('ACCEPTED', 'EDITED', 'REJECTED');
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('STATUTE', 'POLICY', 'PUBLIC_CONTENT', 'PROCEDURE_GUIDE');
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('PENDING', 'INDEXED', 'STALE', 'DISABLED');

/* ---------------------------------------------------------------- */
/* Configuración del proveedor                                       */
/* ---------------------------------------------------------------- */

CREATE TABLE "ai_provider_configuration" (
  "id"                       UUID NOT NULL,
  "provider"                 "AiProvider" NOT NULL,
  "defaultModel"             VARCHAR(80) NOT NULL,
  "allowedModels"            VARCHAR(80)[] NOT NULL,
  "maxTokensPerRequest"      INTEGER NOT NULL,
  "maxRequestsPerUserPerDay" INTEGER NOT NULL,
  "maxMonthlyCostMinor"      BIGINT NOT NULL,
  "currency"                 CHAR(3) NOT NULL,
  "apiKeyEnvVarName"         VARCHAR(80) NOT NULL,
  "trainingOptOut"           BOOLEAN NOT NULL DEFAULT true,
  "isEnabled"                BOOLEAN NOT NULL DEFAULT false,
  "degradedModeMessageId"    UUID,
  "createdAt"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"         UUID NOT NULL,
  "updatedByActorId"         UUID NOT NULL,
  "rowVersion"               INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_provider_configuration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_provider_configuration_provider_key" ON "ai_provider_configuration" ("provider");

-- El secreto vive en el entorno y aquí solo su nombre. Se comprueba en la base
-- porque es la clase de regla que alguien relaja «temporalmente» para depurar:
-- un valor que parezca una clave no entra.
ALTER TABLE "ai_provider_configuration"
  ADD CONSTRAINT "ai_provider_solo_el_nombre_de_la_variable"
  CHECK ("apiKeyEnvVarName" ~ '^[A-Z][A-Z0-9_]{2,79}$');

-- Un límite de cero o negativo no es un límite: es una configuración que apaga
-- la comprobación sin apagar la IA, que es la peor de las dos.
ALTER TABLE "ai_provider_configuration"
  ADD CONSTRAINT "ai_provider_limites_positivos"
  CHECK ("maxTokensPerRequest" > 0 AND "maxRequestsPerUserPerDay" > 0 AND "maxMonthlyCostMinor" > 0);

-- El modelo por omisión tiene que estar entre los permitidos. Sin esto, apagar
-- un modelo de la lista dejaría el sistema llamando igual al que se retiró.
ALTER TABLE "ai_provider_configuration"
  ADD CONSTRAINT "ai_provider_modelo_por_omision_permitido"
  CHECK ("defaultModel" = ANY ("allowedModels"));

/* ---------------------------------------------------------------- */
/* Prompts administrables                                            */
/* ---------------------------------------------------------------- */

CREATE TABLE "ai_prompt" (
  "id"               UUID NOT NULL,
  "code"             VARCHAR(80) NOT NULL,
  "purpose"          VARCHAR(300) NOT NULL,
  "module"           VARCHAR(40) NOT NULL,
  "criticality"      "AiCriticality" NOT NULL DEFAULT 'STANDARD',
  "currentVersionId" UUID,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId" UUID NOT NULL,
  "updatedByActorId" UUID NOT NULL,
  "rowVersion"       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_prompt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_prompt_code_key" ON "ai_prompt" ("code");
CREATE UNIQUE INDEX "ai_prompt_currentVersionId_key" ON "ai_prompt" ("currentVersionId");
CREATE INDEX "ai_prompt_module_idx" ON "ai_prompt" ("module");
CREATE INDEX "ai_prompt_isActive_idx" ON "ai_prompt" ("isActive");

CREATE TABLE "ai_prompt_version" (
  "id"                    UUID NOT NULL,
  "promptId"              UUID NOT NULL,
  "version"               INTEGER NOT NULL,
  "systemText"            TEXT NOT NULL,
  "allowedVariables"      VARCHAR(60)[] NOT NULL,
  "model"                 VARCHAR(80) NOT NULL,
  "parameters"            JSONB NOT NULL,
  "outputSchema"          JSONB NOT NULL,
  "limits"                JSONB NOT NULL,
  "status"                "AiPromptStatus" NOT NULL DEFAULT 'DRAFT',
  "authorId"              UUID NOT NULL,
  "reviewerId"            UUID,
  "reviewedAt"            TIMESTAMPTZ(3),
  "publishedAt"           TIMESTAMPTZ(3),
  "retiredAt"             TIMESTAMPTZ(3),
  "revertedFromVersionId" UUID,
  "createdAt"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"      UUID NOT NULL,
  "updatedByActorId"      UUID NOT NULL,
  "rowVersion"            INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_prompt_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_prompt_version_promptId_version_key" ON "ai_prompt_version" ("promptId", "version");
CREATE INDEX "ai_prompt_version_status_idx" ON "ai_prompt_version" ("status");

-- Publicada exige fecha de publicación, y retirada exige fecha de retiro. Sin
-- esto, «publicado» sería un adjetivo de la interfaz en vez de un hecho con su
-- instante, y no se podría responder desde cuándo se está usando un texto.
ALTER TABLE "ai_prompt_version"
  ADD CONSTRAINT "ai_prompt_version_fechas_coherentes_con_el_estado"
  CHECK (
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "retiredAt" IS NULL)
    OR ("status" = 'RETIRED' AND "retiredAt" IS NOT NULL)
    OR ("status" IN ('DRAFT', 'TESTING') AND "publishedAt" IS NULL AND "retiredAt" IS NULL)
  );

-- Quien revisa no es quien escribe. Es la misma regla que gobierna la revisión
-- editorial y la de una solicitud de afiliación: aprobarse a sí mismo no es
-- revisión, es un trámite.
ALTER TABLE "ai_prompt_version"
  ADD CONSTRAINT "ai_prompt_version_revisor_distinto_del_autor"
  CHECK ("reviewerId" IS NULL OR "reviewerId" <> "authorId");

-- Y si hay revisor, hay fecha de revisión.
ALTER TABLE "ai_prompt_version"
  ADD CONSTRAINT "ai_prompt_version_revision_completa"
  CHECK (("reviewerId" IS NULL) = ("reviewedAt" IS NULL));

CREATE TABLE "ai_prompt_version_source" (
  "promptVersionId"   UUID NOT NULL,
  "knowledgeSourceId" UUID NOT NULL,
  CONSTRAINT "ai_prompt_version_source_pkey" PRIMARY KEY ("promptVersionId", "knowledgeSourceId")
);

/* ---------------------------------------------------------------- */
/* Conversaciones, ejecuciones y revisión humana                     */
/* ---------------------------------------------------------------- */

CREATE TABLE "ai_conversation" (
  "id"                UUID NOT NULL,
  "personId"          UUID,
  "module"            VARCHAR(40) NOT NULL,
  "purpose"           "AiPurpose" NOT NULL,
  "legalEntityId"     UUID,
  "consentId"         UUID,
  "startedAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"           TIMESTAMPTZ(3),
  "messageCount"      INTEGER NOT NULL DEFAULT 0,
  "retentionPolicyId" UUID,
  "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"  UUID NOT NULL,
  "updatedByActorId"  UUID NOT NULL,
  "rowVersion"        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_conversation_personId_idx" ON "ai_conversation" ("personId");
CREATE INDEX "ai_conversation_module_idx" ON "ai_conversation" ("module");

-- Una conversación sobre una persona identificada exige consentimiento con
-- propósito de asistencia. La orientación anónima no lo necesita porque no
-- trata datos de nadie, y por eso la regla es condicional y no absoluta: hacerla
-- absoluta obligaría a pedir consentimiento para preguntar qué es un sindicato.
ALTER TABLE "ai_conversation"
  ADD CONSTRAINT "ai_conversation_persona_identificada_con_consentimiento"
  CHECK ("personId" IS NULL OR "consentId" IS NOT NULL);

CREATE TABLE "ai_generation" (
  "id"                 UUID NOT NULL,
  "conversationId"     UUID,
  "promptVersionId"    UUID NOT NULL,
  "model"              VARCHAR(80) NOT NULL,
  "requestedById"      UUID,
  "purpose"            "AiPurpose" NOT NULL,
  "inputDigest"        CHAR(64) NOT NULL,
  "redactionApplied"   BOOLEAN NOT NULL,
  "outputSummary"      TEXT NOT NULL,
  "outputSchemaValid"  BOOLEAN NOT NULL,
  "promptTokens"       INTEGER NOT NULL,
  "completionTokens"   INTEGER NOT NULL,
  "costMinor"          BIGINT NOT NULL,
  "currency"           CHAR(3) NOT NULL,
  "latencyMs"          INTEGER NOT NULL,
  "status"             "AiGenerationStatus" NOT NULL,
  "injectionSuspected" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByActorId"   UUID NOT NULL,
  CONSTRAINT "ai_generation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_generation_conversationId_idx" ON "ai_generation" ("conversationId");
CREATE INDEX "ai_generation_promptVersionId_idx" ON "ai_generation" ("promptVersionId");
CREATE INDEX "ai_generation_status_idx" ON "ai_generation" ("status");
CREATE INDEX "ai_generation_occurredAt_idx" ON "ai_generation" ("occurredAt");

-- La huella es una huella, no el contenido. Sesenta y cuatro caracteres
-- hexadecimales y nada más: si alguien guardara aquí el texto enviado, esta
-- comprobación lo detendría.
ALTER TABLE "ai_generation"
  ADD CONSTRAINT "ai_generation_huella_no_es_contenido"
  CHECK ("inputDigest" ~ '^[0-9a-f]{64}$');

-- Nada sale gratis ni al revés: los contadores no pueden ser negativos.
ALTER TABLE "ai_generation"
  ADD CONSTRAINT "ai_generation_contadores_no_negativos"
  CHECK ("promptTokens" >= 0 AND "completionTokens" >= 0 AND "costMinor" >= 0 AND "latencyMs" >= 0);

CREATE TABLE "ai_review" (
  "id"               UUID NOT NULL,
  "generationId"     UUID NOT NULL,
  "reviewerId"       UUID NOT NULL,
  "decision"         "AiReviewDecision" NOT NULL,
  "editedOutput"     TEXT,
  "comment"          VARCHAR(1000),
  "reviewedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByActorId" UUID NOT NULL,
  CONSTRAINT "ai_review_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_review_generationId_idx" ON "ai_review" ("generationId");

-- Decir «editada» sin el texto corregido no dice nada: la corrección es el
-- contenido de esa decisión. Y una aceptación no lleva texto corregido, porque
-- entonces no fue una aceptación.
ALTER TABLE "ai_review"
  ADD CONSTRAINT "ai_review_edicion_con_su_texto"
  CHECK (
    ("decision" = 'EDITED' AND "editedOutput" IS NOT NULL)
    OR ("decision" <> 'EDITED' AND "editedOutput" IS NULL)
  );

-- Un rechazo se explica. Es lo que permite mejorar el prompt en vez de repetir
-- el mismo resultado la semana siguiente.
ALTER TABLE "ai_review"
  ADD CONSTRAINT "ai_review_rechazo_con_motivo"
  CHECK ("decision" <> 'REJECTED' OR ("comment" IS NOT NULL AND length(btrim("comment")) >= 10));

/* ---------------------------------------------------------------- */
/* Base documental                                                   */
/* ---------------------------------------------------------------- */

CREATE TABLE "knowledge_source" (
  "id"                     UUID NOT NULL,
  "code"                   VARCHAR(80) NOT NULL,
  "name"                   VARCHAR(200) NOT NULL,
  "sourceKind"             "KnowledgeSourceKind" NOT NULL,
  "legalEntityId"          UUID,
  "fileObjectId"           UUID,
  "contentPageId"          UUID,
  "requiredPermissionCode" VARCHAR(80),
  "indexedAt"              TIMESTAMPTZ(3),
  "chunkCount"             INTEGER NOT NULL DEFAULT 0,
  "contentHash"            CHAR(64) NOT NULL,
  "status"                 "KnowledgeSourceStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"       UUID NOT NULL,
  "updatedByActorId"       UUID NOT NULL,
  "rowVersion"             INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "knowledge_source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_source_code_key" ON "knowledge_source" ("code");
CREATE INDEX "knowledge_source_status_idx" ON "knowledge_source" ("status");
CREATE INDEX "knowledge_source_requiredPermissionCode_idx" ON "knowledge_source" ("requiredPermissionCode");

-- Una fuente apunta a un archivo o a una página, no a los dos ni a ninguno.
-- Sin origen no hay nada que indexar, y con dos no se sabe cuál manda cuando
-- cambian.
ALTER TABLE "knowledge_source"
  ADD CONSTRAINT "knowledge_source_un_solo_origen"
  CHECK (num_nonnulls("fileObjectId", "contentPageId") = 1);

-- Indexada exige fecha de indexación. «Indexada» sin instante no permite saber
-- si lo que el modelo lee es de antes o de después del último cambio.
ALTER TABLE "knowledge_source"
  ADD CONSTRAINT "knowledge_source_indexacion_coherente"
  CHECK ("status" <> 'INDEXED' OR "indexedAt" IS NOT NULL);

CREATE TABLE "knowledge_chunk" (
  "id"                     UUID NOT NULL,
  "knowledgeSourceId"      UUID NOT NULL,
  "ordinal"                INTEGER NOT NULL,
  "text"                   TEXT NOT NULL,
  "tokenCount"             INTEGER NOT NULL,
  "sectionPath"            VARCHAR(300),
  "requiredPermissionCode" VARCHAR(80),
  "indexedAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByActorId"       UUID NOT NULL,
  CONSTRAINT "knowledge_chunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "knowledge_chunk_knowledgeSourceId_ordinal_key" ON "knowledge_chunk" ("knowledgeSourceId", "ordinal");
CREATE INDEX "knowledge_chunk_requiredPermissionCode_idx" ON "knowledge_chunk" ("requiredPermissionCode");

-- El vector y el índice léxico. Prisma no expresa ninguno de los dos tipos, así
-- que se añaden aquí y la entidad los ignora: lo que Prisma no ve, la consulta
-- de recuperación lo usa en SQL.
--
-- 768 dimensiones porque es lo que produce el modelo de incrustaciones que el
-- PRD contrata. Cambiarlo obliga a reindexar todo, y por eso está escrito en el
-- esquema y no como parámetro: una dimensión que se puede configurar es una que
-- alguien cambia sin reindexar, y entonces la búsqueda deja de encontrar sin
-- que nada falle.
ALTER TABLE "knowledge_chunk" ADD COLUMN "embedding" vector(768);
ALTER TABLE "knowledge_chunk" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('spanish', "text")) STORED;

-- HNSW con distancia coseno, que es la que corresponde a incrustaciones
-- normalizadas. El índice es parcial: un fragmento sin vector todavía no está
-- indexado y no debe ocupar sitio en la estructura.
CREATE INDEX "knowledge_chunk_embedding_hnsw" ON "knowledge_chunk"
  USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;

CREATE INDEX "knowledge_chunk_search_gin" ON "knowledge_chunk" USING gin ("searchVector");

-- Un fragmento sin texto no es un fragmento.
ALTER TABLE "knowledge_chunk"
  ADD CONSTRAINT "knowledge_chunk_con_contenido"
  CHECK (length(btrim("text")) > 0 AND "tokenCount" > 0 AND "ordinal" >= 0);

/* ---------------------------------------------------------------- */
/* Columna que esperaba desde la Fase 0                              */
/* ---------------------------------------------------------------- */

-- `SupportRequest.suggestedByAiGenerationId` está contratada desde el modelo de
-- datos de la Fase 0 y no tenía a qué apuntar hasta ahora. Nula cuando la
-- propuesta la calculó la regla de enrutamiento, que es lo que ocurre desde la
-- Fase 6: apuntar a una generación es lo que distingue «lo propuso una regla»
-- de «lo propuso un modelo», y eso cambia cuánto hay que revisarla.
ALTER TABLE "support_request" ADD COLUMN "suggestedByAiGenerationId" UUID;

/* ---------------------------------------------------------------- */
/* Claves foráneas                                                   */
/* ---------------------------------------------------------------- */

ALTER TABLE "ai_provider_configuration"
  ADD CONSTRAINT "ai_provider_configuration_degradedModeMessageId_fkey" FOREIGN KEY ("degradedModeMessageId") REFERENCES "content_page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_provider_configuration_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_provider_configuration_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_prompt"
  ADD CONSTRAINT "ai_prompt_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ai_prompt_version" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_prompt_version"
  ADD CONSTRAINT "ai_prompt_version_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "ai_prompt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_revertedFromVersionId_fkey" FOREIGN KEY ("revertedFromVersionId") REFERENCES "ai_prompt_version" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_prompt_version_source"
  ADD CONSTRAINT "ai_prompt_version_source_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "ai_prompt_version" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_prompt_version_source_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "knowledge_source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_conversation"
  ADD CONSTRAINT "ai_conversation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_conversation_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_conversation_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_conversation_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "retention_policy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_conversation_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_conversation_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_generation"
  ADD CONSTRAINT "ai_generation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_generation_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "ai_prompt_version" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_generation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_generation_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_review"
  ADD CONSTRAINT "ai_review_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ai_generation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user_account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_review_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_source"
  ADD CONSTRAINT "knowledge_source_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_source_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "file_object" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_source_contentPageId_fkey" FOREIGN KEY ("contentPageId") REFERENCES "content_page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_source_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_source_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "knowledge_chunk"
  ADD CONSTRAINT "knowledge_chunk_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "knowledge_source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_chunk_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_request"
  ADD CONSTRAINT "support_request_suggestedByAiGenerationId_fkey" FOREIGN KEY ("suggestedByAiGenerationId") REFERENCES "ai_generation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/* ---------------------------------------------------------------- */
/* Privilegios: qué puede reescribir la aplicación                   */
/* ---------------------------------------------------------------- */

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "ai_provider_configuration", "ai_prompt", "ai_prompt_version", "ai_prompt_version_source",
  "ai_conversation", "ai_generation", "ai_review", "knowledge_source", "knowledge_chunk"
TO fuerza_app;

-- Una ejecución del modelo no se reescribe ni se borra. Es el registro de qué
-- se le pidió a un proveedor externo sobre asuntos de gente real, con qué
-- costo; un registro que quien lo produce puede editar no prueba nada.
REVOKE UPDATE, DELETE ON TABLE "ai_generation" FROM fuerza_app;

-- Una revisión tampoco: decir después «yo lo rechacé» sobre algo que se aceptó
-- es exactamente lo que este registro existe para impedir.
REVOKE UPDATE, DELETE ON TABLE "ai_review" FROM fuerza_app;

-- Una versión de prompt publicada es inmutable en lo que dice. Lo que cambia
-- es su estado y su revisión; corregir el texto es una versión nueva, que deja
-- la anterior a la vista.
REVOKE UPDATE ON TABLE "ai_prompt_version" FROM fuerza_app;
GRANT UPDATE (
  "status", "reviewerId", "reviewedAt", "publishedAt", "retiredAt",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "ai_prompt_version" TO fuerza_app;

-- El código de un prompt y el de una fuente identifican para siempre. Y el
-- nombre de la variable de entorno de la clave no se cambia desde la
-- aplicación: apuntar a otra variable es una decisión de despliegue.
REVOKE UPDATE ON TABLE "ai_prompt" FROM fuerza_app;
GRANT UPDATE (
  "purpose", "module", "criticality", "currentVersionId", "isActive",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "ai_prompt" TO fuerza_app;

REVOKE UPDATE ON TABLE "ai_provider_configuration" FROM fuerza_app;
GRANT UPDATE (
  "defaultModel", "allowedModels",
  "maxTokensPerRequest", "maxRequestsPerUserPerDay", "maxMonthlyCostMinor", "currency",
  "trainingOptOut", "isEnabled", "degradedModeMessageId",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "ai_provider_configuration" TO fuerza_app;

REVOKE UPDATE ON TABLE "knowledge_source" FROM fuerza_app;
GRANT UPDATE (
  "name", "sourceKind", "legalEntityId", "requiredPermissionCode",
  "indexedAt", "chunkCount", "contentHash", "status",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "knowledge_source" TO fuerza_app;

-- Un fragmento no se edita: se reindexa. Reescribir el texto de un fragmento
-- dejaría el vector apuntando a algo que ya no dice eso, y la búsqueda
-- devolvería lo que ya no está escrito.
REVOKE UPDATE ON TABLE "knowledge_chunk" FROM fuerza_app;

-- Una conversación no cambia de persona ni de consentimiento. Reatribuirla
-- después convertiría en identificada una orientación que se dio anónima, y
-- ampararía bajo un consentimiento un texto producido sin él. Cuando alguien
-- se identifica a mitad de camino, empieza una conversación nueva.
REVOKE UPDATE ON TABLE "ai_conversation" FROM fuerza_app;
GRANT UPDATE (
  "endedAt", "messageCount", "retentionPolicyId",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "ai_conversation" TO fuerza_app;

-- Un vínculo entre una versión de prompt y una fuente no se edita: sus dos
-- columnas son la clave. Se crea o se quita.
REVOKE UPDATE ON TABLE "ai_prompt_version_source" FROM fuerza_app;
