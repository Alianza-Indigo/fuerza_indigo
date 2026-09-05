/**
 * Nombre completo de una persona, en el orden que se usa en México.
 *
 * Nombre de pila, segundo nombre si lo hay, apellido paterno y apellido
 * materno. El orden **no es un detalle de presentación**: un padrón sindical,
 * una credencial y un oficio a la autoridad tienen que llamar a la misma
 * persona igual, y quien lea los tres tiene que reconocerla sin dudar.
 *
 * Vivía repetida en siete archivos —el registro maestro, las solicitudes, los
 * padrones, el directorio, las atenciones protegidas, las relaciones de cuidado
 * y el ciclo de la membresía—, todas idénticas por casualidad. Basta que
 * alguien cambie una para que dos pantallas empiecen a nombrar distinto a la
 * misma persona, y eso no lo delata ninguna prueba: las dos siguen «bien».
 */
export interface PartesDelNombre {
  readonly givenName: string;
  readonly middleName: string | null;
  readonly familyName: string;
  readonly secondFamilyName: string | null;
}

export function nombreCompleto(persona: PartesDelNombre): string {
  return [persona.givenName, persona.middleName, persona.familyName, persona.secondFamilyName]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}
