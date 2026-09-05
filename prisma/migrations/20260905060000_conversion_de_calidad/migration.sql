-- Conversión de calidad (PRD §8.4; F4-AFI-009).
--
-- Pasar de afiliación honoraria a sindical termina la anterior, y ese final
-- necesita nombre propio. Sin él habría que anotarlo como «corrección
-- administrativa» —que dice que alguien se equivocó— o como «pérdida de
-- calidad» —que suena a castigo—. Ninguna de las dos es verdad: la persona
-- ganó una calidad, no perdió nada.

-- AlterEnum
ALTER TYPE "MembershipEndReason" ADD VALUE 'CONVERSION';
