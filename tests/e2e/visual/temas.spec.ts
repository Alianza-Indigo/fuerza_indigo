import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Pruebas visuales (F2-QA-001, docs/TEST_PLAN.md §3).
 *
 * **Por qué no son comparaciones de píxeles.** Una imagen de referencia
 * generada en una máquina y comparada en otra falla por cómo cada sistema
 * suaviza los bordes de la tipografía, no por el producto. Una suite que falla
 * por razones sobre las que nadie puede actuar acaba desactivada, y entonces no
 * atrapa nada. La comparación píxel a píxel existe aquí como opción para quien
 * quiera correrla en su máquina —`E2E_VISUAL=1`, con sus referencias locales—,
 * y lo que entra en la puerta de calidad es lo que sí es determinista.
 *
 * Lo determinista es lo que de verdad se quiere garantizar: que los dos temas
 * pintan de verdad y son distintos, que el color que sale es el del token y no
 * uno heredado por accidente, que las preferencias cambian lo que dicen que
 * cambian, y que nada se sale del ancho a 360 px.
 *
 * Cada caso adjunta su captura al informe, de modo que sigue habiendo material
 * para una revisión humana sin convertirlo en una condición automática.
 */

const RUTAS = ['/', '/solicitar-apoyo', '/accesibilidad', '/noticias'];
const COMPARAR_PIXELES = process.env['E2E_VISUAL'] === '1';

/** Color de fondo y de texto que el navegador acaba aplicando al cuerpo. */
async function coloresDelCuerpo(page: Page): Promise<{ fondo: string; texto: string }> {
  return page.evaluate(() => {
    const estilo = getComputedStyle(document.body);
    return { fondo: estilo.backgroundColor, texto: estilo.color };
  });
}

async function adjuntar(page: Page, nombre: string, testInfo: TestInfo) {
  await testInfo.attach(nombre, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

for (const ruta of RUTAS) {
  test.describe(ruta, () => {
    test('los dos temas pintan y son distintos', async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(ruta);
      const claro = await coloresDelCuerpo(page);
      await adjuntar(page, `${ruta} claro`, testInfo);

      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(ruta);
      const oscuro = await coloresDelCuerpo(page);
      await adjuntar(page, `${ruta} oscuro`, testInfo);

      // Ni transparente ni heredado: el cuerpo pinta su propio fondo. Sin esto,
      // la página toma el color del contenedor y en tema oscuro se ve un
      // rectángulo blanco detrás del texto claro.
      expect(claro.fondo, 'el tema claro no pinta fondo').not.toBe('rgba(0, 0, 0, 0)');
      expect(oscuro.fondo, 'el tema oscuro no pinta fondo').not.toBe('rgba(0, 0, 0, 0)');

      expect(oscuro.fondo, 'los dos temas pintan el mismo fondo').not.toBe(claro.fondo);
      expect(oscuro.texto, 'los dos temas pintan el mismo texto').not.toBe(claro.texto);
    });

    test('el tema fijado a mano gana sobre el del sistema', async ({ page }) => {
      // Alguien que fija el tema claro con el sistema en oscuro tiene que ver
      // claro. Es la razón de que los tokens se declaren tres veces en la hoja
      // de estilos, y esto lo comprueba de punta a punta.
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.context().addCookies([
        { name: 'fi_prefs', value: JSON.stringify({ theme: 'claro' }), url: 'http://127.0.0.1:3000' },
      ]);
      await page.goto(ruta);

      const tema = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(tema).toBe('light');

      const { fondo } = await coloresDelCuerpo(page);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.context().clearCookies();
      await page.goto(ruta);
      const { fondo: fondoClaroDelSistema } = await coloresDelCuerpo(page);

      expect(fondo, 'el tema fijado no coincide con el claro del sistema').toBe(fondoClaroDelSistema);
    });

    test('a 360 px la página no se sale de su ancho', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(ruta);

      const desbordamiento = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desbordamiento).toBeLessThanOrEqual(1);
    });

    test('coincide con su referencia', async ({ page }) => {
      // La condición va dentro y no en el bloque: `test.skip` con condición en
      // el cuerpo de un `describe` salta **todas** las pruebas del bloque, no
      // solo esta, y dejaba la suite entera sin correr sin decirlo.
      test.skip(!COMPARAR_PIXELES, 'La comparación de píxeles se activa con E2E_VISUAL=1.');

      await page.goto(ruta);
      await expect(page).toHaveScreenshot({ fullPage: true, maxDiffPixelRatio: 0.01 });
    });
  });
}

test.describe('preferencias sensoriales', () => {
  test('el tamaño de texto grande agranda el texto de verdad', async ({ page }) => {
    await page.goto('/solicitar-apoyo');
    const normal = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));

    await page.context().addCookies([
      { name: 'fi_prefs', value: JSON.stringify({ text: 'grande' }), url: 'http://127.0.0.1:3000' },
    ]);
    await page.goto('/solicitar-apoyo');
    const grande = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));

    expect(grande, 'la preferencia de texto grande no agranda nada').toBeGreaterThan(normal);
  });

  test('el modo de enfoque atenúa lo secundario sin esconderlo', async ({ page }) => {
    await page.context().addCookies([
      { name: 'fi_prefs', value: JSON.stringify({ focus: 'activo' }), url: 'http://127.0.0.1:3000' },
    ]);
    await page.goto('/solicitar-apoyo');

    expect(await page.evaluate(() => document.documentElement.getAttribute('data-focus'))).toBe('activo');

    const secundario = page.locator('[data-secondary]').first();
    if ((await secundario.count()) > 0) {
      const opacidad = await secundario.evaluate((elemento) => parseFloat(getComputedStyle(elemento).opacity));
      // Atenuado, no oculto: nada desaparece, y por eso sigue teniendo opacidad.
      expect(opacidad).toBeLessThan(1);
      expect(opacidad).toBeGreaterThan(0);
    }
  });
});
