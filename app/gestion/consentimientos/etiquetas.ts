/**
 * Los once propósitos de consentimiento, con el nombre que se les da en
 * pantalla (PRD §7.3).
 *
 * Está en un módulo aparte, y no dentro del formulario, por una razón que costó
 * un fallo en producción de desarrollo (defecto `D-F4-010`): un módulo marcado
 * `'use client'` no exporta valores a quien lo importa desde el servidor. Lo que
 * llega ahí es una referencia al cliente, no el arreglo, así que un `.map` sobre
 * ella revienta al pintar la página. Los tipos no lo ven, porque del lado de los
 * tipos el arreglo es un arreglo.
 *
 * También estaba duplicado: el formulario tenía la lista con etiquetas y la
 * acción del servidor otra lista con los mismos once códigos. Añadir un
 * propósito obligaba a tocar dos sitios, y olvidar el segundo dejaba una casilla
 * que se marca y no se guarda.
 */
export const PROPOSITOS = [
  { value: 'MEMBERSHIP', label: 'Afiliación y padrón' },
  { value: 'DIRECTORY_PUBLICATION', label: 'Publicación en el directorio' },
  { value: 'CASE_PROCESSING', label: 'Atención de un caso' },
  { value: 'INTER_ENTITY_REFERRAL', label: 'Canalización entre entidades' },
  { value: 'CIAN_CARE', label: 'Atención CIAN' },
  { value: 'CLINICAL_DATA_SHARING', label: 'Compartir datos clínicos' },
  { value: 'AI_ASSISTANCE', label: 'Asistencia con inteligencia artificial' },
  { value: 'TOOL_IDENTITY_EXCHANGE', label: 'Identidad en herramientas' },
  { value: 'MARKETING_COMMUNICATIONS', label: 'Comunicaciones no esenciales' },
  { value: 'EVENT_PARTICIPATION', label: 'Participación en eventos' },
  { value: 'MINOR_REPRESENTATION', label: 'Representación de persona menor de edad' },
] as const;

export const CODIGOS_DE_PROPOSITO = PROPOSITOS.map((uno) => uno.value);

export const ETIQUETA_DE_PROPOSITO = new Map(PROPOSITOS.map((uno) => [uno.value, uno.label]));
