#!/usr/bin/env node
/**
 * Comprueba —y si se le pide, corrige— que la base configurada sea exactamente
 * la que producen las migraciones del repositorio.
 *
 * **Por qué existe.** `prisma migrate status` responde «al día» comparando la
 * *lista de migraciones aplicadas* por su nombre, no su contenido. Durante el
 * desarrollo de una fase una migración todavía no publicada se edita varias
 * veces, y la base local se queda con la primera versión mientras el registro
 * dice que ya la tiene. A partir de ahí todo miente en la misma dirección: el
 * servidor de desarrollo falla con columnas que «existen», `migrate diff`
 * propone deshacer cosas que sí están en el repositorio, y las pruebas pasan
 * —construyen su base desde cero— mientras la máquina de quien programa no
 * funciona. Pasó de verdad, y costó media hora de diagnóstico equivocado.
 *
 * Lo que se compara es la base configurada contra **lo que las migraciones
 * producen**, no contra el esquema Prisma. La diferencia importa: el esquema no
 * sabe expresar `text_pattern_ops`, así que compararlo con él propondría borrar
 * el índice de prefijo territorial en cada ejecución (ADR-0027).
 *
 *   node scripts/db/sync.mjs           comprueba y explica la diferencia
 *   node scripts/db/sync.mjs --apply   reconstruye la base desde las migraciones
 *
 * `--apply` **borra** el contenido de la base configurada. Solo se usa contra
 * una base de desarrollo; se niega a tocar cualquier otra cosa que no sea local.
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APLICAR = process.argv.includes('--apply');

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lee el archivo de entorno sin depender del cargador de Next.
 *
 * El cargador marca `__NEXT_PROCESSED_ENV` y memoriza el resultado, de modo que
 * un guion que corre antes que el servidor le dejaría el entorno ya procesado.
 */
function leerEntornoLocal() {
  const valores = {};
  for (const archivo of ['.env.local', '.env']) {
    const ruta = join(RAIZ, archivo);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
      const limpia = linea.trim();
      if (limpia === '' || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte === -1) continue;
      const nombre = limpia.slice(0, corte).trim();
      if (valores[nombre] !== undefined) continue;
      let valor = limpia.slice(corte + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      valores[nombre] = valor;
    }
  }
  return valores;
}

const local = leerEntornoLocal();
const DIRECTO = process.env['DIRECT_URL'] ?? local['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? local['DATABASE_URL'];

if (DIRECTO === undefined || DIRECTO === '') {
  console.error(
    'Falta DIRECT_URL (o DATABASE_URL). Cópialo de .env.example a .env.local y apunta a tu base de desarrollo.',
  );
  process.exit(1);
}

/** La dirección se enseña siempre sin credenciales. */
function sinCredenciales(url) {
  const u = new URL(url);
  u.username = '';
  u.password = '';
  return `${u.protocol}//${u.host}${u.pathname}`;
}

function esLocal(url) {
  const u = new URL(url);
  const anfitrion = u.hostname;
  const porSocket = u.searchParams.get('host');
  return (
    anfitrion === 'localhost' ||
    anfitrion === '127.0.0.1' ||
    anfitrion === '::1' ||
    (porSocket !== null && porSocket.startsWith('/'))
  );
}

const entornoPrisma = { ...process.env, DIRECT_URL: DIRECTO, DATABASE_URL: DIRECTO };

function prisma(argumentos, extra = {}) {
  return execFileSync('npx', ['prisma', ...argumentos], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: { ...entornoPrisma, ...extra },
  });
}

/* ------------------------------------------------------------------ */
/* Base de sombra                                                      */
/* ------------------------------------------------------------------ */

/**
 * `migrate diff` necesita materializar las migraciones en algún sitio para
 * poder compararlas. Se crea una base efímera y se retira al terminar, pase lo
 * que pase: dejarlas convertiría el clúster de desarrollo en un basurero.
 */
async function conSombra(trabajo) {
  const nombre = `fuerza_sombra_${randomBytes(4).toString('hex')}`;
  const admin = new URL(DIRECTO);
  admin.pathname = '/postgres';
  const sombra = new URL(DIRECTO);
  sombra.pathname = `/${nombre}`;

  const cliente = new pg.Client({ connectionString: admin.toString() });
  await cliente.connect();
  await cliente.query(`CREATE DATABASE "${nombre}"`);
  await cliente.end();

  try {
    return await trabajo(sombra.toString());
  } finally {
    const limpieza = new pg.Client({ connectionString: admin.toString() });
    await limpieza.connect();
    await limpieza.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [nombre],
    );
    await limpieza.query(`DROP DATABASE IF EXISTS "${nombre}"`);
    await limpieza.end();
  }
}

/* ------------------------------------------------------------------ */
/* Comprobación                                                        */
/* ------------------------------------------------------------------ */

/** Devuelve el guion SQL que llevaría la base al estado de las migraciones. */
async function diferencia() {
  return await conSombra((urlSombra) => {
    const salida = prisma(
      ['migrate', 'diff', '--from-config-datasource', '--to-migrations', 'prisma/migrations', '--script'],
      { SHADOW_DATABASE_URL: urlSombra },
    );
    return salida
      .split('\n')
      .filter((linea) => !linea.startsWith('Loaded Prisma config'))
      .join('\n')
      .trim();
  });
}

const VACIO = '-- This is an empty migration.';

async function comprobar() {
  const guion = await diferencia();
  if (guion === '' || guion === VACIO) {
    console.log(`La base ${sinCredenciales(DIRECTO)} coincide con las migraciones del repositorio.`);
    return true;
  }

  console.error(`La base ${sinCredenciales(DIRECTO)} NO coincide con las migraciones del repositorio.`);
  console.error('');
  console.error('Esto es lo que le falta o le sobra respecto de lo que produce `prisma/migrations`:');
  console.error('');
  console.error(
    guion
      .split('\n')
      .slice(0, 40)
      .map((linea) => `  ${linea}`)
      .join('\n'),
  );
  if (guion.split('\n').length > 40) console.error('  …');
  console.error('');
  console.error('Reconstrúyela desde el repositorio:  npm run db:sync');
  console.error('(borra el contenido de esa base de desarrollo y la vuelve a levantar con su semilla)');
  return false;
}

/* ------------------------------------------------------------------ */
/* Reconstrucción                                                      */
/* ------------------------------------------------------------------ */

async function aplicar() {
  if (!esLocal(DIRECTO)) {
    console.error(
      `Me niego a reconstruir ${sinCredenciales(DIRECTO)}: no es una base local.\n` +
        'Este guion existe para una base de desarrollo. Una base remota se despliega con `npm run db:migrate`.',
    );
    process.exit(1);
  }

  console.log(`Reconstruyendo ${sinCredenciales(DIRECTO)} desde prisma/migrations…`);

  // Se vacía el esquema en vez de borrar la base: así funciona igual cuando el
  // rol no tiene permiso para crear bases, que es lo normal en un clúster
  // compartido.
  const cliente = new pg.Client({ connectionString: DIRECTO });
  await cliente.connect();
  await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
  await cliente.query('CREATE SCHEMA public');
  await cliente.end();

  prisma(['migrate', 'deploy'], {});
  console.log('Migraciones aplicadas.');

  execFileSync('npx', ['tsx', 'prisma/seed/index.ts'], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: entornoPrisma,
  });

  await prepararParaDesarrollo();

  const enOrden = await comprobar();
  if (!enOrden) process.exit(1);
}

/**
 * Deja la base local lista para trabajar y para probar.
 *
 * La semilla deja los avisos de privacidad **en borrador** a propósito:
 * publicarlos es un acto de la organización y no algo que ocurra por instalar
 * el sistema. Pero sin uno publicado el formulario público se niega a recabar
 * datos —correctamente— y ni el sitio de desarrollo ni la suite de extremo a
 * extremo pueden funcionar.
 *
 * La salida de eso no es pedirle a nadie que escriba un `UPDATE` a mano: es que
 * el repositorio lo haga, en voz alta, y **solo contra una base local**. Contra
 * cualquier otra cosa el guion ya se negó a llegar hasta aquí.
 */
async function prepararParaDesarrollo() {
  const cliente = new pg.Client({ connectionString: DIRECTO });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query(
      `UPDATE consent_version SET status = 'PUBLISHED'
       WHERE code = 'PRIVACY_NOTICE_PUBLIC_INTAKE' AND status = 'DRAFT'`,
    );
    if (rowCount !== null && rowCount > 0) {
      console.log(
        `Aviso de privacidad de la entrada pública publicado en ${rowCount} entidad(es): sin él, ` +
          'el formulario público se niega a recabar datos.',
      );
      console.log('Es una preparación de desarrollo. En un despliegue real lo publica la organización desde su pantalla.');
    }
  } finally {
    await cliente.end();
  }
}

/* ------------------------------------------------------------------ */

try {
  if (APLICAR) {
    await aplicar();
  } else {
    const enOrden = await comprobar();
    if (!enOrden) process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
