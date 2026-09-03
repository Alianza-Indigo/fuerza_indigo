/**
 * Lectura de campos de texto de un formulario.
 *
 * `FormData.get` devuelve `string | File | null`. Pasar eso por `String()`
 * produce la cadena «[object File]» cuando alguien envía un archivo en un campo
 * que esperaba texto —a mano, o con un formulario alterado—, y esa cadena
 * acabaría comparándose contra un correo, una contraseña o un identificador.
 *
 * Un valor que no es texto no es «texto vacío»: es un campo ausente, y así se
 * trata aquí. La validación posterior con Zod lo rechaza con el mismo mensaje
 * que a un campo en blanco, sin exponer que el envío venía manipulado.
 */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
