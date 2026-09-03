-- Cadena de resúmenes de la bitácora institucional (docs/SECURITY.md §5, ADR-0011).
--
-- La migración inicial creó `audit_event` sin `chainKey` ni `chainSequence`, que
-- el modelo sí declara. El resultado era que un despliegue desde base vacía
-- levantaba un esquema sobre el que `recordAudit` no podía escribir: toda acción
-- auditada fallaba. Lo detectó la prueba de despliegue desde cero (E2E-15).
--
-- Se corrige con una migración nueva y no editando la anterior, conforme a
-- docs/TEST_PLAN.md §6.

-- Una cadena no se puede retrofitar. El resumen de un evento incluye su clave de
-- partición y su posición: los eventos escritos sin ellas no tienen un valor
-- correcto que asignarles, y rellenarlos con cualquier cosa produciría una
-- cadena que verifica en falso. Si hubiera eventos previos, esta migración se
-- detiene y el despliegue con ella, que es lo correcto: es preferible parar a
-- dejar una bitácora que aparenta integridad sin tenerla.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "audit_event") THEN
    RAISE EXCEPTION
      'audit_event contiene % evento(s) anteriores a la cadena de resúmenes. Una cadena no se puede reconstruir a posteriori: archive la bitácora existente antes de aplicar esta migración.',
      (SELECT count(*) FROM "audit_event");
  END IF;
END $$;

ALTER TABLE "audit_event"
  ADD COLUMN "chainKey" VARCHAR(40) NOT NULL,
  ADD COLUMN "chainSequence" BIGINT NOT NULL;

-- Es lo que impide que dos escrituras simultáneas ocupen la misma posición. El
-- bloqueo consultivo de `recordAudit` las serializa; este índice es la red que
-- convierte un error de programación en un fallo visible y no en una cadena rota.
CREATE UNIQUE INDEX "audit_event_chainKey_chainSequence_key"
  ON "audit_event" ("chainKey", "chainSequence");
