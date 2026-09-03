import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma (versión 7).
 *
 * `DIRECT_URL` es la conexión directa de Neon y es la ÚNICA que usan las
 * migraciones y las semillas; la aplicación usa la conexión agrupada de
 * `DATABASE_URL` (PRD §17.3, ADR-0002).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema'),
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
});
