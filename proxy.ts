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
 * `connect-src` sigue limitado al propio origen, incluso en la Fase 3: el cobro
 * ocurre en una página alojada por la pasarela, a la que se **navega**, y esta
 * aplicación no le hace ninguna petición desde el navegador. Los datos de una
 * tarjeta no pasan por aquí ni un instante (ADR-0055), así que no hay conexión
 * que permitir.
 *
 * `form-action` sí se ensancha, y es la única directiva que lo necesita. Ir a
 * pagar es el envío de un formulario que acaba en una redirección a la pasarela,
 * y Chromium aplica esta directiva a **toda la cadena de redirección**, no solo
 * al primer destino. Está comprobado en un navegador de verdad: con `'self'` a
 * secas, la petición a la pasarela no llega a salir y la consola dice que se
 * negó a enviar el formulario. Quien intenta pagar se queda mirando una página
 * que no hace nada, sin ningún error a la vista.
 *
 * Se enumeran los dos servidores que se usan y ninguno más.
 */
const PASARELA_DE_COBRO = ['https://checkout.stripe.com', 'https://billing.stripe.com'] as const;

function contentSecurityPolicy(nonce: string): string {
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    // El trabajador de servicio y el manifiesto son del propio origen. Se
    // declaran en vez de dejarlos caer en `default-src` porque un lector de la
    // política tiene que poder ver que la aplicación instalable está prevista,
    // y no deducirlo de una ausencia.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${PASARELA_DE_COBRO.join(' ')}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ];
  return directivas.join('; ');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
