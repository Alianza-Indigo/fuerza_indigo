import { currentActor } from '@/platform/http/request-context';
import { credentialForDownload } from '@/modules/membership';
import { svgCredencial } from '@/platform/credentials/design';
import { env } from '@/platform/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Descarga de la credencial en formato digital e imprimible (PRD §7.4,
 * F4-CRE-002).
 *
 * **Se dibuja al pedirla, no se guarda una copia.** El documento se deriva del
 * estado de la credencial en este instante; archivar el dibujo produciría una
 * imagen que envejece —con el diseño de hace dos años y una vigencia que ya
 * pasó— y que alguien acabaría enseñando. Lo que hay que poder demostrar es el
 * **código**, y ese sí está guardado y firmado.
 *
 * **SVG y no PDF** (ADR-0091): imprime igual de bien a cualquier tamaño, lo
 * abre cualquier navegador, pesa unos kilobytes y no obliga a añadir una
 * biblioteca de composición de documentos para dibujar seis líneas de texto.
 *
 * Solo se entrega si la credencial está **vigente**: `credentialForDownload`
 * rechaza las revocadas, repuestas y vencidas. Entregar el dibujo de una
 * credencial que ya no vale es fabricar el documento que no debería circular.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const actor = await currentActor();

  const resultado = await credentialForDownload(actor, id);
  if (!resultado.ok) {
    return Response.json(resultado.error.toPublicJSON(), { status: resultado.error.httpStatus });
  }

  const credencial = resultado.data;
  const svg = svgCredencial({
    kind: credencial.kind,
    displayName: credencial.displayName,
    publicCode: credencial.publicCode,
    token: credencial.token,
    verificationUrl: `${env().APP_URL}/verificar`,
    issuedAt: credencial.issuedAt,
    expiresAt: credencial.expiresAt,
    territoryLabel: credencial.territoryLabel,
    issuer: 'Fuerza Índigo',
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="credencial-${credencial.publicCode}.svg"`,
      // Lleva el nombre de una persona y su código de verificación: no se
      // guarda en ninguna caché intermedia.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
