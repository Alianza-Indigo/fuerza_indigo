import { getIndigoAmbassador } from '@/modules/admin';
import { env } from '@/platform/config/env';
import { svgCredencialDeEmbajador } from '@/platform/credentials/ambassador-design';
import { currentActor } from '@/platform/http/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Descarga reservada al Superadmin que administra la red de afiliadores. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const actor = await currentActor();
  const result = await getIndigoAmbassador(actor, id);

  if (!result.ok) {
    return Response.json(result.error.toPublicJSON(), { status: result.error.httpStatus });
  }

  const ambassador = result.data;
  if (ambassador.status !== 'ACTIVE') {
    return Response.json(
      { message: 'La credencial sólo puede generarse mientras el Embajador Índigo esté activo.' },
      { status: 409 },
    );
  }

  const affiliationUrl = `${env().APP_URL}/embajadores/${ambassador.code}`;
  const svg = svgCredencialDeEmbajador({
    displayName: ambassador.displayName,
    code: ambassador.code,
    territory: ambassador.territory,
    issuedAt: ambassador.createdAt,
    affiliationUrl,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="credencial-embajador-${ambassador.code}.svg"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
