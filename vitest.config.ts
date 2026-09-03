import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// El complemento de React se incorpora en la Fase 2, cuando existan componentes
// que probar. Añadirlo antes sería una dependencia sin uso (PRD §0.1).
export default defineConfig({
  resolve: {
    alias: {
      '@': `${root}src`,
      '@prisma-client': `${root}src/generated/prisma`,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Cada archivo trabaja sobre su propio esquema efímero. Se ejecutan en
          // un solo hilo para que el aislamiento sea real y no dependa del azar
          // de la planificación.
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
          testTimeout: 60_000,
          hookTimeout: 120_000,
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup-env.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/index.ts'],
    },
  },
});
