import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accesibilidad de las pantallas con sesión (PRD §5.2, §23.2; F4-QA-003).
 *
 * La Fase 4 construye casi todo **detrás de una sesión**: el panel personal, la
 * afiliación, la credencial, los consentimientos, los padrones, el directorio
 * interno, las credenciales emitidas. Validar solo las rutas públicas dejaría
 * fuera la mayor parte de la fase, y la puerta universal exige que la
 * accesibilidad se valide y que la interfaz se revise en móvil y en escritorio
 * —lo que aquí ocurre solo porque `playwright.config.ts` declara los dos
 * perfiles y esta suite corre en los dos—.
 *
 * El umbral es el mismo que en las rutas públicas: **cero violaciones
 * automáticas de gravedad crítica o seria**, en los dos temas.
 *
 * Las cuentas las prepara `tests/e2e/global-setup.ts`, con una contraseña que
 * nunca toca el repositorio.
 */

/** Rutas de la persona. Las abre cualquiera con cuenta. */
const DE_LA_PERSONA = [
  '/mi',
  '/mi/afiliacion',
  '/mi/afiliacion/solicitar',
  '/mi/credencial',
  '/mi/directorio',
  '/mi/consentimientos',
  '/mi/pagos',
  '/mi/seguridad',
];

/**
 * Rutas de quien mantiene el sitio público (Fase 7).
 *
 * Van aparte porque las abre `COMMUNICATIONS` y no la secretaría ejecutiva. La
 * pantalla del catálogo entra en la revisión porque repite el mismo formulario
 * una vez por ficha, que es exactamente donde aparecieron los identificadores
 * duplicados de `D-F5-010`: cinco campos «Dirección de acceso» con el mismo
 * identificador dejarían a cuatro de ellos sin etiqueta.
 */
const DE_COMUNICACION = ['/gestion/contenidos/ecosistema'];

/** Rutas de gestión. Exigen facultades institucionales. */
const DE_GESTION = [
  '/gestion',
  '/gestion/registro',
  '/gestion/afiliacion/solicitudes',
  '/gestion/afiliacion/calidades',
  '/gestion/afiliacion/beneficiarios',
  '/gestion/afiliacion/padrones/agremiados',
  '/gestion/afiliacion/padrones/honorarios',
  '/gestion/afiliacion/autoridad-laboral',
  '/gestion/directorio',
  '/gestion/credenciales',
  '/gestion/consentimientos',
];

/**
 * Rutas de la vida institucional (Fase 5). Son las pantallas donde la
 * organización delibera y decide, y se abren con las mismas facultades que las
 * de gestión: quien lleva el padrón convoca, asienta y publica.
 *
 * Las rutas con parámetro —una asamblea concreta, una elección concreta— no
 * entran en esta lista: dependen de datos que la semilla no crea, porque
 * convocar una asamblea es un acto de la organización y no una fila sembrada.
 * Su marcado sale de las mismas primitivas que estas.
 */
const DE_LA_VIDA_INSTITUCIONAL = [
  '/institucional',
  '/institucional/territorio',
  '/institucional/reglas',
  '/institucional/organos',
  '/institucional/nombramientos',
  '/institucional/asambleas',
  '/institucional/acuerdos',
  '/institucional/elecciones',
  '/institucional/documentos',
  '/institucional/negociacion',
  '/institucional/disciplina',
  '/institucional/cumplimiento',
  '/institucional/archivo',
];

const CORREO_DE = {
  persona: 'E2E_EMAIL_PERSONA',
  secretaria: 'E2E_EMAIL_SECRETARIA',
  comunicacion: 'E2E_EMAIL_COMUNICACION',
} as const;

async function entrar(page: Page, quien: keyof typeof CORREO_DE): Promise<void> {
  const email = process.env[CORREO_DE[quien]];
  const password = process.env['E2E_PASSWORD'];
  if (email === undefined || password === undefined) {
    throw new Error(
      'Faltan las credenciales de prueba. Las prepara tests/e2e/global-setup.ts antes de la suite.',
    );
  }

  await page.goto('/acceso');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/acceso'), { timeout: 30_000 });
}

async function violacionesGraves(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

  return resultado.violations.filter(
    (violacion) => violacion.impact === 'critical' || violacion.impact === 'serious',
  );
}

function describir(violaciones: Awaited<ReturnType<typeof violacionesGraves>>): string {
  return violaciones
    .map(
      (violacion) =>
        `${violacion.id} (${violacion.impact}): ${violacion.help}\n` +
        violacion.nodes.map((nodo) => `    ${nodo.target.join(' ')}`).join('\n'),
    )
    .join('\n');
}

for (const [quien, rutas] of [
  ['persona', DE_LA_PERSONA],
  ['secretaria', DE_GESTION],
  ['secretaria', DE_LA_VIDA_INSTITUCIONAL],
  ['comunicacion', DE_COMUNICACION],
] as const) {
  test.describe(`pantallas de ${quien} · ${rutas[0]}`, () => {
    test.beforeEach(async ({ page }) => {
      await entrar(page, quien);
    });

    for (const ruta of rutas) {
      test(`${ruta} · sin violaciones críticas ni serias`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        const respuesta = await page.goto(ruta);
        // Una ruta con sesión que responde 4xx o 5xx no es un problema de
        // accesibilidad: es una pantalla rota, y hay que decirlo así.
        expect(respuesta?.status(), `${ruta} respondió ${respuesta?.status()}`).toBeLessThan(400);
        await page.waitForSelector('h1', { timeout: 15_000 });

        // Y que la pantalla no sea una denegación disfrazada de página.
        const cuerpo = (await page.textContent('main')) ?? '';
        expect(cuerpo, `${ruta} deniega el acceso a quien la navegación se la ofrece`).not.toContain(
          'No tienes autorización',
        );

        const violaciones = await violacionesGraves(page);
        expect(violaciones.length, `${ruta}\n${describir(violaciones)}`).toBe(0);
      });

      test(`${ruta} · sin violaciones en tema oscuro`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto(ruta);
        await page.waitForSelector('h1', { timeout: 15_000 });
        const violaciones = await violacionesGraves(page);
        expect(violaciones.length, `${ruta} (oscuro)\n${describir(violaciones)}`).toBe(0);
      });
    }
  });
}
