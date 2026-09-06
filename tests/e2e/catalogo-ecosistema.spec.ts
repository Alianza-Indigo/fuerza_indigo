import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Una dirección de verdad, puesta y quitada por esta prueba.
 *
 * Sin ella, las comprobaciones sobre el enlace recorrerían **cero enlaces** y
 * pasarían sin ejercitar nada: la base de desarrollo llega con las cinco fichas
 * sin dirección, que es el estado de una instalación recién desplegada. Una
 * prueba que pasa por no tener nada que mirar no prueba nada.
 *
 * Se pone sobre NEXO —la última del catálogo— y se retira al terminar, para que
 * el resto de la suite y la siguiente ejecución encuentren la base como estaba.
 */
const FICHA_CON_ACCESO = 'NEXO';
const DIRECCION_DE_PRUEBA = 'https://ejemplo-de-prueba.invalid/acceso';

async function conLaBase<T>(trabajo: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: process.env['DIRECT_URL'] });
  await cliente.connect();
  try {
    return await trabajo(cliente);
  } finally {
    await cliente.end();
  }
}

test.beforeAll(async () => {
  await conLaBase((cliente) =>
    cliente.query('UPDATE ecosystem_link SET "externalUrl" = $1 WHERE code = $2', [
      DIRECCION_DE_PRUEBA,
      FICHA_CON_ACCESO,
    ]),
  );
});

test.afterAll(async () => {
  await conLaBase((cliente) =>
    cliente.query('UPDATE ecosystem_link SET "externalUrl" = NULL WHERE code = $1', [FICHA_CON_ACCESO]),
  );
});

/**
 * El catálogo del ecosistema, en el navegador (PRD §12; F7-QA-001, F7-QA-002).
 *
 * Lo que se comprueba aquí no se puede comprobar desde la integración: cómo
 * queda el enlace **en la página**. Que la dirección viaje sin datos de nadie,
 * que se abra en otra pestaña sin darle a esa pestaña el control de esta, y que
 * el aviso de salida esté en el texto del enlace y no solo en un adorno.
 *
 * La base de desarrollo llega con las cinco fichas y **sin direcciones**, que es
 * el estado de una instalación recién desplegada. Ese estado también se prueba:
 * es el que más gente va a ver, y una ficha sin acceso no debe parecer rota.
 */
test.describe('catálogo del ecosistema', () => {
  test('enseña las fichas del ecosistema con qué es cada una y para quién', async ({ page }) => {
    await page.goto('/herramientas');

    await expect(page.getByRole('heading', { level: 1, name: /plataformas y herramientas/i })).toBeVisible();

    for (const nombre of ['CIAN', 'CENI', 'NeuroPlan', 'ADIA', 'NEXO']) {
      await expect(page.getByRole('heading', { level: 3, name: nombre, exact: true })).toBeVisible();
    }

    await expect(page.getByText(/para quién es/i).first()).toBeVisible();
  });

  test('dice, antes de pulsar, que se sale de Fuerza Índigo', async ({ page }) => {
    await page.goto('/herramientas');

    const enlaces = page.getByRole('link', { name: /se abre otra plataforma, fuera de Fuerza Índigo/i });
    const total = await enlaces.count();

    // Si esto fuera cero, lo de abajo pasaría sin mirar nada.
    expect(total).toBeGreaterThan(0);

    // Cada acceso configurado avisa en su propio nombre accesible, que es lo
    // que oye quien navega con lector de pantalla.
    for (let i = 0; i < total; i += 1) {
      const enlace = enlaces.nth(i);
      await expect(enlace).toHaveAttribute('target', '_blank');
      await expect(enlace).toHaveAttribute('rel', /noopener/);
      await expect(enlace).toHaveAttribute('rel', /noreferrer/);

      const href = await enlace.getAttribute('href');
      expect(href).not.toBeNull();
      expect(href!.startsWith('https://')).toBe(true);
    }
  });

  test('una ficha sin dirección configurada no enseña un botón que no lleva a ninguna parte', async ({
    page,
  }) => {
    await page.goto('/herramientas');

    const enlacesExternos = page.locator('a[target="_blank"]');
    const accesos = await enlacesExternos.count();
    const avisos = await page.getByText(/todavía no está configurado/i).count();

    // Cinco fichas: cada una tiene o su acceso o su explicación, nunca las dos
    // ni ninguna. Un botón deshabilitado no cuenta como explicación: sigue
    // pareciendo algo roto.
    expect(accesos + avisos).toBe(5);
    expect(await page.getByRole('link', { disabled: true }).count()).toBe(0);
    expect(await page.locator('button[disabled]').count()).toBe(0);
  });

  test('ninguna dirección de acceso lleva datos de quien la pulsa', async ({ page }) => {
    await page.goto('/herramientas');

    const enlaces = await page.locator('a[target="_blank"]').all();
    expect(enlaces.length).toBeGreaterThan(0);
    for (const enlace of enlaces) {
      const href = (await enlace.getAttribute('href')) ?? '';
      const url = new URL(href);
      expect([...url.searchParams.keys()]).toEqual([]);
      for (const rastro of ['token', 'email', 'correo', 'user', 'usuario', 'id=', 'sid', 'jwt']) {
        expect(href.toLowerCase()).not.toContain(rastro);
      }
    }
  });

  test('el catálogo es el mismo desde el portal de una persona con sesión', async ({ page }) => {
    const correo = process.env['E2E_EMAIL_PERSONA'];
    const clave = process.env['E2E_PASSWORD'];
    test.skip(correo === undefined || clave === undefined, 'Faltan las credenciales de prueba.');

    await page.goto('/acceso');
    await page.fill('#email', correo!);
    await page.fill('#password', clave!);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => !url.pathname.startsWith('/acceso'), { timeout: 30_000 });

    await page.goto('/mi/herramientas');
    for (const nombre of ['CIAN', 'CENI', 'NeuroPlan', 'ADIA', 'NEXO']) {
      await expect(page.getByRole('heading', { level: 3, name: nombre, exact: true })).toBeVisible();
    }

    // Tener cuenta no desbloquea nada: el PRD §12.4 es explícito en que no hay
    // elegibilidad ni derechos de acceso, y una ficha de más aquí insinuaría lo
    // contrario.
    await expect(page.getByText(/tu cuenta de Fuerza Índigo no entra/i)).toBeVisible();
  });
});
