-- Suscripciones de notificación web por persona (RFC 8291, PRD §16.2, Fase 9
-- bloque D). Un arreglo de suscripciones del navegador —endpoint y claves
-- públicas— que la persona autorizó explícitamente. La clave privada VAPID no
-- entra aquí: vive en el entorno. Una columna nueva sobre una entidad que ya
-- existe, no una tabla nueva: el contrato de fases no admite una entidad más.
ALTER TABLE "person"
  ADD COLUMN "webPushSubscriptions" JSONB NOT NULL DEFAULT '[]';
