-- Aclaración con plazo y resolución fundada (PRD §8.1 pasos 10 y 11; F4-AFI-006).
--
-- Una aclaración no cabía en la bitácora de revisión. `application_review` es un
-- asiento de una sola cara —lo que hizo quien revisa, inmutable para siempre— y
-- una aclaración es un intercambio de dos: una pregunta con plazo y una
-- respuesta que llega después, escrita por la persona solicitante. Guardar la
-- respuesta ahí habría obligado a mutar un asiento que el motor no deja mutar, o
-- a no guardarla en ninguna parte.

-- CreateTable
CREATE TABLE "application_clarification" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "request" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMPTZ(3),
    "answeredById" UUID,
    "notifiedAt" TIMESTAMPTZ(3),
    "remindedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_clarification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_clarification_applicationId_idx" ON "application_clarification"("applicationId");

-- CreateIndex
CREATE INDEX "application_clarification_dueAt_idx" ON "application_clarification"("dueAt");

-- AddForeignKey
ALTER TABLE "application_clarification" ADD CONSTRAINT "application_clarification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "membership_application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_clarification" ADD CONSTRAINT "application_clarification_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_clarification" ADD CONSTRAINT "application_clarification_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 1. Un plazo que no es plazo no sirve de nada.
--
--    Pedir una aclaración «para ayer» no da tiempo a nadie y convierte el
--    requerimiento en un trámite para poder rechazar. La fecha límite tiene que
--    ser posterior al momento en que se pide.
-- ---------------------------------------------------------------------------
ALTER TABLE "application_clarification"
  ADD CONSTRAINT "application_clarification_plazo_futuro"
  CHECK ("dueAt" > "requestedAt");

-- ---------------------------------------------------------------------------
-- 2. Los tres campos de la respuesta van juntos o no va ninguno.
--
--    Una respuesta sin fecha no se puede situar en el plazo, y una fecha sin
--    respuesta dice que alguien contestó sin decir qué. Cualquiera de las dos
--    combinaciones sueltas es un dato que miente.
-- ---------------------------------------------------------------------------
ALTER TABLE "application_clarification"
  ADD CONSTRAINT "application_clarification_respuesta_completa"
  CHECK (
    ("answer" IS NULL AND "answeredAt" IS NULL AND "answeredById" IS NULL)
    OR ("answer" IS NOT NULL AND "answeredAt" IS NOT NULL AND "answeredById" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 3. Cerrar sin respuesta exige decir por qué.
--
--    Seguir adelante sin la aclaración que se pidió es una decisión, y una
--    decisión sin motivo escrito no se puede explicar después a quien la sufre.
-- ---------------------------------------------------------------------------
ALTER TABLE "application_clarification"
  ADD CONSTRAINT "application_clarification_cierre_motivado"
  CHECK (
    ("closedAt" IS NULL AND "closeReason" IS NULL)
    OR ("closedAt" IS NOT NULL AND char_length(btrim("closeReason")) >= 15)
  );

-- ---------------------------------------------------------------------------
-- 4. Contestada y cerrada sin respuesta son excluyentes.
--
--    Si la persona contestó, la aclaración terminó por la vía buena. Marcarla
--    además como cerrada sin respuesta borraría de la historia que sí contestó.
-- ---------------------------------------------------------------------------
ALTER TABLE "application_clarification"
  ADD CONSTRAINT "application_clarification_una_sola_salida"
  CHECK (NOT ("answeredAt" IS NOT NULL AND "closedAt" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 5. Una sola aclaración abierta por solicitud.
--
--    Dos requerimientos vivos a la vez dejan sin respuesta la pregunta de a cuál
--    corresponde el plazo que corre, y esa pregunta se hace justo cuando alguien
--    reclama que se le venció. Cerrada o contestada la anterior, se puede pedir
--    otra: el índice es parcial a propósito.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "application_clarification_una_abierta_por_solicitud"
  ON "application_clarification" ("applicationId")
  WHERE "answeredAt" IS NULL AND "closedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. La respuesta se escribe una vez.
--
--    Lo que la persona contestó es la base sobre la que se resuelve su
--    solicitud. Si se pudiera reescribir después, la resolución quedaría
--    fundada en un texto que ya no existe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "fuerza_respuesta_de_aclaracion_inmutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."answer" IS NOT NULL AND NEW."answer" IS DISTINCT FROM OLD."answer" THEN
    RAISE EXCEPTION
      'La respuesta a una aclaración no se puede modificar (aclaración %).', OLD."id";
  END IF;
  IF OLD."request" IS DISTINCT FROM NEW."request" OR OLD."dueAt" IS DISTINCT FROM NEW."dueAt" THEN
    RAISE EXCEPTION
      'Lo que se pidió y el plazo que se dio no se reescriben (aclaración %). Cierra esta y pide otra.', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "application_clarification_inmutable"
  BEFORE UPDATE ON "application_clarification"
  FOR EACH ROW
  EXECUTE FUNCTION "fuerza_respuesta_de_aclaracion_inmutable"();

-- ---------------------------------------------------------------------------
-- 7. Privilegios por columna.
--
--    El disparador de arriba protege el contenido; esto protege el resto de la
--    fila. La aplicación solo puede escribir lo que ocurre después de pedir la
--    aclaración: la respuesta, los avisos y el cierre. Ni borrar, ni cambiar de
--    solicitud, ni cambiar quién la pidió.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "application_clarification" FROM fuerza_app;
GRANT UPDATE (
  "answer",
  "answeredAt",
  "answeredById",
  "notifiedAt",
  "remindedAt",
  "closedAt",
  "closeReason",
  "updatedAt"
) ON TABLE "application_clarification" TO fuerza_app;
