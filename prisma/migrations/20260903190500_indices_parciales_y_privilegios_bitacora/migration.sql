-- Migración correctiva y complementaria de la inicial.
--
-- Contiene lo que el esquema de Prisma no puede expresar y que el modelo de
-- datos sí exige (docs/DATA_MODEL.md §3 y §15, docs/SECURITY.md §6):
--   1. Índice de prefijo para la ruta materializada del territorio (ADR-0027).
--   2. Índices únicos PARCIALES que impiden duplicidades vivas.
--   3. Retirada de los privilegios de modificación sobre las bitácoras.
--
-- No se edita la migración anterior: una corrección es siempre una migración
-- nueva (PRD §17.3).

-- ---------------------------------------------------------------------------
-- 1. Jerarquía territorial: consultas de descendientes por prefijo.
--    `path LIKE '/nacional/mx/jal/%'` usa este índice; el B-tree por omisión
--    no sirve para el operador LIKE con comodín al final en todas las
--    configuraciones regionales.
-- ---------------------------------------------------------------------------
CREATE INDEX "territorial_unit_path_prefix_idx"
  ON "territorial_unit" ("path" text_pattern_ops);

-- ---------------------------------------------------------------------------
-- 2. Unicidad lógica: solo sobre las filas vivas.
-- ---------------------------------------------------------------------------

-- Una persona activa y no fusionada no comparte correo con otra.
CREATE UNIQUE INDEX "person_primary_email_live_uniq"
  ON "person" ("primaryEmail")
  WHERE "primaryEmail" IS NOT NULL
    AND "mergedIntoPersonId" IS NULL
    AND "archivedAt" IS NULL;

-- Una persona no puede tener dos autorizaciones vivas sobre la misma organización.
CREATE UNIQUE INDEX "organization_user_live_uniq"
  ON "organization_user" ("organizationId", "personId")
  WHERE "revokedAt" IS NULL;

-- Un mismo trabajo de negocio no se encola dos veces mientras no ha terminado.
CREATE UNIQUE INDEX "background_job_pending_uniq"
  ON "background_job" ("jobType", "businessKey")
  WHERE "status" NOT IN ('SUCCEEDED', 'CANCELLED');

-- Una cuenta no tiene dos asignaciones vivas del mismo rol en el mismo alcance.
CREATE UNIQUE INDEX "role_assignment_live_uniq"
  ON "role_assignment" ("userId", "roleId", COALESCE("legalEntityId", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("organizationId", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "revokedAt" IS NULL;

-- Solo puede haber una versión normativa en vigor a la vez.
CREATE UNIQUE INDEX "normative_rule_set_in_force_uniq"
  ON "normative_rule_set" (("status"))
  WHERE "status" = 'IN_FORCE';

-- ---------------------------------------------------------------------------
-- 3. Bitácoras anexables, no editables (PRD §20.4, ADR-0011).
--
--    Que la interfaz no ofrezca la acción no es una garantía. La garantía es
--    que el rol con el que se conecta la aplicación carece del privilegio.
--
--    `fuerza_app` es un rol de grupo sin acceso propio. El usuario de conexión
--    declarado en DATABASE_URL debe ser miembro suyo y NO ser el propietario de
--    las tablas; el propietario, que ejecuta las migraciones, se declara en
--    DIRECT_URL. La separación está documentada en docs/ENVIRONMENT.md §4.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fuerza_app') THEN
    CREATE ROLE fuerza_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO fuerza_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fuerza_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fuerza_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fuerza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fuerza_app;

-- Anexable: se puede insertar y leer, jamás modificar ni borrar.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_event" FROM fuerza_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "security_event" FROM fuerza_app;

-- Las entregas de la bandeja de salida sí se actualizan (cambian de estado),
-- pero el mensaje original no se borra nunca desde la aplicación.
REVOKE DELETE, TRUNCATE ON TABLE "outbox_message" FROM fuerza_app;
