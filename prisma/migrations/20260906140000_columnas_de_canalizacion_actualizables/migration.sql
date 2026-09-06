-- Las columnas de canalización de la entrada pública tienen que poder escribirse.
--
-- La migración de la Fase 2 retiró `UPDATE` sobre `support_request` entero y lo
-- devolvió **columna por columna**, para que el relato de quien escribe no se
-- pueda editar nunca. Es la garantía correcta y sigue en pie.
--
-- Lo que no se vio al añadir las columnas de la Fase 6 es que una lista blanca
-- de columnas no crece sola: `territorialUnitId`, `suggestedRouting`,
-- `confirmedRoutingLegalEntityId`, `confirmedById` y `confirmedAt` nacieron
-- fuera de ella. Confirmar una canalización habría fallado con «permiso
-- denegado» en el primer intento, y el formulario y el caso de uso habrían
-- estado los dos bien.
--
-- Se corrige en una migración aparte y no editando la anterior: la de la Fase 6
-- ya se aplicó en desarrollo y en la integración continua, y reescribirla
-- dejaría a esas bases diciendo que tienen algo que no tienen. Es exactamente
-- el desfase silencioso que `npm run db:check` existe para detectar.
--
-- `narrative`, `folio`, `legalEntityId` y `receivedAt` **siguen fuera** de la
-- lista: el relato no se edita, el folio no cambia y el mensaje sigue dirigido a
-- quien se dirigió. Adónde se canaliza es otra cosa, y por eso vive en columnas
-- propias en vez de sobrescribir el destinatario original.
REVOKE UPDATE ON TABLE "support_request" FROM fuerza_app;
GRANT UPDATE (
  "status", "urgency", "personId", "consentId",
  "handledByActorId", "handledAt", "handlingNote",
  "submittedByPersonId", "territorialUnitId",
  "suggestedRouting",
  "confirmedRoutingLegalEntityId", "confirmedById", "confirmedAt",
  "updatedAt", "rowVersion"
) ON TABLE "support_request" TO fuerza_app;
