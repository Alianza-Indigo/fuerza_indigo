-- El vencimiento, con nombre propio (PRD §3.6; F4-AFI-009).
--
-- El modelo exige desde la Fase 4 que toda membresía que ya no está en curso
-- diga cuándo terminó y por qué —`("endedAt" IS NULL) = ("endReason" IS NULL)`—,
-- y `EXPIRED` cae de ese lado. Sin un motivo que signifique «se acabó la
-- vigencia», un vencimiento tendría que anotarse como inactividad o como
-- corrección administrativa: las dos dicen que alguien decidió algo, y aquí no
-- decidió nadie. Solo pasó el tiempo, y renovar lo devuelve.
--
-- Va en migración aparte de `CONVERSION` porque aquella ya estaba aplicada
-- cuando esta hizo falta, y una migración aplicada no se reescribe.

-- AlterEnum
ALTER TYPE "MembershipEndReason" ADD VALUE 'EXPIRY';
