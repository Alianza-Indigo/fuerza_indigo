import { expect, test } from '@playwright/test';

/**
 * Entrada pública de contacto y solicitudes (F2-UI-010, PRD §10.1).
 *
 * Comprueba lo que ninguna prueba de integración puede comprobar: que el
 * formulario que ve una persona esté conectado al caso de uso, que se pueda
 * completar entero con el teclado y que el aviso de urgencia aparezca cuando
 * hace falta.
 */

test.describe('solicitar apoyo', () => {
  test('se puede enviar y devuelve un folio', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    await expect(page.getByRole('heading', { name: 'Solicitar apoyo', level: 1 })).toBeVisible();

    await page.getByRole('radio', { name: /Un problema en mi trabajo/ }).check();
    await page.getByLabel('¿Cómo quieres que te llamemos?').fill('Persona De Prueba');
    await page.getByLabel('Tu correo').fill('prueba@ejemplo.mx');
    await page.getByLabel('En una línea, ¿qué pasa?').fill('Me despidieron tras pedir un ajuste');
    await page
      .getByLabel('Cuéntanos con tus palabras')
      .fill('Llevo tres años en la empresa y me despidieron después de pedir por escrito un ajuste razonable.');
    await page.getByRole('checkbox').check();

    await page.getByRole('button', { name: /Enviar mi mensaje/ }).click();

    await expect(page.getByText('Recibimos tu mensaje')).toBeVisible();
    // El folio es lo único que se lleva quien escribe: si no aparece, no tiene
    // con qué referirse a su mensaje.
    await expect(page.locator('strong.font-mono')).toHaveText(/^[A-Z]+-\d{4}-[A-Z0-9]{8}$/);
  });

  test('elegir urgencia enseña a dónde llamar de verdad', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    await page.getByRole('radio', { name: /Violencia o urgencia/ }).check();

    await expect(page.getByRole('alert').filter({ hasText: '911' })).toBeVisible();
  });

  test('no envía sin aceptar el aviso de privacidad', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    await page.getByRole('radio', { name: /Un problema en mi trabajo/ }).check();
    await page.getByLabel('¿Cómo quieres que te llamemos?').fill('Sin Aceptar');
    await page.getByLabel('Tu correo').fill('sin.aceptar@ejemplo.mx');
    await page.getByLabel('En una línea, ¿qué pasa?').fill('Una prueba');
    await page
      .getByLabel('Cuéntanos con tus palabras')
      .fill('Este mensaje no debería guardarse porque no acepté el aviso de privacidad.');

    await page.getByRole('button', { name: /Enviar mi mensaje/ }).click();

    await expect(page.getByText('Recibimos tu mensaje')).toBeHidden();
  });

  test('se completa entero con el teclado y el foco siempre se ve', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    const alcanzados = new Set<string>();
    const sinFoco: string[] = [];

    // Un recorrido acotado: lo que importa es que los controles del formulario
    // aparezcan en el orden de lectura, no agotar la página. Al terminar los
    // elementos enfocables, el foco sale a la barra del navegador y
    // `document.activeElement` vuelve a ser `body`: eso no es un control sin
    // anillo de foco, es que ya no hay control, y por eso se descarta.
    for (let paso = 0; paso < 60; paso += 1) {
      await page.keyboard.press('Tab');
      const enfocado = await page.evaluate(() => {
        const activo = document.activeElement;
        if (!(activo instanceof HTMLElement) || activo === document.body) return null;
        const estilo = getComputedStyle(activo);
        return {
          nombre: activo.getAttribute('name') ?? activo.tagName,
          visible: estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) >= 2,
        };
      });
      if (enfocado === null) continue;
      alcanzados.add(enfocado.nombre);
      if (!enfocado.visible) sinFoco.push(enfocado.nombre);
    }

    for (const campo of ['requestType', 'contactName', 'contactEmail', 'subject', 'narrative', 'acceptedPrivacyNotice']) {
      expect(alcanzados.has(campo), `no se alcanzó ${campo} con el teclado`).toBe(true);
    }
    expect(sinFoco, 'estos controles se enfocan sin que se vea').toEqual([]);
  });
});

test.describe('contacto', () => {
  test('avisa que no es un canal de urgencias y enlaza con solicitar apoyo', async ({ page }) => {
    await page.goto('/contacto');

    await expect(page.getByText('Esto no es un canal de urgencias')).toBeVisible();
    await page.getByRole('link', { name: 'Solicitar apoyo' }).first().click();
    await expect(page).toHaveURL(/\/solicitar-apoyo$/);
  });
});
