import { credentialPhotoForVerification } from '@/modules/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La fotografía solo se sirve mientras el mismo código siga acreditando. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const photo = await credentialPhotoForVerification(decodeURIComponent(token));
  if (photo === null) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo.content), {
    status: 200,
    headers: {
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
