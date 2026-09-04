import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '@prisma-client/client';
import { currentDbClientForTests, setDbClientForTests } from '@/platform/db/client';
import { resetEnvCache } from '@/platform/config/env';
import { TEMPLATE_DATABASE, withDatabaseName } from '../global-setup';

/**
 * Base efímera por archivo de prueba.
 *
 * Se clona la plantilla que preparó `global-setup`, de modo que cada archivo
 * arranca sobre un esquema recién migrado. El aislamiento no depende de que la
 * prueba recuerde borrar lo que escribió: la base entera se destruye al final.
 *
 * La aplicación se conecta con el rol **sin** privilegios de modificación sobre
 * las bitácoras, igual que en producción. Es lo que hace comprobable la
 * inmutabilidad del registro: si la prueba se conectara como propietaria, el
 * `UPDATE` prohibido tendría éxito y la garantía quedaría sin verificar.
 */

export interface TestDatabase {
  readonly url: string;
  readonly name: string;
  readonly prisma: PrismaClient;
  /** Conexión directa para lo que Prisma no expresa: privilegios, índices, bloqueos. */
  readonly sql: Client;
  seed(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Pila de bases instaladas.
 *
 * Un archivo puede necesitar una segunda base efímera dentro de una prueba
 * —por ejemplo, para alterar una bitácora con privilegios de propietaria sin
 * estropear la del resto del archivo—. Sin esta pila, esa segunda base
 * secuestraría el cliente compartido y, al destruirse, dejaría al archivo sin
 * cliente: las pruebas siguientes fallarían por una razón que nada tiene que
 * ver con lo que prueban.
 */
interface Instalada {
  readonly prisma: PrismaClient | undefined;
  readonly databaseUrl: string | undefined;
  readonly directUrl: string | undefined;
}

const pila: Instalada[] = [];

/**
 * Sentencias `GRANT` y `REVOKE` que declaran las migraciones, en su orden.
 *
 * Se leen del disco en vez de repetirse aquí. La versión anterior las copiaba a
 * mano y esa copia era una promesa que nadie renovaba: al añadir una migración
 * que retira `UPDATE` sobre una columna, las pruebas seguían corriendo con el
 * privilegio puesto y daban por buena una inmutabilidad que en producción sí
 * existía y aquí no. Una prueba que comprueba menos que la realidad es peor que
 * ninguna, porque además tranquiliza.
 *
 * Los `GRANT` generales de arriba se aplican antes porque los privilegios por
 * omisión no cruzan de una base a otra; estas sentencias van después para que
 * las revocaciones tengan la última palabra, igual que en un despliegue.
 */
function privilegiosDeLasMigraciones(): string[] {
  const raiz = path.join(process.cwd(), 'prisma', 'migrations');
  const sentencias: string[] = [];

  for (const carpeta of readdirSync(raiz).sort()) {
    const archivo = path.join(raiz, carpeta, 'migration.sql');
    if (!existsSync(archivo)) continue;

    const sinComentarios = readFileSync(archivo, 'utf8')
      .split('\n')
      .filter((linea) => !linea.trimStart().startsWith('--'))
      .join('\n');

    for (const bruta of sinComentarios.split(';')) {
      const sentencia = bruta.trim();
      if (/^(GRANT|REVOKE)\b/i.test(sentencia)) sentencias.push(sentencia);
    }
  }

  if (sentencias.length === 0) {
    throw new Error(
      'Ninguna migración declara privilegios. O se perdió la separación de roles, o este ayudante dejó de encontrarlas.',
    );
  }

  return sentencias;
}

async function onAdmin(work: (client: Client) => Promise<void>): Promise<void> {
  const adminUrl = process.env['TEST_ADMIN_URL'];
  if (adminUrl === undefined) throw new Error('Falta TEST_ADMIN_URL: ¿corrió global-setup?');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Rol de aplicación con inicio de sesión. Se crea una sola vez en el clúster y
 * hereda de `fuerza_app`, que es el grupo al que la migración retira `UPDATE` y
 * `DELETE` sobre las bitácoras.
 */
const APP_ROLE = 'fuerza_test_app';
const APP_PASSWORD = 'prueba-de-integracion';

async function ensureAppRole(): Promise<void> {
  await onAdmin(async (client) => {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}';
        END IF;
      END $$;
    `);
    await client.query(`GRANT fuerza_app TO ${APP_ROLE}`);
  });
}

/**
 * Base vacía y de propiedad plena, sin migraciones aplicadas.
 *
 * La necesitan las herramientas de Prisma que levantan una copia desechable del
 * esquema para compararlo: exigen una base vacía y permisos de propietaria, de
 * modo que no sirve un clon de la plantilla ni el rol de aplicación.
 */
export async function createEmptyDatabase(): Promise<{ url: string; drop(): Promise<void> }> {
  const templateUrl = process.env['TEST_TEMPLATE_URL'];
  if (templateUrl === undefined) throw new Error('Falta TEST_TEMPLATE_URL: ¿corrió global-setup?');

  const name = `fuerza_test_vacia_${randomBytes(4).toString('hex')}`;
  await onAdmin(async (client) => {
    await client.query(`CREATE DATABASE "${name}"`);
  });

  return {
    url: withDatabaseName(templateUrl, name),
    async drop() {
      await onAdmin(async (client) => {
        await client.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [name],
        );
        await client.query(`DROP DATABASE IF EXISTS "${name}"`);
      });
    },
  };
}

export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const templateUrl = process.env['TEST_TEMPLATE_URL'];
  if (templateUrl === undefined) throw new Error('Falta TEST_TEMPLATE_URL: ¿corrió global-setup?');

  const slug = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 24);
  const name = `fuerza_test_${slug}_${randomBytes(4).toString('hex')}`;

  await ensureAppRole();
  await onAdmin(async (client) => {
    await client.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DATABASE}"`);
  });

  const ownerUrl = withDatabaseName(templateUrl, name);
  const appUrl = (() => {
    const url = new URL(ownerUrl);
    url.username = APP_ROLE;
    url.password = APP_PASSWORD;
    return url.toString();
  })();

  // El rol de aplicación necesita alcanzar el esquema y las secuencias de esta
  // base concreta: los privilegios por defecto no cruzan de una base a otra.
  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`GRANT USAGE ON SCHEMA public TO fuerza_app`);
  await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fuerza_app`);
  await owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fuerza_app`);
  for (const sentencia of privilegiosDeLasMigraciones()) await owner.query(sentencia);
  await owner.end();

  pila.push({
    prisma: currentDbClientForTests(),
    databaseUrl: process.env['DATABASE_URL'],
    directUrl: process.env['DIRECT_URL'],
  });

  process.env['DATABASE_URL'] = appUrl;
  process.env['DIRECT_URL'] = ownerUrl;
  resetEnvCache();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });
  setDbClientForTests(prisma);

  const sql = new Client({ connectionString: ownerUrl });
  await sql.connect();

  return {
    url: appUrl,
    name,
    prisma,
    sql,

    seed() {
      execFileSync('npx', ['tsx', 'prisma/seed/index.ts'], {
        stdio: 'pipe',
        env: { ...process.env, DIRECT_URL: ownerUrl, DATABASE_URL: ownerUrl },
      });
      return Promise.resolve();
    },

    async destroy() {
      await sql.end();
      await prisma.$disconnect();

      const anterior = pila.pop();
      setDbClientForTests(anterior?.prisma);
      if (anterior?.databaseUrl === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = anterior.databaseUrl;
      if (anterior?.directUrl === undefined) delete process.env['DIRECT_URL'];
      else process.env['DIRECT_URL'] = anterior.directUrl;
      resetEnvCache();

      await onAdmin(async (client) => {
        await client.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [name],
        );
        await client.query(`DROP DATABASE IF EXISTS "${name}"`);
      });
    },
  };
}
