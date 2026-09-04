import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo (F2-QA-001, docs/TEST_PLAN.md §3).
 *
 * Dos perfiles obligatorios y no uno: el PRD §5.1 contrata el diseño desde 360
 * píxeles, y una interfaz que solo se prueba en escritorio se rompe en móvil sin
 * que nadie se entere. El perfil móvil va primero a propósito, porque es el que
 * más gente usa y el que más fácil se descuida.
 *
 * `E2E_CHROMIUM_PATH` apunta a un Chromium ya instalado en la máquina. Existe
 * porque algunos entornos traen el navegador preinstalado con una revisión
 * distinta de la que pide esta versión de Playwright: sin la variable habría
 * que elegir entre descargar otro navegador de doscientos megas o congelar la
 * versión de la herramienta por culpa de una imagen. Cuando no está, Playwright
 * usa el navegador que él mismo instala, que es lo que ocurre en la integración
 * continua.
 */

const PUERTO = Number(process.env['E2E_PORT'] ?? 3000);
const BASE = `http://127.0.0.1:${PUERTO}`;
const CHROMIUM = process.env['E2E_CHROMIUM_PATH'] ?? '';
const NAVEGADOR = CHROMIUM === '' ? {} : { launchOptions: { executablePath: CHROMIUM } };

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/e2e/global-setup.ts',
  testMatch: ['e2e/**/*.spec.ts', 'a11y/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: process.env['CI'] === 'true',
  retries: 0,
  workers: 1,
  reporter: process.env['CI'] === 'true' ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...NAVEGADOR,
  },

  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],

  webServer: {
    command: 'npm run start',
    url: BASE,
    reuseExistingServer: process.env['CI'] !== 'true',
    timeout: 120_000,
  },
});
