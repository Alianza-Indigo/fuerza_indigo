import { logotipoPublicado } from '@/modules/ecosystem';

export const dynamic = 'force-dynamic';

/**
 * Logotipo de una ficha del catálogo (PRD §12.2; F7-CAT-001).
 *
 * Es la única ruta abierta que entrega el contenido de un archivo, y por eso su
 * forma importa más que su tamaño.
 *
 * **Recibe el código de la ficha, no un identificador de archivo.** No hay nada
 * que adivinar ni sustituir: no se puede pedir «el archivo 3f2a…» y ver qué
 * sale. Y solo responde por fichas publicadas, con un archivo clasificado como
 * público y de un formato de imagen admitido; cualquier otra cosa es un 404,
 * sin decir por qué —que exista o no un logotipo tampoco es información que
 * haya que regalar—.
 *
 * Lo que **no** hace: firmar pases, aceptar identificadores, ni servir nada que
 * no sea el logotipo de una ficha visible. La puerta de descarga del resto de
 * los archivos sigue siendo la de siempre, con su permiso y su auditoría.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const logotipo = await logotipoPublicado(code);

  if (logotipo === null) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(logotipo.content), {
    status: 200,
    headers: {
      'Content-Type': logotipo.mimeType,
      // Una hora en el navegador. El logotipo de una plataforma cambia muy de
      // vez en cuando, y quien lo cambie no debería esperar un día a verlo.
      'Cache-Control': 'public, max-age=3600',
      // Aunque el formato ya está acotado a tres tipos de imagen, se declara
      // que el navegador no adivine: es la defensa que sobrevive a que alguien
      // amplíe la lista sin pensarlo.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
