-- Una revisión por generación (PRD §15.4, §24 Fase 8, bloque F).
--
-- La revisión humana de una salida es **terminal**: aceptar, corregir o rechazar
-- es una decisión, no un historial de intentos. La puerta del bloque F —una
-- salida asistida no surte efecto sin que una persona la haya aceptado— pregunta
-- «¿está aceptada esta generación?», y esa pregunta necesita una sola respuesta.
-- Si pudieran coexistir un rechazo y una aceptación sobre la misma generación, la
-- puerta dependería de cuál se mirara.
--
-- La tabla ya es de solo inserción (el bloque A le quitó UPDATE y DELETE), así
-- que la unicidad no es una comodidad: es lo que impide que una segunda fila
-- contradiga a la primera sin poder corregir ninguna de las dos.
--
-- Corrección del índice no único del bloque A por una restricción de unicidad.
-- Funciona igual sobre una base al día —donde aún no hay ninguna revisión que
-- pudiera chocar— y sobre una instalación desde cero.
DROP INDEX "ai_review_generationId_idx";
CREATE UNIQUE INDEX "ai_review_generationId_key" ON "ai_review" ("generationId");
