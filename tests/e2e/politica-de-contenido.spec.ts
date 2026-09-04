import { expect, test } from '@playwright/test';

/**
 * Política de contenido (docs/SECURITY.md §7).
 *
 * Se comprueba en el servidor que responde, no leyendo `proxy.ts`: la política
 * la emite una petición real y lo que importa es lo que llega al navegador.
 *
 * El caso de `form-action` no es teórico. Chromium aplica esa directiva a toda
 * la cadena de redirección, y con `'self'` a secas la redirección a la pasarela
 * no llega a salir: quien intenta pagar se queda mirando una página que no hace
 * nada, sin ningún error a la vista. Esta prueba existe para que nadie estreche
 * la directiva sin darse cuenta de que rompe el cobro.
 */

function directiva(politica: string, nombre: string): string {
  const encontrada = politica
    .split(';')
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${nombre} `));
  return encontrada ?? '';
}

test.describe('política de contenido', () => {
  test('deja saltar a la pasarela de cobro y a ningún otro destino', async ({ request }) => {
    const respuesta = await request.get('/');
    const politica = respuesta.headers()['content-security-policy'] ?? '';

    const formAction = directiva(politica, 'form-action');
    expect(formAction).toContain("'self'");
    expect(formAction).toContain('https://checkout.stripe.com');
    expect(formAction).toContain('https://billing.stripe.com');

    // Enumerada, no abierta: `*` o `https:` dejarían mandar el formulario a
    // cualquier sitio, que es la vía por la que se roban credenciales de un
    // formulario que la persona cree estar enviando a la organización.
    expect(formAction).not.toContain('*');
    expect(formAction).not.toMatch(/\bhttps:(\s|$)/);
  });

  test('no abre conexiones a la pasarela desde el navegador', async ({ request }) => {
    const respuesta = await request.get('/');
    const politica = respuesta.headers()['content-security-policy'] ?? '';

    // El cobro ocurre en una página alojada por la pasarela, a la que se
    // navega. Esta aplicación no le hace ninguna petición, y los datos de una
    // tarjeta no pasan por aquí ni un instante.
    expect(directiva(politica, 'connect-src')).toBe("connect-src 'self'");
    expect(directiva(politica, 'frame-src')).toBe("frame-src 'none'");
  });

  test('sigue sin admitir guiones en línea', async ({ request }) => {
    const respuesta = await request.get('/');
    const politica = respuesta.headers()['content-security-policy'] ?? '';

    const scriptSrc = directiva(politica, 'script-src');
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });
});
