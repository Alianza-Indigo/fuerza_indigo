import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Client } from 'pg';

/**
 * Preparación única de las pruebas de integración.
 *
 * Las pruebas se ejecutan contra **PostgreSQL de verdad**, no contra un doble.
 * Buena parte de lo que la Fase 1 garantiza vive en el motor y no en el código
 * de la aplicación: los índices únicos parciales, el bloqueo consultivo que
 * serializa la cadena de la bitácora, el `FOR UPDATE SKIP LOCKED` de la cola y
 * la revocación de `UPDATE` y `DELETE` sobre las bitácoras. Un doble en memoria
 * las daría todas por buenas sin comprobar ninguna.
 *
 * Aquí se construye una base **plantilla** aplicando las migraciones del
 * repositorio, exactamente el mismo camino que ejecuta un despliegue. Cada
 * archivo de prueba clona esa plantilla, de modo que su aislamiento no depende
 * de que recuerde limpiar lo que escribió.
 */

export const TEMPLATE_DATABASE = 'fuerza_test_template';

/** Carga `.env.local` en desarrollo. En la CI las variables ya vienen puestas. */
function loadLocalEnv(): void {
  if (process.env['CI'] === 'true') return;
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
}

/** Sustituye el nombre de la base en una cadena de conexión, sin tocar el resto. */
export function withDatabaseName(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withAdminClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  loadLocalEnv();

  const directUrl = process.env['DIRECT_URL'];
  if (directUrl === undefined || directUrl === '') {
    throw new Error(
      'Las pruebas de integración necesitan DIRECT_URL apuntando a un PostgreSQL con permiso de CREATE DATABASE. ' +
        'En desarrollo se toma de .env.local; en la CI la define el flujo de trabajo.',
    );
  }

  const templateUrl = withDatabaseName(directUrl, TEMPLATE_DATABASE);

  // La plantilla se recrea en cada ejecución: una plantilla heredada de una
  // ejecución anterior podría estar en un esquema viejo y haría pasar pruebas
  // que en un despliegue real fallarían.
  await withAdminClient(directUrl, async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEMPLATE_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEMPLATE_DATABASE}"`);
    await client.query(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);
  });

  // El mismo comando que ejecuta el despliegue. Si falla, las pruebas no
  // arrancan: una base a medias no es un punto de partida válido.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DIRECT_URL: templateUrl, DATABASE_URL: templateUrl },
  });

  process.env['TEST_TEMPLATE_URL'] = templateUrl;
  process.env['TEST_ADMIN_URL'] = directUrl;

  return async () => {
    await withAdminClient(directUrl, async (client) => {
      // Las bases efímeras de los archivos que fallaron a medias también se
      // retiran: dejarlas convertiría el clúster de desarrollo en un basurero.
      const leftovers = await client.query<{ datname: string }>(
        `SELECT datname FROM pg_database WHERE datname LIKE 'fuerza_test_%'`,
      );
      for (const row of leftovers.rows) {
        await client.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [row.datname],
        );
        await client.query(`DROP DATABASE IF EXISTS "${row.datname}"`);
      }
    });
  };
}
