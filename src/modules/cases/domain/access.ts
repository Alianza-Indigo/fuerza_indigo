/**
 * De qué compartimento es un expediente (PRD §10.3).
 *
 * La traducción vive en `@/platform/authz/compartments`, no aquí: el servicio
 * de archivos también la necesita para decidir sobre el documento de un
 * expediente, y una regla en dos sitios es una regla que ya se contradice en
 * uno. El módulo la reexporta con su vocabulario para que sus casos de uso no
 * tengan que nombrar la plataforma cada vez.
 */
export { compartimentoDeExpediente as compartimentoDe } from '@/platform/authz/compartments';
