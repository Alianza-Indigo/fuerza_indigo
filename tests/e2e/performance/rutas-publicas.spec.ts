import { expect, test, type Page } from '@playwright/test';

/**
 * Umbrales de rendimiento de las rutas públicas (F2-QA-002,
 * docs/TEST_PLAN.md §8).
 *
 * Los tres que esta fase puede medir de verdad:
 *
 *  · **LCP ≤ 2.5 s** en móvil simulado con red lenta.
 *  · **CLS ≤ 0.1** en todas las rutas públicas.
 *  · **INP ≤ 200 ms** en los formularios.
 *
 * Los otros umbrales de la tabla —verificador de códigos, emisión de boletas
 * bajo concurrencia, consulta de padrón, procesamiento de webhooks— dependen de
 * módulos que todavía no existen y se miden en sus fases. Ponerles una prueba
 * ahora sería una prueba sin sujeto.
 *
 * La medición se toma del propio navegador con `PerformanceObserver`, no de un
 * cronómetro alrededor de `goto()`: lo que importa no es cuándo respondió el
 * servidor sino cuándo la persona vio algo, que es lo que dice la métrica.
 */

const RUTAS = ['/', '/noticias', '/contacto', '/solicitar-apoyo', '/accesibilidad', '/buscar'];

/** Red móvil lenta, como pide el umbral de LCP. */
async function redLenta(page: Page): Promise<void> {
  const cliente = await page.context().newCDPSession(page);
  await cliente.send('Network.enable');
  await cliente.send('Network.emulateNetworkConditions', {
    offline: false,
    // 1.6 Mbps de bajada y 750 Kbps de subida, con 150 ms de latencia: el perfil
    // «Fast 3G» con el que se contrata el umbral en la mayoría de auditorías.
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
}

async function medir(page: Page, ruta: string): Promise<{ lcp: number; cls: number }> {
  await page.goto(ruta, { waitUntil: 'load' });

  return page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((resolve) => {
        let lcp = 0;
        let cls = 0;

        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries()) lcp = Math.max(lcp, entrada.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries()) {
            const desplazamiento = entrada as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            // Un desplazamiento provocado por algo que la persona acaba de
            // pulsar no cuenta: la métrica mide los saltos que nadie pidió.
            if (!desplazamiento.hadRecentInput) cls += desplazamiento.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });

        // Un margen para que lleguen las entradas que se emiten tras la carga.
        setTimeout(() => resolve({ lcp, cls }), 1200);
      }),
  );
}

test.describe('estabilidad visual', () => {
  for (const ruta of RUTAS) {
    test(`${ruta} no salta durante la carga`, async ({ page }) => {
      const { cls } = await medir(page, ruta);
      expect(cls, `${ruta} desplaza el contenido durante la carga`).toBeLessThanOrEqual(0.1);
    });
  }
});

test.describe('pintado del contenido principal en red lenta', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const ruta of ['/', '/solicitar-apoyo']) {
    test(`${ruta} pinta su contenido principal antes de 2.5 s`, async ({ page }) => {
      await redLenta(page);
      const { lcp } = await medir(page, ruta);

      expect(lcp, `${ruta} tarda demasiado en pintar su contenido principal`).toBeLessThanOrEqual(2500);
    });
  }
});

test.describe('respuesta a la interacción', () => {
  test('elegir un asunto en el formulario responde antes de 200 ms', async ({ page }) => {
    await page.goto('/solicitar-apoyo');

    const retraso = await page.evaluate(async () => {
      const radio = document.querySelector<HTMLInputElement>('input[name="requestType"]');
      if (radio === null) return Number.POSITIVE_INFINITY;

      const inicio = performance.now();
      radio.click();
      // Dos cuadros: uno para que React procese el cambio y otro para que el
      // navegador pinte el resultado. Lo que se mide es hasta que se ve.
      await new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));
      return performance.now() - inicio;
    });

    expect(retraso, 'elegir un asunto tarda en verse').toBeLessThanOrEqual(200);
  });

  test('el peso de la página inicial se mantiene acotado', async ({ page }) => {
    // No es un umbral de la tabla, sino lo que hace que el de LCP siga
    // cumpliéndose: una página que crece sin control acaba incumpliéndolo en la
    // red de quien menos ancho de banda tiene, que es de quien va el umbral.
    let bytes = 0;
    page.on('response', (respuesta) => {
      const largo = Number(respuesta.headers()['content-length'] ?? 0);
      if (Number.isFinite(largo)) bytes += largo;
    });

    await page.goto('/', { waitUntil: 'load' });

    expect(bytes / 1024, 'la portada pesa más de 500 KB').toBeLessThanOrEqual(500);
  });
});
