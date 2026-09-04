-- Clave estable para el límite de intentos (docs/DECISIONS.md ADR-0039).
--
-- El recuento se agrupaba por `subjectLabel`, que es el correo **enmascarado**.
-- La máscara no es inyectiva: «pedro@dominio» y «paula@dominio» producen los dos
-- «pe…o@dominio». Dos personas distintas compartían cupo, de modo que los
-- intentos fallidos contra una cuenta bloqueaban otra, por accidente o a
-- propósito.
--
-- `subjectKey` guarda una huella HMAC del correo normalizado: agrupa sin
-- colisionar y sin conservar el correo en claro. `subjectLabel` se conserva para
-- lo que siempre debió ser su única función, que es mostrarse.
ALTER TABLE "security_event" ADD COLUMN "subjectKey" VARCHAR(64);

CREATE INDEX "security_event_subject_key_idx"
  ON "security_event" ("kind", "subjectKey", "occurredAt");
