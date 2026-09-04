-- CMS versionado del sitio público (PRD §16.1, ADR-0041).
--
-- Tres tablas. `content_page` es la identidad estable de un contenido —su
-- dirección y su estado—; `content_version` guarda cada versión editorial con su
-- nota de cambios, de modo que revertir no borra nada sino que crea una versión
-- nueva copiada de la anterior; `content_redirect` conserva las direcciones que
-- una página tuvo antes, con unicidad en toda la instalación.


-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('PAGE', 'NEWS', 'STATEMENT', 'RESOURCE', 'FAQ', 'CALL_FOR_APPLICATIONS', 'BANNER', 'LEGAL', 'DELEGATION_PROFILE', 'PROTOCOL');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentAccess" AS ENUM ('PUBLIC', 'MEMBERS', 'INTERNAL');


-- CreateTable
CREATE TABLE "content_page" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "legalEntityId" UUID,
    "territorialUnitId" UUID,
    "currentVersionId" UUID,
    "draftVersionId" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "scheduledFor" TIMESTAMPTZ(3),
    "accessLevel" "ContentAccess" NOT NULL DEFAULT 'PUBLIC',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByActorId" UUID NOT NULL,
    "updatedByActorId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_version" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(400) NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(200),
    "socialImageFileId" UUID,
    "changeNote" VARCHAR(400),
    "revertedFromVersionId" UUID,
    "authorId" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_redirect" (
    "id" UUID NOT NULL,
    "fromSlug" VARCHAR(160) NOT NULL,
    "toPageId" UUID,
    "toPath" VARCHAR(400),
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByActorId" UUID NOT NULL,

    CONSTRAINT "content_redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_page_slug_key" ON "content_page"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_page_currentVersionId_key" ON "content_page"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "content_page_draftVersionId_key" ON "content_page"("draftVersionId");

-- CreateIndex
CREATE INDEX "content_page_kind_status_publishedAt_idx" ON "content_page"("kind", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "content_page_status_scheduledFor_idx" ON "content_page"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "content_page_legalEntityId_idx" ON "content_page"("legalEntityId");

-- CreateIndex
CREATE INDEX "content_page_territorialUnitId_idx" ON "content_page"("territorialUnitId");

-- CreateIndex
CREATE INDEX "content_version_pageId_createdAt_idx" ON "content_version"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_version_pageId_version_key" ON "content_version"("pageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "content_redirect_fromSlug_key" ON "content_redirect"("fromSlug");

-- CreateIndex
CREATE INDEX "content_redirect_toPageId_idx" ON "content_redirect"("toPageId");

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_territorialUnitId_fkey" FOREIGN KEY ("territorialUnitId") REFERENCES "territorial_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "content_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_draftVersionId_fkey" FOREIGN KEY ("draftVersionId") REFERENCES "content_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "content_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_socialImageFileId_fkey" FOREIGN KEY ("socialImageFileId") REFERENCES "file_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_revertedFromVersionId_fkey" FOREIGN KEY ("revertedFromVersionId") REFERENCES "content_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_redirect" ADD CONSTRAINT "content_redirect_toPageId_fkey" FOREIGN KEY ("toPageId") REFERENCES "content_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_redirect" ADD CONSTRAINT "content_redirect_createdByActorId_fkey" FOREIGN KEY ("createdByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

