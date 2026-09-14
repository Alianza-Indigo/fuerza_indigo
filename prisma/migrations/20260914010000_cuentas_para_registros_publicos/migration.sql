-- Los registros públicos anteriores a esta corrección crearon una persona y
-- una solicitud o ficha protegida, pero no una cuenta de acceso. Se abren las
-- cuentas faltantes en estado ACTIVE, sin inventar contraseñas. Desde el panel
-- de personas se genera el enlace de un solo uso para las filas reparadas.
WITH registration_actor AS (
  SELECT "id"
  FROM "actor"
  WHERE "kind" = 'SYSTEM_JOB'
    AND "label" = 'Registro público de afiliación'
  ORDER BY "createdAt" ASC
  LIMIT 1
),
eligible_people AS (
  SELECT DISTINCT ON (lower(p."primaryEmail"))
    p."id" AS "personId",
    lower(p."primaryEmail") AS "email",
    concat_ws(' ', p."givenName", p."familyName") AS "label"
  FROM "person" p
  WHERE p."primaryEmail" IS NOT NULL
    AND btrim(p."primaryEmail") <> ''
    AND p."mergedIntoPersonId" IS NULL
    AND (
      EXISTS (SELECT 1 FROM "membership_application" ma WHERE ma."personId" = p."id")
      OR EXISTS (SELECT 1 FROM "protected_beneficiary" pb WHERE pb."personId" = p."id")
    )
    AND NOT EXISTS (SELECT 1 FROM "user_account" ua WHERE ua."personId" = p."id")
    AND NOT EXISTS (SELECT 1 FROM "user_account" ua WHERE lower(ua."email") = lower(p."primaryEmail"))
  ORDER BY lower(p."primaryEmail"), p."createdAt" ASC
),
created_accounts AS (
  INSERT INTO "user_account" (
    "id", "personId", "email", "status", "mustChangePassword",
    "createdByActorId", "updatedByActorId", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid(), ep."personId", ep."email", 'ACTIVE', true,
    ra."id", ra."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM eligible_people ep
  CROSS JOIN registration_actor ra
  RETURNING "id", "personId"
)
INSERT INTO "actor" ("id", "kind", "userId", "label", "isActive", "createdAt")
SELECT gen_random_uuid(), 'PERSON', ca."id", ep."label", true, CURRENT_TIMESTAMP
FROM created_accounts ca
JOIN eligible_people ep ON ep."personId" = ca."personId";

-- El portal filtra «Mi afiliación» por el rol APPLICANT y los servicios
-- protegidos por PROTECTED_BENEFICIARY. Ambos son roles automáticos derivados
-- del registro, no nombramientos discrecionales. La cuenta destinataria sirve
-- como ancla de la FK grantedById; el origen real de la reparación es esta
-- migración.
WITH automatic_roles AS (
  SELECT DISTINCT
    ua."id" AS "userId",
    r."id" AS "roleId",
    ma."legalEntityId",
    'Asignación automática reparada para una solicitud pública de afiliación.'::text AS "reason"
  FROM "membership_application" ma
  JOIN "user_account" ua ON ua."personId" = ma."personId"
  JOIN "role" r ON r."code" = 'APPLICANT'
  WHERE ma."status" IN (
    'DRAFT', 'SUBMITTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW',
    'CLARIFICATION_REQUIRED', 'APPROVED', 'PENDING_PAYMENT'
  )

  UNION ALL

  SELECT DISTINCT
    ua."id" AS "userId",
    r."id" AS "roleId",
    pb."legalEntityId",
    'Asignación automática reparada para un beneficiario protegido.'::text AS "reason"
  FROM "protected_beneficiary" pb
  JOIN "user_account" ua ON ua."personId" = pb."personId"
  JOIN "role" r ON r."code" = 'PROTECTED_BENEFICIARY'
  WHERE pb."status" NOT IN ('CLOSED', 'ARCHIVED')
)
INSERT INTO "role_assignment" (
  "id", "userId", "roleId", "legalEntityId", "grantedById",
  "grantReason", "startsAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), ar."userId", ar."roleId", ar."legalEntityId", ar."userId",
  ar."reason", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM automatic_roles ar
WHERE NOT EXISTS (
  SELECT 1
  FROM "role_assignment" existing
  WHERE existing."userId" = ar."userId"
    AND existing."roleId" = ar."roleId"
    AND existing."legalEntityId" = ar."legalEntityId"
    AND existing."revokedAt" IS NULL
);
