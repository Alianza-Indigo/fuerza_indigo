CREATE TABLE "network_map_location" (
  "subjectKey" VARCHAR(200) NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "address" VARCHAR(300),
  "city" VARCHAR(160),
  "state" VARCHAR(160),
  "contactName" VARCHAR(160),
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "website" VARCHAR(500),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByActorId" UUID NOT NULL,
  CONSTRAINT "network_map_location_pkey" PRIMARY KEY ("subjectKey"),
  CONSTRAINT "network_map_location_category_check" CHECK ("category" IN ('STATE', 'MUNICIPALITY', 'SECTION', 'HONORARY')),
  CONSTRAINT "network_map_location_coordinates_check" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL) OR
    ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  ),
  CONSTRAINT "network_map_location_enabled_check" CHECK (NOT "enabled" OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)),
  CONSTRAINT "network_map_location_updatedByActorId_fkey" FOREIGN KEY ("updatedByActorId") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
