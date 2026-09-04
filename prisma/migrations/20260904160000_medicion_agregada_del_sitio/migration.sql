-- Medición agregada del sitio público (F2-OPS-002).
--
-- No existe una fila por visita. La unicidad sobre
-- (evento, ruta, hora, clase de agente) es lo que convierte esta tabla en un
-- contador: cada visita incrementa una fila que ya existe, y no queda nada que
-- correlacionar porque no hay nada que pertenezca a nadie.
--
-- La hora va truncada a propósito. Con minutos se pueden encadenar visitas
-- cercanas y reconstruir un recorrido, que es exactamente como se reidentifica
-- a una persona en una tabla que «no tiene datos personales».

-- CreateEnum
CREATE TYPE "SiteMetricEvent" AS ENUM ('PAGE_VIEW', 'SEARCH_WITH_RESULTS', 'SEARCH_WITHOUT_RESULTS', 'PREFERENCES_SAVED', 'OFFLINE_FALLBACK');


-- CreateTable
CREATE TABLE "site_metric" (
    "id" UUID NOT NULL,
    "event" "SiteMetricEvent" NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "occurredAtHour" TIMESTAMPTZ(3) NOT NULL,
    "userAgentClass" "UserAgentClass" NOT NULL DEFAULT 'UNKNOWN',
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "site_metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_metric_event_occurredAtHour_idx" ON "site_metric"("event", "occurredAtHour");

-- CreateIndex
CREATE INDEX "site_metric_occurredAtHour_idx" ON "site_metric"("occurredAtHour");

-- CreateIndex
CREATE UNIQUE INDEX "site_metric_event_route_occurredAtHour_userAgentClass_key" ON "site_metric"("event", "route", "occurredAtHour", "userAgentClass");



-- La aplicación incrementa y lee; no corrige ni borra.
--
-- `UPDATE` se conserva porque el contador se incrementa con él. Lo que se
-- retira es `DELETE`: una medición agregada que se puede borrar desde la
-- aplicación deja de servir para rendir cuentas de lo que el sitio hizo, y no
-- hay ninguna razón legítima para que una petición web borre un contador. La
-- purga por retención la hace el rol propietario en una migración.
REVOKE DELETE, TRUNCATE ON TABLE "site_metric" FROM fuerza_app;
