import { Client } from 'pg';

import { hashPassword } from '@/platform/auth/password';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Cuentas de prueba para las pantallas con sesión.
 *
 * Hasta la Fase 3 las pruebas de extremo a extremo solo recorrían rutas
 * públicas, así que no hacía falta ninguna sesión. La Fase 4 cambia eso: casi
 * todo lo que construye —el panel, la afiliación, la credencial, los padrones,
 * el directorio interno— vive detrás de una sesión, y la puerta universal exige
 * que la accesibilidad y las dos anchuras de pantalla se **validen**, no se
 * declaren. Sin estas cuentas, esa validación dejaría fuera la mayor parte de
 * la fase.
 *
 * Son **idempotentes**: si ya existen, se dejan como están. La suite se corre
 * muchas veces contra la misma base de desarrollo.
 *
 * La contraseña no está en el repositorio. Se toma de `E2E_PASSWORD`, y cuando
 * falta se genera una al vuelo y se usa solo en esa corrida: una contraseña de
 * prueba versionada es un secreto versionado, aunque sea de prueba, y acaba
 * copiada a un despliegue real por alguien que supone que estaba ahí por algo.
 */

export interface CuentasDePrueba {
  readonly password: string;
  readonly persona: string;
  readonly secretaria: string;
}

const PERSONA = 'e2e-agremiada@ejemplo.invalid';
const SECRETARIA = 'e2e-secretaria@ejemplo.invalid';

async function actorDeMigracion(client: Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM actor WHERE kind = 'MIGRATION' LIMIT 1`,
  );
  if (rows[0] !== undefined) return rows[0].id;
  const creado = await client.query<{ id: string }>(
    `INSERT INTO actor (id, kind, label, "createdAt") VALUES (gen_random_uuid(), 'MIGRATION', 'Semilla y migraciones', now()) RETURNING id`,
  );
  return creado.rows[0]!.id;
}

/** Crea la cuenta si falta y devuelve su identificador de usuario. */
async function cuenta(
  client: Client,
  email: string,
  nombre: string,
  apellido: string,
  password: string,
): Promise<{ userId: string; personId: string }> {
  const existente = await client.query<{ id: string; personId: string }>(
    `SELECT id, "personId" FROM user_account WHERE email = $1`,
    [email],
  );
  if (existente.rows[0] !== undefined) {
    // La contraseña se repone en cada corrida: la de la corrida anterior era
    // otra, y una prueba que depende de un secreto que ya no existe falla por
    // una razón que no tiene nada que ver con lo que prueba.
    const { hash, params } = await hashPassword(password);
    await client.query(
      `UPDATE credential SET "secretHash" = $1, "algorithmParams" = $2 WHERE "userId" = $3 AND type = 'PASSWORD'`,
      [hash, JSON.stringify(params), existente.rows[0].id],
    );
    return { userId: existente.rows[0].id, personId: existente.rows[0].personId };
  }

  const autor = await actorDeMigracion(client);
  const persona = await client.query<{ id: string }>(
    `INSERT INTO person (id, "publicId", "givenName", "familyName", "primaryEmail",
                         "createdByActorId", "updatedByActorId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, now()) RETURNING id`,
    [newPublicId(), nombre, apellido, email, autor],
  );
  const personId = persona.rows[0]!.id;

  const usuario = await client.query<{ id: string }>(
    `INSERT INTO user_account (id, "personId", email, status, "emailVerifiedAt",
                               "createdByActorId", "updatedByActorId", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', now(), $3, $3, now()) RETURNING id`,
    [personId, email, autor],
  );
  const userId = usuario.rows[0]!.id;

  const { hash, params } = await hashPassword(password);
  await client.query(
    `INSERT INTO credential (id, "userId", type, "secretHash", "algorithmParams", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, 'PASSWORD', $2, $3, now(), now())`,
    [userId, hash, JSON.stringify(params)],
  );
  await client.query(
    `INSERT INTO actor (id, kind, label, "userId", "createdAt")
     VALUES (gen_random_uuid(), 'PERSON', $1, $2, now())`,
    [`${nombre} ${apellido}`, userId],
  );

  return { userId, personId };
}

/** Concede un rol si la persona no lo tiene ya. */
async function rol(client: Client, userId: string, codigo: string, otorganteId: string): Promise<void> {
  const entidad = await client.query<{ id: string }>(`SELECT id FROM legal_entity ORDER BY code LIMIT 1`);
  await client.query(
    `INSERT INTO role_assignment (id, "userId", "roleId", "legalEntityId", "grantedById", "grantReason", "startsAt", "createdAt", "updatedAt")
     SELECT gen_random_uuid(), $1, r.id, $2, $3, 'Cuenta de las pruebas de extremo a extremo', now(), now(), now()
       FROM role r
      WHERE r.code = $4
        AND NOT EXISTS (
          SELECT 1 FROM role_assignment ra
           WHERE ra."userId" = $1 AND ra."roleId" = r.id AND ra."revokedAt" IS NULL
        )`,
    [userId, entidad.rows[0]!.id, otorganteId, codigo],
  );
}

export async function prepararCuentas(connectionString: string): Promise<CuentasDePrueba> {
  const password = process.env['E2E_PASSWORD'] ?? `prueba ${newPublicId(16)}`;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const secretaria = await cuenta(client, SECRETARIA, 'Secretaria', 'De Pruebas', password);
    await rol(client, secretaria.userId, 'EXECUTIVE_SECRETARY', secretaria.userId);

    const persona = await cuenta(client, PERSONA, 'Agremiada', 'De Pruebas', password);
    await rol(client, persona.userId, 'UNION_MEMBER', secretaria.userId);

    // Una membresía activa y su credencial: sin ellas, la mitad de las
    // pantallas de la persona enseñan su estado vacío y la revisión de
    // accesibilidad no vería nunca una tabla con datos.
    await client.query(
      `INSERT INTO membership (id, "publicId", "memberNumber", "personId", "membershipTypeId", category,
                               "legalEntityId", status, "startedAt", "createdByActorId", "updatedByActorId", "updatedAt")
       SELECT gen_random_uuid(), $1, $2, $3, t.id, t.category, t."legalEntityId", 'ACTIVE', now(), a.id, a.id, now()
         FROM membership_type t, actor a
        WHERE t.code = 'AGREMIADO' AND a.kind = 'MIGRATION'
          AND NOT EXISTS (SELECT 1 FROM membership m WHERE m."personId" = $3)
        LIMIT 1`,
      [newPublicId(20), `FI-E2E-${newPublicId(6)}`, persona.personId],
    );

    return { password, persona: PERSONA, secretaria: SECRETARIA };
  } finally {
    await client.end();
  }
}
