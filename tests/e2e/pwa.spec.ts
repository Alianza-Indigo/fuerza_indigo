import { expect, test } from '@playwright/test';

/**
 * Aplicación instalable (F2-PWA-001/002/003, criterio 5 de la fase).
 *
 * Lo que se comprueba aquí no lo puede comprobar una prueba unitaria: que el
 * manifiesto que sirve el servidor sea el que el navegador necesita para
 * ofrecer la instalación, que el trabajador de servicio se registre de verdad,
 * y —lo que importa— que **después de navegar por zonas con sesión no quede
 * nada de ellas en la caché del dispositivo**.
 */

test.describe('manifiesto e iconos', () => {
  test('el manifiesto tiene lo que exige una instalación', async ({ page, request }) => {
    await page.goto('/');

    const enlace = page.locator('link[rel="manifest"]');
    await expect(enlace).toHaveCount(1);

    const respuesta = await request.get('/manifest.webmanifest');
    expect(respuesta.status()).toBe(200);

    const manifiesto = (await respuesta.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: { sizes: string; purpose?: string }[];
    };

    expect(manifiesto.name).toBe('Fuerza Índigo');
    expect(manifiesto.display).toBe('standalone');
    // Empieza en la portada y no en una pantalla de acceso: quien instala desde
    // el sitio público casi nunca tiene cuenta.
    expect(manifiesto.start_url).toBe('/');
    expect(manifiesto.icons.some((icono) => icono.sizes === '192x192')).toBe(true);
    expect(manifiesto.icons.some((icono) => icono.sizes === '512x512')).toBe(true);
    expect(manifiesto.icons.some((icono) => icono.purpose === 'maskable')).toBe(true);
  });

  test('los iconos existen y no están vacíos', async ({ request }) => {
    for (const ruta of ['/icono.svg', '/icono-192.png', '/icono-512.png', '/apple-touch-icon.png']) {
      const respuesta = await request.get(ruta);
      expect(respuesta.status(), `${ruta} no se sirve`).toBe(200);
      // Un umbral bajo a propósito: lo que se comprueba es que el archivo
      // tenga contenido, no que pese algo en concreto. Una marca tipográfica en
      // SVG son cuatrocientos bytes y está completa.
      expect((await respuesta.body()).byteLength, `${ruta} está vacío`).toBeGreaterThan(200);
    }
  });
});

test.describe('caché', () => {
  test('el trabajador de servicio se registra y controla la página', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });

    const alcance = await page.evaluate(async () => {
      const registro = await navigator.serviceWorker.getRegistration();
      return registro?.scope ?? '';
    });
    expect(alcance).toMatch(/\/$/);
  });

  test('no guarda nada de las zonas con sesión', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });

    // Se recorren rutas con sesión. Ninguna requiere estar dentro: lo que se
    // comprueba es que su respuesta no acabe guardada, tanto si redirige al
    // acceso como si devuelve el formulario.
    for (const ruta of ['/acceso', '/gestion/mensajes', '/superadmin', '/mi/seguridad']) {
      await page.goto(ruta, { waitUntil: 'domcontentloaded' });
    }
    await page.goto('/');

    const guardadas = await page.evaluate(async () => {
      const nombres = await caches.keys();
      const rutas: string[] = [];
      for (const nombre of nombres) {
        const cache = await caches.open(nombre);
        for (const peticion of await cache.keys()) rutas.push(new URL(peticion.url).pathname);
      }
      return rutas;
    });

    const prohibidas = guardadas.filter((ruta) =>
      ['/api/', '/gestion', '/superadmin', '/mi/', '/acceso', '/activar', '/recuperar'].some(
        (zona) => ruta === zona || ruta.startsWith(zona),
      ),
    );

    expect(prohibidas, 'la caché guardó rutas con sesión').toEqual([]);
  });

  test('no guarda ninguna página del sitio, ni siquiera la portada', async ({ page, request }) => {
    // El servidor marca cada página `private, no-store` porque se pinta por
    // persona: el tema, el tamaño del texto y la densidad salen de una cookie y
    // viajan en el `<html>`. En un teléfono prestado, servir la portada
    // guardada mostraría las preferencias de quien lo usó antes.
    const portada = await request.get('/');
    expect(portada.headers()['cache-control']).toContain('no-store');

    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
    await page.goto('/noticias');
    await page.goto('/');

    const guardadas = await page.evaluate(async () => {
      const nombres = await caches.keys();
      const rutas: string[] = [];
      for (const nombre of nombres) {
        const cache = await caches.open(nombre);
        for (const peticion of await cache.keys()) rutas.push(new URL(peticion.url).pathname);
      }
      return rutas;
    });

    // La única página guardada es la de sin conexión, y se guarda al instalarse
    // y no al navegar: una pantalla de sin conexión que hubiera que descargar
    // cuando ya no hay conexión no existiría nunca.
    const paginas = guardadas.filter((ruta) => !ruta.startsWith('/_next/'));
    expect(paginas).toEqual(['/sin-conexion']);

    // Los estáticos compilados sí: llevan huella en el nombre, así que nunca
    // cambian de contenido sin cambiar de dirección, y son lo que hace que la
    // aplicación abra rápido en una red lenta.
    expect(guardadas.some((ruta) => ruta.startsWith('/_next/static/'))).toBe(true);
  });

  test('sin red, una página no guardada cae en la pantalla de sin conexión', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });

    await context.setOffline(true);
    try {
      await page.goto('/transparencia', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Estás sin conexión', level: 1 })).toBeVisible();
      await expect(page.getByText('911')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('sin red se avisa en todas las páginas', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    try {
      await expect(page.getByText('Estás sin conexión.')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByText('Estás sin conexión.')).toBeHidden();
  });
});
