import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * `eslint-config-next` publica configuración plana nativa desde la versión 16,
 * de modo que se importa directamente. El puente `FlatCompat` sobra y además
 * rompe bajo ESLint 10: al validar el formato antiguo intenta serializar el
 * grafo de complementos, que es circular.
 */

/**
 * Infraestructura que la capa de presentación NUNCA puede importar (PRD §17.2).
 * Las rutas, páginas y componentes invocan servicios de aplicación; la persistencia
 * y las integraciones viven detrás de puertos.
 */
const INFRASTRUCTURE = [
  { name: '@prisma/client', message: 'Las rutas no acceden a Prisma. Invoque un servicio de aplicación (PRD §17.2).' },
  { name: '@prisma/adapter-pg', message: 'Las rutas no configuran la base de datos. Use `@/platform/db` desde un servicio.' },
  { name: 'pg', message: 'Las rutas no abren conexiones. Use `@/platform/db` desde un servicio.' },
  { name: '@vercel/blob', message: 'Las rutas no acceden al almacén. Use el servicio de archivos (`@/platform/files`).' },
  { name: '@node-rs/argon2', message: 'Las rutas no manejan material criptográfico. Use `@/platform/auth`.' },
];

/** Módulos del dominio: solo se importan por su interfaz pública `index.ts`. */
const MODULE_INTERNALS = [
  {
    group: ['@/modules/*/domain/*', '@/modules/*/application/*', '@/modules/*/infrastructure/*', '@/modules/*/ui/*'],
    message: 'Importe el módulo por su interfaz pública `@/modules/<modulo>`, no por sus archivos internos (docs/ARCHITECTURE.md §4.2).',
  },
];

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'coverage/**', 'reports/**', 'test-results/**', 'playwright-report/**'],
  },

  ...nextCoreWebVitals,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // ---------------------------------------------------------------------------
  // Frontera 1: la presentación no toca infraestructura (ADR-0006).
  // ---------------------------------------------------------------------------
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: INFRASTRUCTURE, patterns: MODULE_INTERNALS }],
    },
  },

  // ---------------------------------------------------------------------------
  // Frontera 2: el dominio es puro. No importa infraestructura ni otros módulos.
  // ---------------------------------------------------------------------------
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: INFRASTRUCTURE,
          patterns: [
            { group: ['@/platform/db', '@/platform/db/*', '@/platform/files', '@/platform/files/*'],
              message: 'La capa de dominio no conoce la persistencia ni el almacenamiento (docs/ARCHITECTURE.md §3).' },
            { group: ['@/modules/*'], message: 'El dominio de un módulo no depende de otro módulo.' },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Frontera 3: fuera de `platform/db`, nadie instancia el cliente de Prisma.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/platform/db/**', 'src/platform/config/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@prisma/adapter-pg', message: 'Solo `@/platform/db` configura el adaptador.' },
            { name: 'pg', message: 'Solo `@/platform/db` abre conexiones.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Lea la configuración validada de `@/platform/config`, nunca `process.env` (PRD §21).' },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Los archivos de configuración en JavaScript quedan fuera del programa de
  // TypeScript, de modo que las reglas que necesitan tipos no pueden aplicarse
  // sobre ellos. Se revisan con las reglas sintácticas, que es lo que aportan.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: false } },
  },

  // Los guiones de operación y las pruebas sí pueden escribir en la consola.
  {
    files: ['scripts/**/*.{ts,mjs,js}', 'prisma/seed/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
