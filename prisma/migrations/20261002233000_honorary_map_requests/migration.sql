CREATE TYPE "NetworkMapRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

CREATE TABLE "network_map_request" (
  "id" UUID NOT NULL,
  "subjectKey" VARCHAR(200) NOT NULL,
  "category" VARCHAR(20) NOT NULL DEFAULT 'HONORARY',
  "status" "NetworkMapRequestStatus" NOT NULL DEFAULT 'PENDING',
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "address" VARCHAR(300),
  "city" VARCHAR(160),
  "state" VARCHAR(160),
  "contactName" VARCHAR(160),
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "website" VARCHAR(500),
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedByActorId" UUID NOT NULL,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByActorId" UUID,
  "reviewNote" VARCHAR(600),
  CONSTRAINT "network_map_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "network_map_request_category_check" CHECK ("category" = 'HONORARY'),
  CONSTRAINT "network_map_request_coordinates_check" CHECK (
    "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
  ),
  CONSTRAINT "network_map_request_review_check" CHECK (
    ("status" IN ('PENDING', 'SUPERSEDED') AND "reviewedAt" IS NULL AND "reviewedByActorId" IS NULL) OR
    ("status" IN ('APPROVED', 'REJECTED') AND "reviewedAt" IS NOT NULL AND "reviewedByActorId" IS NOT NULL)
  ),
  CONSTRAINT "network_map_request_requestedByActorId_fkey" FOREIGN KEY ("requestedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "network_map_request_reviewedByActorId_fkey" FOREIGN KEY ("reviewedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "network_map_request_subjectKey_status_requestedAt_idx"
  ON "network_map_request"("subjectKey", "status", "requestedAt");

CREATE INDEX "network_map_request_status_requestedAt_idx"
  ON "network_map_request"("status", "requestedAt");

CREATE UNIQUE INDEX "network_map_request_one_pending_per_subject_idx"
  ON "network_map_request"("subjectKey") WHERE "status" = 'PENDING';
