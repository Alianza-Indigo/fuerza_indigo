import { territorialAppointmentDetail } from '@/modules/governance';
import { currentActor } from '@/platform/http/request-context';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nombramiento: string }> },
): Promise<Response> {
  const actor = await currentActor();
  const { nombramiento } = await params;
  const result = await territorialAppointmentDetail(actor, nombramiento);
  if (!result.ok) return new Response('El acuerdo no existe o está fuera de tu alcance.', { status: 404 });

  const appointment = result.data;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(appointment.number)}</title>
  <style>
    body { max-width: 48rem; margin: 3rem auto; padding: 0 2rem; color: #17203a; font: 16px/1.65 Georgia, serif; }
    pre { white-space: pre-wrap; font: inherit; }
    @media print { body { margin: 0 auto; } }
  </style>
</head>
<body><pre>${escapeHtml(appointment.agreementText)}</pre></body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${appointment.number}.html"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
