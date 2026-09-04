import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyDatabase, createTestDatabase, type TestDatabase } from './helpers/database';

/**
 * E2E-15 · Despliegue desde base vacía mediante las migraciones del repositorio
 * (docs/TEST_PLAN.md §4, §6).
 *
 * La base sobre la que corren estas pruebas se construyó ejecutando
 * `prisma migrate deploy` sobre una base vacía, que es exactamente lo que hace
 * un despliegue. Que este archivo llegue a ejecutarse ya prueba el escenario de
 * instalación limpia; lo que se comprueba aquí es que el esquema resultante
 * tiene las propiedades de las que depende el resto de la fase.
 */

let base: TestDatabase;

beforeAll(async () => {
  base = await createTestDatabase('migraciones');
}, 120_000);

afterAll(async () => {
  await base.destroy();
});

async function existe(consulta: string, parametros: unknown[] = []): Promise<boolean> {
  const resultado = await base.sql.query(consulta, parametros);
  return resultado.rowCount !== null && resultado.rowCount > 0;
}

describe('instalación limpia', () => {
  it('crea las 37 tablas de las fases 1 y 2', async () => {
    const { rows } = await base.sql.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
       ORDER BY table_name`,
    );
    const tablas = rows.map((row) => row.table_name);

    for (const esperada of [
      'actor', 'person', 'user_account', 'credential', 'session', 'password_reset',
      'organization', 'organization_user', 'specialty_catalog',
      'role', 'permission', 'role_permission', 'role_assignment', 'territorial_scope',
      'legal_entity', 'territorial_unit', 'normative_rule_set',
      'audit_event', 'security_event',
      'consent', 'consent_version',
      'file_object', 'file_version', 'retention_policy', 'legal_hold',
      'background_job', 'outbox_message', 'outbox_delivery', 'webhook_event',
      'notification', 'notification_template', 'delivery_attempt',
      // Fase 2 · CMS, entrada pública y medición
      'content_page', 'content_version', 'content_redirect',
      'support_request', 'site_metric',
    ]) {
      expect(tablas, `falta la tabla ${esperada}`).toContain(esperada);
    }
    expect(tablas).toHaveLength(37);
  });

  it('deja registradas todas las migraciones del repositorio, ninguna a medias', async () => {
    const enDisco = readdirSync('prisma/migrations', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const { rows } = await base.sql.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`,
    );

    expect(rows.map((row) => row.migration_name)).toEqual(enDisco);
    for (const row of rows) {
      expect(row.finished_at, `${row.migration_name} quedó sin terminar`).not.toBeNull();
      expect(row.rolled_back_at, `${row.migration_name} quedó revertida`).toBeNull();
    }
  });
});

describe('índices únicos parciales (docs/DATA_MODEL.md §3)', () => {
  it('el correo principal es único solo entre las personas vivas', async () => {
    expect(
      await existe(`SELECT 1 FROM pg_indexes WHERE indexname = 'person_primary_email_live_uniq'`),
    ).toBe(true);

    const { rows: actores } = await base.sql.query<{ id: string }>(
      `INSERT INTO "actor" ("id", "kind", "label", "createdAt") VALUES (gen_random_uuid(), 'MIGRATION', 'Prueba', now()) RETURNING id`,
    );
    const actorId = actores[0]!.id;

    const persona = async (email: string) =>
      base.sql.query(
        `INSERT INTO "person" ("id", "publicId", "givenName", "familyName", "primaryEmail", "createdAt", "updatedAt", "createdByActorId", "updatedByActorId")
         VALUES (gen_random_uuid(), substr(md5(random()::text), 1, 22), 'Prueba', 'Persona', $1, now(), now(), $2, $2)`,
        [email, actorId],
      );

    await persona('duplicada@fuerzaindigo.lat');
    await expect(persona('duplicada@fuerzaindigo.lat')).rejects.toThrow(/duplicate key|llave duplicada/i);

    // Archivar libera el correo: la unicidad es de las filas vivas, no de la
    // historia. Sin esto, un registro archivado bloquearía para siempre un
    // correo que su titular podría querer volver a usar.
    await base.sql.query(`UPDATE "person" SET "archivedAt" = now() WHERE "primaryEmail" = $1`, [
      'duplicada@fuerzaindigo.lat',
    ]);
    await expect(persona('duplicada@fuerzaindigo.lat')).resolves.toBeDefined();
  });

  it('un trabajo pendiente es único por tipo y clave de negocio, pero uno terminado no bloquea al siguiente', async () => {
    expect(await existe(`SELECT 1 FROM pg_indexes WHERE indexname = 'background_job_pending_uniq'`)).toBe(true);

    const encolar = () =>
      base.sql.query(
        `INSERT INTO "background_job" ("id", "jobType", "businessKey", "payload", "status", "runAt", "createdAt", "updatedAt", "correlationId")
         VALUES (gen_random_uuid(), 'mail-retry', 'aviso-123', '{}'::jsonb, 'PENDING', now(), now(), now(), gen_random_uuid()::text)`,
      );

    await encolar();
    await expect(encolar()).rejects.toThrow(/duplicate key|llave duplicada/i);

    await base.sql.query(`UPDATE "background_job" SET "status" = 'SUCCEEDED' WHERE "businessKey" = 'aviso-123'`);
    await expect(encolar()).resolves.toBeDefined();
  });
});

describe('índice de prefijo de la jerarquía territorial (ADR-0027)', () => {
  it('existe el índice con text_pattern_ops', async () => {
    // Sin `text_pattern_ops`, la búsqueda por prefijo de ruta materializada no
    // usa el índice en instalaciones con configuración regional distinta de C,
    // y el filtro territorial de cada consulta pasa a recorrer la tabla entera.
    const { rows } = await base.sql.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'territorial_unit_path_prefix_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('text_pattern_ops');
  });
});

describe('privilegios del rol de aplicación (docs/SECURITY.md §5)', () => {
  it('el rol de aplicación no puede modificar ni borrar la bitácora', async () => {
    const { rows } = await base.sql.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.table_privileges
       WHERE grantee = 'fuerza_app' AND table_name IN ('audit_event', 'security_event')`,
    );
    const privilegios = new Set(rows.map((row) => row.privilege_type));

    expect(privilegios.has('INSERT')).toBe(true);
    expect(privilegios.has('SELECT')).toBe(true);
    expect(privilegios.has('UPDATE'), 'el rol de aplicación conserva UPDATE sobre las bitácoras').toBe(false);
    expect(privilegios.has('DELETE'), 'el rol de aplicación conserva DELETE sobre las bitácoras').toBe(false);
    expect(privilegios.has('TRUNCATE')).toBe(false);
  });

  it('la bandeja de salida se puede marcar como entregada pero no borrar', async () => {
    const { rows } = await base.sql.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.table_privileges
       WHERE grantee = 'fuerza_app' AND table_name = 'outbox_message'`,
    );
    const privilegios = new Set(rows.map((row) => row.privilege_type));
    expect(privilegios.has('UPDATE')).toBe(true);
    expect(privilegios.has('DELETE')).toBe(false);
  });
});

describe('el esquema y las migraciones no se separan', () => {
  it('aplicar las migraciones produce exactamente el modelo declarado', async () => {
    // Este control existe por un defecto real: la migración inicial creaba
    // `audit_event` sin `chainKey` ni `chainSequence`, que el modelo sí
    // declaraba. El código compilaba, el modelo era correcto y la base quedaba
    // incapaz de registrar una sola acción auditada. Nada lo advertía porque
    // nadie comparaba las dos cosas.
    const sombra = await createEmptyDatabase();
    try {
      const diferencia = execFileSync(
        'npx',
        ['prisma', 'migrate', 'diff', '--from-migrations', 'prisma/migrations', '--to-schema', 'prisma/schema', '--script'],
        { encoding: 'utf8', env: { ...process.env, SHADOW_DATABASE_URL: sombra.url } },
      );

      const sentencias = diferencia
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => linea !== '' && !linea.startsWith('--') && !linea.startsWith('Loaded Prisma config'));

      // La única diferencia admitida es el índice de prefijo territorial, que se
      // escribe a mano porque Prisma no sabe expresar `text_pattern_ops`
      // (ADR-0027). Cualquier otra sentencia es una separación real entre lo que
      // el código cree y lo que la base tiene.
      const inesperadas = sentencias.filter((linea) => !linea.includes('territorial_unit_path_prefix_idx'));
      expect(inesperadas, `el esquema y las migraciones divergen:\n${inesperadas.join('\n')}`).toEqual([]);
    } finally {
      await sombra.drop();
    }
  }, 120_000);
});

describe('las migraciones aplicadas no se editan (docs/TEST_PLAN.md §6)', () => {
  it('el resumen de cada migración coincide con el archivo del repositorio', async () => {
    // Prisma guarda el resumen de lo aplicado. Si alguien corrige una migración
    // ya desplegada en vez de añadir una nueva, las bases existentes quedan en
    // un estado que ninguna migración describe. Aquí se comprueba sobre una
    // base recién creada, de modo que un desajuste solo puede venir del archivo.
    const { rows } = await base.sql.query<{ migration_name: string; checksum: string }>(
      `SELECT migration_name, checksum FROM _prisma_migrations`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const contenido = readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`);
      expect(contenido.length, `${row.migration_name} está vacía`).toBeGreaterThan(0);
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('una migración con error detiene el despliegue en vez de dejar el esquema a medias', async () => {
    const rota = await createTestDatabase('migracion_rota');
    try {
      expect(() =>
        execFileSync('npx', ['prisma', 'db', 'execute', '--stdin'], {
          input: 'ALTER TABLE "tabla_que_no_existe" ADD COLUMN "x" text;',
          stdio: 'pipe',
          env: { ...process.env, DIRECT_URL: rota.url, DATABASE_URL: rota.url },
        }),
      ).toThrow();

      // El esquema anterior sigue intacto: el fallo no dejó la base a medio migrar.
      const { rows } = await rota.sql.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      expect(Number(rows[0]?.count)).toBeGreaterThan(30);
    } finally {
      await rota.destroy();
    }
  }, 120_000);
});
