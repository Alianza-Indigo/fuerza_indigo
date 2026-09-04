import { redirect } from 'next/navigation';
import { currentActor } from '@/platform/http/request-context';
import { authorizeDownload } from '@/platform/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Emisión del pase de descarga (defecto `D-F4-007`).
 *
 * `authorizeDownload` existía desde la Fase 1 y **no lo invocaba nadie**: la
 * ruta de descarga exige un pase firmado y ninguna pantalla lo emitía, de modo
 * que ningún archivo guardado se podía abrir. No se notaba porque hasta esta
 * fase nada subía archivos desde una pantalla.
 *
 * Existe como ruta y no como acción de servidor porque el resultado es una
 * **navegación a un archivo**: un enlace normal, que se puede abrir en otra
 * pestaña y que funciona sin JavaScript.
 *
 * El pase no sustituye la comprobación: la ruta de descarga vuelve a evaluar la
 * política al canjearlo. Este paso solo evita que la URL firmada tenga que vivir
 * en el HTML de una página, donde quedaría en el historial y en cualquier
 * captura.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await context.params;
  const actor = await currentActor();

  const pase = await authorizeDownload(actor, fileId);
  if (!pase.ok) {
    return Response.json(pase.error.toPublicJSON(), { status: pase.error.httpStatus });
  }

  redirect(pase.data.path);
}
