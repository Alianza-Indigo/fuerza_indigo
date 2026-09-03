import { currentActor } from '@/platform/http/request-context';
import { redeemDownload } from '@/platform/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Descarga de un archivo privado (PRD §17.4).
 *
 * Conocer esta URL no basta: el pase se canjea aquí y la política se **vuelve a
 * evaluar**. Si el nombramiento se revocó tras emitirse el pase, el enlace
 * copiado deja de servir en ese mismo instante.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const expiresAt = Number(url.searchParams.get('exp') ?? '0');
  const signature = url.searchParams.get('sig') ?? '';

  const actor = await currentActor();
  const result = await redeemDownload(actor, fileId, expiresAt, signature);

  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }

  const { content, mimeType, originalFileName, inlineViewable } = result.data;

  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      // El material sensible y clínico se descarga; nunca se previsualiza en el
      // navegador, donde quedaría en la caché del visor (docs/INTEGRATIONS.md §4).
      'Content-Disposition': `${inlineViewable ? 'inline' : 'attachment'}; filename="${encodeURIComponent(originalFileName)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
