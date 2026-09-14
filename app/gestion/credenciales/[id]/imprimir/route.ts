import { currentActor } from '@/platform/http/request-context';
import { credentialForDownload } from '@/modules/membership';
import { svgCredencial } from '@/platform/credentials/design';
import { env } from '@/platform/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Archivo imprimible reservado al personal autorizado para emitir
 * credenciales. La autorización se comprueba dentro de
 * `credentialForDownload`; la ubicación bajo Gestión solo hace visible la
 * intención, no sustituye el control del servidor.
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
    curp: credencial.curp,
    folio: credencial.folio,
    photoDataUrl: credencial.photoDataUrl,
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
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
