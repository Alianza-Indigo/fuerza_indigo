-- Catálogo de plataformas y herramientas del ecosistema (PRD §12, Fase 7).
--
-- Una tabla y dos tipos. Nada más, y eso es el punto: CIAN, CENI, NeuroPlan,
-- ADIA y NEXO viven fuera de este repositorio, y lo único que se guarda aquí es
-- su ficha y su dirección. No hay derechos de acceso, ni planes, ni
-- lanzamientos, ni vínculos de identidad, ni registro de quién entró. Cada una
-- de esas tablas obligaría a este repositorio a saber algo de una plataforma
-- que no opera, y a mantenerlo sincronizado con ella para siempre.
--
-- La corrección de alcance del 5 de septiembre ya retiró `ToolDefinition`,
-- `ToolPlan`, `ToolEntitlement`, `ToolLaunch` y `ExternalIdentityLink`
-- precisamente por eso. Esta migración crea lo que quedó en su lugar.

CREATE TYPE "EcosystemLinkStatus" AS ENUM ('ACTIVE', 'HIDDEN');
CREATE TYPE "EcosystemAccent" AS ENUM ('SINDICATO', 'ALIANZA', 'CIAN', 'CENI', 'HERRAMIENTAS');

CREATE TABLE "ecosystem_link" (
  "id"                UUID NOT NULL,
  "code"              VARCHAR(40) NOT NULL,
  "name"              VARCHAR(80) NOT NULL,
  "summary"           VARCHAR(400) NOT NULL,
  "audienceText"      VARCHAR(300) NOT NULL,
  "logoFileId"        UUID,
  "accentToken"       "EcosystemAccent",
  "externalUrl"       VARCHAR(400),
  "legalEntityId"     UUID,
  "operationalStatus" "EcosystemLinkStatus" NOT NULL DEFAULT 'HIDDEN',
  "sortOrder"         INTEGER NOT NULL DEFAULT 0,
  "publishedAt"       TIMESTAMPTZ(3),
  "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMPTZ(3) NOT NULL,
  "createdByActorId"  UUID NOT NULL,
  "updatedByActorId"  UUID NOT NULL,
  "rowVersion"        INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "ecosystem_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ecosystem_link_code_key" ON "ecosystem_link" ("code");
CREATE INDEX "ecosystem_link_operationalStatus_sortOrder_idx" ON "ecosystem_link" ("operationalStatus", "sortOrder");
CREATE INDEX "ecosystem_link_legalEntityId_idx" ON "ecosystem_link" ("legalEntityId");
CREATE INDEX "ecosystem_link_publishedAt_idx" ON "ecosystem_link" ("publishedAt");

ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_logoFileId_fkey"
  FOREIGN KEY ("logoFileId") REFERENCES "file_object" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_legalEntityId_fkey"
  FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_createdByActorId_fkey"
  FOREIGN KEY ("createdByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_updatedByActorId_fkey"
  FOREIGN KEY ("updatedByActorId") REFERENCES "actor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una ficha publicada tiene que tener fecha de publicación, y una oculta no
-- puede fingir que la tiene. Sin esto, «publicada» sería un adjetivo que dice
-- la interfaz y no un hecho que la base sostiene.
ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_publicacion_coherente_con_el_estado"
  CHECK (
    ("operationalStatus" = 'ACTIVE' AND "publishedAt" IS NOT NULL)
    OR ("operationalStatus" = 'HIDDEN' AND "publishedAt" IS NULL)
  );

-- La dirección, si existe, es absoluta y por HTTPS. Una dirección relativa
-- convertiría el «acceso externo» en una ruta de este mismo sitio sin que se
-- notara, y `http://` mandaría a la persona por un canal sin cifrar a una
-- plataforma donde va a escribir su contraseña.
--
-- Vacía tampoco: la ausencia de dirección se representa con NULL y con nada
-- más, porque la cadena vacía pasaría el «tiene dirección» de cualquier
-- comprobación descuidada y produciría el botón que no lleva a ninguna parte.
ALTER TABLE "ecosystem_link"
  ADD CONSTRAINT "ecosystem_link_direccion_externa_absoluta_y_cifrada"
  CHECK ("externalUrl" IS NULL OR "externalUrl" ~ '^https://[^\s]+$');

-- El código identifica la ficha para siempre y no se edita: es lo que usan la
-- semilla, las pruebas y cualquier enlace que alguien haya guardado. El resto
-- de la ficha —nombre, textos, logotipo, acento, dirección, estado y orden— es
-- justamente lo que se administra sin desplegar código.
--
-- `createdAt` y `createdByActorId` quedan fuera por la razón de siempre: quién
-- la dio de alta y cuándo no es algo que se corrija más tarde.
REVOKE UPDATE ON TABLE "ecosystem_link" FROM fuerza_app;
GRANT UPDATE (
  "name", "summary", "audienceText",
  "logoFileId", "accentToken",
  "externalUrl", "legalEntityId",
  "operationalStatus", "sortOrder", "publishedAt",
  "updatedAt", "updatedByActorId", "rowVersion"
) ON TABLE "ecosystem_link" TO fuerza_app;
