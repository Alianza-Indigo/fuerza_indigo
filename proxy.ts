import { NextResponse, type NextRequest } from 'next/server';

/**
 * El proxy **no** consulta la base de datos ni decide autorizaciones
 * (ADR-0002). Solo propaga la correlación y la ruta, y emite la política de
 * contenido. La autorización real la evalúa cada caso de uso en el servidor:
 * una comprobación aquí podría omitirse cambiando la ruta, y eso no debe bastar
 * para entrar a ningún sitio.
 *
 * La política de contenido vive aquí y no en `next.config.ts` porque necesita un
 * valor distinto en cada petición: el `nonce`. Una política con `unsafe-inline`
 * se escribe en la configuración estática y no protege de nada, que es
 * exactamente lo que hay que evitar (docs/SECURITY.md §7).
 */
export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  if (!headers.has('x-request-id')) headers.set('x-request-id', crypto.randomUUID());
  // Next lee este encabezado y aplica el nonce a sus propias etiquetas.
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));
  return response;
}

/**
 * `script-src` no admite `unsafe-inline`: cada script lleva su nonce, y
 * `strict-dynamic` permite que los que ellos carguen hereden la confianza sin
 * tener que enumerar dominios. Los navegadores que no entienden `strict-dynamic`
 * recaen en `'self'`, que sigue siendo restrictivo.
 *
 * `style-src` sí lo admite, y la diferencia no es arbitraria: un estilo en línea
 * no ejecuta código. Prohibirlo obligaría a un nonce por atributo `style` de
 * React sin cerrar ninguna vía de ejecución.
 *
 * `connect-src` se limita al propio origen. Los de Stripe se añaden en la Fase 3,
 * que es cuando existen: declararlos hoy sería ensanchar la política por una
 * conexión que nadie hace todavía.
 */
function contentSecurityPolicy(nonce: string): string {
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ];
  return directivas.join('; ');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
