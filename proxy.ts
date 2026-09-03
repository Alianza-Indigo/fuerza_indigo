import { NextResponse, type NextRequest } from 'next/server';

/**
 * El proxy **no** consulta la base de datos ni decide autorizaciones
 * (ADR-0002). Solo propaga la correlación y la ruta, para que el registro y el
 * marco del panel dispongan de ellas. La autorización real la evalúa cada caso
 * de uso en el servidor: una comprobación aquí podría omitirse cambiando la
 * ruta, y eso no debe bastar para entrar a ningún sitio.
 */
export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  if (!headers.has('x-request-id')) headers.set('x-request-id', crypto.randomUUID());
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
