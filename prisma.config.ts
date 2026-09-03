import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma (versión 7).
 *
 * `DIRECT_URL` es la conexión directa de Neon y es la ÚNICA que usan las
 * migraciones y las semillas; la aplicación usa la conexión agrupada de
 * `DATABASE_URL` (PRD §17.3, ADR-0002).
 *
 * `SHADOW_DATABASE_URL` es **opcional** y solo la usan las herramientas de
 * desarrollo: `migrate dev` y `migrate diff` levantan ahí una copia desechable
 * del esquema para comparar. En Neon no se puede crear una base al vuelo, de
 * modo que hay que apuntarla a una base vacía preparada de antemano. Ninguna
 * ruta de la aplicación ni el despliegue la necesitan.
 */
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'] ?? '';

export default defineConfig({
  schema: path.join('prisma', 'schema'),
  datasource: {
    url: env('DIRECT_URL'),
    ...(shadowDatabaseUrl === '' ? {} : { shadowDatabaseUrl }),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
});
