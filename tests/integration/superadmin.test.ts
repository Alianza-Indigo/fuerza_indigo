import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyRootCredentials, rootActorId, systemActorId } from '@/platform/auth/superadmin';
import { resolveActor } from '@/platform/auth/actor-resolver';
import { issueSession, SUPERADMIN_COOKIE, SESSION_COOKIE, SUPERADMIN_SESSION_TTL_MS, SESSION_TTL_MS, sessionCookieOptions } from '@/platform/auth/session';
import { transaction } from '@/platform/db/unit-of-work';
import { can } from '@/platform/authz/policy';
import { isAuthorizedCron } from '@/platform/http/cron-auth';
import { env } from '@/platform/config/env';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { crearPersonaConCuenta } from './helpers/fixtures';
import { ROOT_TEST_PASSWORD } from './setup-env';

/**
 * Superadmin raíz y trabajos programados (PRD §4.4, §17.5, docs/SECURITY.md §3).
 *
 * Criterio de la fase: **un Superadmin puede iniciar sesión sin existir como
 * miembro**. Su correo y su hash viven en el entorno; en la base solo tiene un
 * `Actor` de atribución, que sirve para registrar lo que hace y no le concede
 * nada. Aquí se comprueban las dos mitades: que entra, y que entrar no le da
 * facultades sindicales.
 */

let base: TestDatabase;

beforeAll(async () => {
  base = await createTestDatabase('superadmin');
  await base.seed();
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

describe('acceso del actor raíz', () => {
  it('entra con las credenciales del entorno, sin existir como persona', async () => {
    const resultado = await verifyRootCredentials(env().SUPERADMIN_EMAIL, ROOT_TEST_PASSWORD);
    expect(resultado.ok).toBe(true);

    // No hay ninguna persona ni cuenta que le corresponda: su acceso no depende
    // del padrón, y por eso puede administrar un sistema todavía vacío.
    expect(await base.prisma.person.count()).toBe(0);
    expect(await base.prisma.user.count()).toBe(0);
  });

  it('rechaza la contraseña incorrecta y el correo incorrecto por igual', async () => {
    expect((await verifyRootCredentials(env().SUPERADMIN_EMAIL, 'otra cosa')).ok).toBe(false);
    expect((await verifyRootCredentials('otro@ejemplo.invalid', ROOT_TEST_PASSWORD)).ok).toBe(false);
    expect((await verifyRootCredentials('otro@ejemplo.invalid', 'otra cosa')).ok).toBe(false);
  });

  it('el correo se compara sin distinguir mayúsculas ni espacios sobrantes', async () => {
    const variante = `  ${env().SUPERADMIN_EMAIL.toUpperCase()}  `;
    expect((await verifyRootCredentials(variante, ROOT_TEST_PASSWORD)).ok).toBe(true);
  });

  it('su actor de atribución se crea al primer uso y es siempre el mismo', async () => {
    const primero = await rootActorId();
    const segundo = await rootActorId();
    expect(primero).toBe(segundo);

    const actor = await base.prisma.actor.findUniqueOrThrow({
      where: { id: primero },
      select: { kind: true, userId: true },
    });
    expect(actor.kind).toBe('ROOT_SUPERADMIN');
    // Sin cuenta asociada: no es un sujeto de autorización, es un asidero de
    // atribución.
    expect(actor.userId).toBeNull();
  });
});

describe('la sesión raíz es independiente y más corta', () => {
  it('vive una hora frente a las doce de una sesión ordinaria', () => {
    expect(SUPERADMIN_SESSION_TTL_MS).toBeLessThan(SESSION_TTL_MS);
    expect(SUPERADMIN_SESSION_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('usa su propia cookie, con SameSite estricto', () => {
    expect(SUPERADMIN_COOKIE).not.toBe(SESSION_COOKIE);

    const estricta = sessionCookieOptions(new Date(Date.now() + 1000), true);
    const ordinaria = sessionCookieOptions(new Date(Date.now() + 1000), false);
    expect(estricta.sameSite).toBe('strict');
    expect(ordinaria.sameSite).toBe('lax');
    for (const opciones of [estricta, ordinaria]) {
      expect(opciones.httpOnly).toBe(true);
      expect(opciones.secure).toBe(true);
    }
  });

  it('resuelve a un actor raíz sin compartimentos y sin cuenta', async () => {
    const emitida = await transaction((tx) =>
      issueSession(tx, {
        userId: null,
        actorKind: 'ROOT_SUPERADMIN',
        sessionVersion: env().SUPERADMIN_SESSION_VERSION,
        ipHash: 'ip-de-prueba',
        userAgentSummary: 'prueba',
      }),
    );

    const actor = await resolveActor({
      sessionToken: null,
      rootSessionToken: emitida.token,
      correlationId: 'correlacion-raiz',
      ipHash: 'ip-de-prueba',
      userAgentSummary: 'prueba',
    });

    expect(actor.actorKind).toBe('ROOT_SUPERADMIN');
    expect(actor.userId).toBeNull();
    expect(actor.personId).toBeNull();
    expect(actor.roles).toEqual([]);
    // Conjunto vacío a propósito: es la salvaguarda que impide que una lectura
    // de soporte alcance información clínica o disciplinaria.
    expect([...actor.compartments]).toEqual([]);
  }, 60_000);

  it('su testigo no sirve como sesión ordinaria', async () => {
    const emitida = await transaction((tx) =>
      issueSession(tx, {
        userId: null,
        actorKind: 'ROOT_SUPERADMIN',
        sessionVersion: env().SUPERADMIN_SESSION_VERSION,
        ipHash: null,
        userAgentSummary: null,
      }),
    );

    // Presentado en la cookie ordinaria no concede nada: la sesión raíz no tiene
    // cuenta, y sin cuenta el resolvedor devuelve el contexto público.
    const actor = await resolveActor({
      sessionToken: emitida.token,
      rootSessionToken: null,
      correlationId: 'correlacion-cruzada',
      ipHash: null,
      userAgentSummary: null,
    });
    expect(actor.actorKind).toBe('PERSON');
    expect(actor.actorId).toBe('');
  }, 60_000);
});

describe('entrar no le da facultades sindicales', () => {
  it('administra la plataforma pero no gobierna el sindicato', async () => {
    const emitida = await transaction((tx) =>
      issueSession(tx, {
        userId: null,
        actorKind: 'ROOT_SUPERADMIN',
        sessionVersion: env().SUPERADMIN_SESSION_VERSION,
        ipHash: null,
        userAgentSummary: null,
      }),
    );
    const actor = await resolveActor({
      sessionToken: null,
      rootSessionToken: emitida.token,
      correlationId: 'correlacion-facultades',
      ipHash: null,
      userAgentSummary: null,
    });

    const conMotivo = { ...actor, reason: 'revisión técnica solicitada' };
    expect(can(conMotivo, 'system.health.read', { kind: 'System' }).allowed).toBe(true);
    expect(can(conMotivo, 'audit.audit.read', { kind: 'AuditEvent' }).allowed).toBe(true);
    expect(can(conMotivo, 'access.role.assign', { kind: 'RoleAssignment' }).reason).toBe('SIN_PERMISO');
    expect(can(conMotivo, 'identity.person.read_sensitive', { kind: 'Person' }).reason).toBe('SIN_PERMISO');
    expect(can(conMotivo, 'consent.grant', { kind: 'Consent' }).reason).toBe('SIN_PERMISO');
  }, 60_000);

  it('no puede nombrarse a sí mismo porque no existe cuenta que nombrar', async () => {
    const { assignRole } = await import('@/modules/access');
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Cualquiera' });

    const actor = await resolveActor({
      sessionToken: null,
      rootSessionToken: (
        await transaction((tx) =>
          issueSession(tx, {
            userId: null,
            actorKind: 'ROOT_SUPERADMIN',
            sessionVersion: env().SUPERADMIN_SESSION_VERSION,
            ipHash: null,
            userAgentSummary: null,
          }),
        )
      ).token,
      correlationId: 'correlacion-nombramiento',
      ipHash: null,
      userAgentSummary: null,
    });

    const resultado = await assignRole(actor, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      reason: 'intento del actor raíz de nombrar una secretaría',
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('FORBIDDEN');
  }, 60_000);
});

describe('actores de los trabajos programados', () => {
  it('cada tipo de trabajo tiene su propio actor, creado al primer uso', async () => {
    const retencion = await systemActorId('retention');
    const vencimiento = await systemActorId('role-expiry');

    expect(retencion).not.toBe(vencimiento);
    expect(await systemActorId('retention')).toBe(retencion);

    const actor = await base.prisma.actor.findUniqueOrThrow({
      where: { id: retencion },
      select: { kind: true, label: true },
    });
    expect(actor.kind).toBe('SYSTEM_JOB');
    expect(actor.label).toContain('retention');
  });
});

describe('autenticación de las rutas programadas', () => {
  const conCabecera = (valor: string | null) =>
    new Request('https://ejemplo.invalid/api/v1/cron/dispatch', {
      headers: valor === null ? {} : { authorization: valor },
    });

  it('acepta el secreto correcto', () => {
    expect(isAuthorizedCron(conCabecera(`Bearer ${env().CRON_SECRET}`))).toBe(true);
  });

  it('rechaza la ausencia de cabecera, el esquema equivocado y el secreto incorrecto', () => {
    expect(isAuthorizedCron(conCabecera(null))).toBe(false);
    expect(isAuthorizedCron(conCabecera(env().CRON_SECRET))).toBe(false);
    expect(isAuthorizedCron(conCabecera(`Basic ${env().CRON_SECRET}`))).toBe(false);
    expect(isAuthorizedCron(conCabecera('Bearer secreto-equivocado'))).toBe(false);
  });

  it('rechaza un prefijo correcto del secreto', () => {
    // La comparación es en tiempo constante justo para que un prefijo correcto
    // no se distinga de uno incorrecto por la duración de la respuesta.
    const secreto = env().CRON_SECRET;
    expect(isAuthorizedCron(conCabecera(`Bearer ${secreto.slice(0, -1)}`))).toBe(false);
    expect(isAuthorizedCron(conCabecera(`Bearer ${secreto}x`))).toBe(false);
  });
});
