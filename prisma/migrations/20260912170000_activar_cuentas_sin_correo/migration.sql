-- La activación por correo se deshabilita temporalmente durante la puesta en
-- marcha. Las cuentas existentes quedan habilitadas; las que aún no tengan una
-- contraseña siguen sin poder iniciar sesión hasta canjear un enlace de un solo
-- uso generado desde el panel de personas.
UPDATE "user_account"
SET
  "status" = 'ACTIVE',
  "mustChangePassword" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "credential"
      WHERE "credential"."userId" = "user_account"."id"
        AND "credential"."type" = 'PASSWORD'
        AND "credential"."revokedAt" IS NULL
    ) THEN "mustChangePassword"
    ELSE TRUE
  END,
  "failedAttempts" = 0,
  "lockedUntil" = NULL,
  "rowVersion" = "rowVersion" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'INVITED';
