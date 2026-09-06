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

/**
 * La administración del catálogo, en el navegador (F7-UI-002).
 *
 * Se prueba desde la pantalla y no solo desde la integración porque lo que aquí
 * puede fallar es de pantalla: que el formulario no llegue al caso de uso, que
 * el cambio no se vea en el sitio público hasta el siguiente despliegue, o que
 * cinco formularios iguales en una misma página se pisen los identificadores y
 * dejen campos sin etiqueta.
 */
const DIRECCION_ADMIN = 'https://adia-de-prueba.invalid/entrar';

test.afterAll(async () => {
  // La prueba de administración escribe de verdad, porque escribir de verdad es
  // lo que prueba. Se deshace al terminar para que la base quede como estaba.
  await conLaBase((cliente) =>
    cliente.query('UPDATE ecosystem_link SET "externalUrl" = NULL WHERE code = $1', ['ADIA']),
  );
});

test.describe('administrar el catálogo', () => {
  test('cambiar la dirección desde el gestor se ve en el sitio público sin desplegar nada', async ({
    page,
  }) => {
    const correo = process.env['E2E_EMAIL_COMUNICACION'];
    const clave = process.env['E2E_PASSWORD'];
    test.skip(correo === undefined || clave === undefined, 'Faltan las credenciales de prueba.');

    await page.goto('/acceso');
    await page.fill('#email', correo!);
    await page.fill('#password', clave!);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => !url.pathname.startsWith('/acceso'), { timeout: 30_000 });

    await page.goto('/gestion/contenidos/ecosistema');
    await expect(page.getByRole('heading', { level: 1, name: /catálogo del ecosistema/i })).toBeVisible();

    // ADIA llega sin dirección: en el sitio público no tiene botón.
    await page.goto('/herramientas');
    await expect(
      page.getByRole('link', { name: /Ir a ADIA \(se abre otra plataforma/i }),
    ).toHaveCount(0);

    await page.goto('/gestion/contenidos/ecosistema');
    const tarjetaAdia = page.locator('li', { has: page.getByRole('heading', { name: 'ADIA', exact: true }) });
    // Se busca por su etiqueta y no por un identificador: si las cinco fichas
    // compartieran identificador, esto encontraría el campo de otra ficha —o
    // ninguno—, que es justo el defecto que se quiere que no vuelva.
    await tarjetaAdia.getByLabel(/dirección de acceso/i).fill(DIRECCION_ADMIN);
    await tarjetaAdia.getByRole('button', { name: /guardar ficha/i }).click();

    await expect(page.getByText(/ficha guardada/i).first()).toBeVisible();

    await page.goto('/herramientas');
    const acceso = page.getByRole('link', { name: /Ir a ADIA \(se abre otra plataforma/i });
    await expect(acceso).toHaveAttribute('href', DIRECCION_ADMIN);
    await expect(acceso).toHaveAttribute('rel', /noopener/);
  });

  test('quien no administra el catálogo no llega a la pantalla', async ({ page }) => {
    const correo = process.env['E2E_EMAIL_PERSONA'];
    const clave = process.env['E2E_PASSWORD'];
    test.skip(correo === undefined || clave === undefined, 'Faltan las credenciales de prueba.');

    await page.goto('/acceso');
    await page.fill('#email', correo!);
    await page.fill('#password', clave!);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => !url.pathname.startsWith('/acceso'), { timeout: 30_000 });

    await page.goto('/gestion/contenidos/ecosistema');
    await expect(page.getByRole('link', { name: /catálogo del ecosistema/i })).toHaveCount(0);
    await expect(page.getByText(/no tienes autorización|no encontrada/i).first()).toBeVisible();
  });
});

test.describe('el logotipo de una ficha', () => {
  // Un PNG mínimo de verdad. La carga comprueba que el contenido corresponda
  // con el tipo declarado, así que un archivo inventado no pasaría.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  test.afterAll(async () => {
    await conLaBase((cliente) =>
      cliente.query('UPDATE ecosystem_link SET "logoFileId" = NULL WHERE code = $1', ['NEUROPLAN']),
    );
  });

  test('se carga desde el gestor y se ve en el catálogo público, con su texto alternativo', async ({
    page,
  }) => {
    const correo = process.env['E2E_EMAIL_COMUNICACION'];
    const clave = process.env['E2E_PASSWORD'];
    test.skip(correo === undefined || clave === undefined, 'Faltan las credenciales de prueba.');

    await page.goto('/acceso');
    await page.fill('#email', correo!);
    await page.fill('#password', clave!);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => !url.pathname.startsWith('/acceso'), { timeout: 30_000 });

    // Antes: la ficha existe y no tiene imagen. Sin esta comprobación, lo de
    // abajo podría estar mirando una imagen que ya estaba.
    await page.goto('/herramientas');
    await expect(page.getByRole('img', { name: /logotipo de neuroplan/i })).toHaveCount(0);

    await page.goto('/gestion/contenidos/ecosistema');
    const tarjeta = page.locator('li', {
      has: page.getByRole('heading', { name: 'NeuroPlan', exact: true }),
    });
    await tarjeta
      .getByLabel(/^logotipo$/i)
      .setInputFiles({ name: 'neuroplan.png', mimeType: 'image/png', buffer: PNG });
    await tarjeta.getByRole('button', { name: /guardar logotipo/i }).click();
    await expect(page.getByText(/logotipo guardado/i).first()).toBeVisible();

    // Y ahora sí: la imagen sale en el catálogo público, sin sesión de por
    // medio, y con un texto alternativo que dice de quién es —«logotipo» a
    // secas no le sirve a quien no ve la imagen—.
    await page.context().clearCookies();
    await page.goto('/herramientas');
    const logotipo = page.getByRole('img', { name: /logotipo de neuroplan/i });
    await expect(logotipo).toBeVisible();

    // La ruta que sirve la imagen responde, y responde una imagen. Se comprueba
    // aparte del elemento porque son dos fallos distintos y conviene saber cuál
    // es: la tarjeta puede pintar el hueco perfectamente mientras la ruta
    // devuelve 404.
    const respuesta = await page.request.get('/herramientas/logotipo/NEUROPLAN');
    expect(respuesta.status(), await respuesta.text()).toBe(200);
    expect(respuesta.headers()['content-type']).toContain('image/');
    expect((await respuesta.body()).byteLength).toBeGreaterThan(0);

    // Y que **cargue de verdad**. Comprobar solo que el elemento está no dice
    // nada: una imagen rota sigue siendo un elemento visible, con su texto
    // alternativo y su hueco. Se pide el ancho natural, que solo tiene una
    // imagen que el navegador consiguió decodificar.
    await expect
      .poll(async () => logotipo.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });
});
