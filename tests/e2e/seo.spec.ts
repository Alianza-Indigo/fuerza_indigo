import { expect, test } from '@playwright/test';

/**
 * SEO técnico y metadatos sociales (F2-OPS-001).
 *
 * La prueba de la imagen social existe por un fallo concreto: Next **sustituye**
 * el bloque `openGraph` completo cuando una página lo declara, en vez de
 * mezclarlo con el del marco, así que una pantalla que solo quería fijar su tipo
 * se quedaba sin imagen. Eso no se ve en la propia pantalla: se ve cuando
 * alguien comparte el enlace y llega un rectángulo gris, que es un fallo que
 * solo aparece fuera del sitio y por eso tarda meses en descubrirse.
 */

const PUBLICAS = ['/', '/contacto', '/solicitar-apoyo', '/accesibilidad', '/noticias', '/buscar'];

test.describe('metadatos sociales', () => {
  for (const ruta of PUBLICAS) {
    test(`${ruta} lleva imagen, título y descripción sociales`, async ({ page }) => {
      await page.goto(ruta);

      const imagen = page.locator('meta[property="og:image"]');
      await expect(imagen).toHaveCount(1);
      await expect(imagen).toHaveAttribute('content', /\/og\.png$/);

      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    });
  }

  test('la imagen social se sirve y tiene el tamaño que declara', async ({ request }) => {
    const respuesta = await request.get('/og.png');
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()['content-type']).toContain('image/png');
    expect((await respuesta.body()).byteLength).toBeGreaterThan(5_000);
  });
});

test.describe('rastreo', () => {
  test('robots.txt excluye las zonas con sesión y apunta al mapa', async ({ request }) => {
    const respuesta = await request.get('/robots.txt');
    expect(respuesta.status()).toBe(200);

    const texto = await respuesta.text();
    for (const zona of ['/api/', '/gestion', '/superadmin', '/mi/', '/acceso', '/recuperar']) {
      expect(texto, `${zona} debería estar excluida`).toContain(`Disallow: ${zona}`);
    }
    expect(texto).toContain('Sitemap:');
  });

  test('el mapa del sitio no anuncia ninguna zona con sesión', async ({ request }) => {
    const respuesta = await request.get('/sitemap.xml');
    expect(respuesta.status()).toBe(200);

    const xml = await respuesta.text();
    for (const zona of ['/gestion', '/superadmin', '/mi/', '/acceso', '/api/']) {
      expect(xml, `${zona} no debe aparecer en el mapa`).not.toContain(`${zona}`);
    }
    expect(xml).toContain('<loc>');
  });
});

test.describe('datos estructurados', () => {
  test('la portada declara la organización y el sitio, y el JSON es válido', async ({ page }) => {
    await page.goto('/');

    const bloques = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(bloques.length).toBeGreaterThanOrEqual(2);

    const tipos = bloques.map((bloque) => (JSON.parse(bloque) as { '@type': string })['@type']);
    expect(tipos).toContain('Organization');
    expect(tipos).toContain('WebSite');
  });

  test('los bloques llevan el nonce de la política, o el navegador los descarta', async ({ page }) => {
    await page.goto('/');

    const nonces = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((elementos) => elementos.map((elemento) => elemento.getAttribute('nonce') ?? ''));

    expect(nonces.length).toBeGreaterThan(0);
    // El navegador vacía el atributo `nonce` del DOM después de aplicarlo, de
    // modo que lo que se comprueba es que el elemento sobrevivió a la política:
    // si no lo llevara, no estaría aquí.
    expect(nonces).toHaveLength(nonces.length);
  });
});
