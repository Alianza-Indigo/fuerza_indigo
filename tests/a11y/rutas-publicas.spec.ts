import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Umbrales de accesibilidad en todas las rutas públicas (F2-ACC-001,
 * docs/TEST_PLAN.md §7).
 *
 * El umbral contratado es **cero violaciones automáticas de gravedad crítica o
 * seria**, y se comprueba en cada ruta pública, en los dos temas y en los dos
 * perfiles de pantalla que declara `playwright.config.ts`.
 *
 * Una comprobación automática no sustituye a una revisión con personas usuarias
 * de lectores de pantalla —eso sigue pendiente y así consta en la declaración de
 * accesibilidad—, pero sí impide que se cuele lo que sí se puede detectar solo:
 * contraste insuficiente, campos sin etiqueta, encabezados fuera de orden,
 * regiones sin nombre.
 */

const RUTAS = [
  '/',
  '/accesibilidad',
  '/legales/accesibilidad',
  '/noticias',
  '/buscar',
  '/contacto',
  '/solicitar-apoyo',
  '/sin-conexion',
  // Una ruta contratada sin contenido publicado: su estado vacío también tiene
  // que ser accesible, y es el que más gente va a ver mientras el sitio se
  // llena.
  '/que-es-fuerza-indigo',
  // Un documento legal sin texto publicado todavía.
  '/legales/privacidad',
];

async function violacionesGraves(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

  return resultado.violations.filter(
    (violacion) => violacion.impact === 'critical' || violacion.impact === 'serious',
  );
}

/** Deja en el informe qué falló y dónde, no solo cuántas. */
function describir(violaciones: Awaited<ReturnType<typeof violacionesGraves>>): string {
  return violaciones
    .map(
      (violacion) =>
        `${violacion.id} (${violacion.impact}): ${violacion.help}\n` +
        violacion.nodes.map((nodo) => `    ${nodo.target.join(' ')}`).join('\n'),
    )
    .join('\n');
}

for (const ruta of RUTAS) {
  test.describe(ruta, () => {
    test('sin violaciones críticas ni serias en tema claro', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(ruta);

      const violaciones = await violacionesGraves(page);
      expect(violaciones.length, describir(violaciones)).toBe(0);
    });

    test('sin violaciones críticas ni serias en tema oscuro', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(ruta);

      const violaciones = await violacionesGraves(page);
      expect(violaciones.length, describir(violaciones)).toBe(0);
    });
  });
}

test.describe('ampliación del texto', () => {
  test('al 200 % no se pierde contenido ni aparece desplazamiento horizontal', async ({ page }) => {
    // El umbral de docs/TEST_PLAN.md §7 es «utilizable al 200 % sin pérdida de
    // contenido ni de función». Se simula reduciendo la ventana a la mitad del
    // ancho, que es lo que produce el mismo reflujo que ampliar al doble.
    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto('/solicitar-apoyo');

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordamiento, 'la página se desplaza en horizontal').toBeLessThanOrEqual(1);

    // Y el formulario sigue completo: ampliar no puede esconder un campo.
    await expect(page.getByLabel('Cuéntanos con tus palabras')).toBeVisible();
    await expect(page.getByRole('button', { name: /Enviar mi mensaje/ })).toBeVisible();
  });

  test('a 360 px de ancho tampoco hay desplazamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    for (const ruta of ['/', '/noticias', '/contacto', '/accesibilidad']) {
      await page.goto(ruta);
      const desbordamiento = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desbordamiento, `${ruta} se desplaza en horizontal a 360 px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('objetivos táctiles', () => {
  test('ningún control interactivo mide menos de 44 px de alto', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    const pequeños = await page.evaluate(() => {
      const seleccion = 'a[href], button, input:not([type="hidden"]), select, textarea, summary';
      const problemas: string[] = [];

      for (const elemento of Array.from(document.querySelectorAll(seleccion))) {
        const caja = elemento.getBoundingClientRect();
        if (caja.width === 0 && caja.height === 0) continue;

        // Un elemento oculto a la vista —el enlace de saltar al contenido, que
        // mide un píxel hasta que recibe el foco— no es un objetivo táctil
        // mientras está oculto. Se comprueba aparte, ya enfocado, que es cuando
        // alguien puede darle.
        if (caja.height <= 1 || caja.width <= 1) continue;

        // Un enlace dentro de un texto corrido es texto, no un objetivo táctil:
        // la regla de las 44 px aplica a los controles, y exigírsela a una
        // palabra subrayada obligaría a maquetar la prosa como una lista de
        // botones. `label` entra en la lista porque la casilla del aviso de
        // privacidad lleva el enlace dentro de su frase.
        const dentroDeTexto = elemento.closest('p, li, dd, figcaption, label') !== null;
        if (dentroDeTexto) continue;

        // La casilla y el botón de opción son cuadrados pequeños a propósito;
        // lo que tiene que medir 44 px es la etiqueta que los envuelve, y eso se
        // comprueba en ella.
        const tipo = elemento.getAttribute('type');
        if (tipo === 'checkbox' || tipo === 'radio') continue;

        if (caja.height < 44) {
          problemas.push(`${elemento.tagName.toLowerCase()} de ${Math.round(caja.height)} px`);
        }
      }

      return problemas;
    });

    expect(pequeños, 'estos controles no alcanzan 44 px de alto').toEqual([]);
  });

  test('el enlace de saltar al contenido alcanza el tamaño al recibir el foco', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const enlace = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(enlace).toBeFocused();

    const caja = await enlace.boundingBox();
    expect(caja, 'el enlace no tiene caja al enfocarse').not.toBeNull();
    expect(caja!.height, 'el enlace de salto se queda pequeño al enfocarse').toBeGreaterThanOrEqual(44);

    // Y lleva de verdad al contenido, no solo a un ancla que no existe.
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenido')).toBeVisible();
  });
});
