import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma-client/client';
import { healthReport } from '@/platform/health';
import { PERMISSIONS } from '@/platform/authz/permissions';
import { createTestDatabase, type TestDatabase } from './helpers/database';

/**
 * E2E-15 · Despliegue desde base vacía (docs/TEST_PLAN.md §4, §6).
 *
 * Recorre lo que hace un despliegue real y en el mismo orden: migraciones sobre
 * una base vacía, semilla, verificación de salud y arranque de la primera
 * Secretaría Ejecutiva. Lo que se comprueba no es que cada paso funcione por
 * separado, sino que **encadenados dejan un sistema utilizable**: una base
 * migrada sin nadie capaz de operarla no es un despliegue, es una base.
 */

let base: TestDatabase | null = null;

afterEach(async () => {
  if (base !== null) await base.destroy();
  base = null;
});

describe('la semilla', () => {
  it('deja el catálogo completo y es idempotente', async () => {
    base = await createTestDatabase('despliegue');
    await base.seed();

    const primera = {
      entidades: await base.prisma.legalEntity.count(),
      territorios: await base.prisma.territorialUnit.count(),
      roles: await base.prisma.role.count(),
      permisos: await base.prisma.permission.count(),
      retencion: await base.prisma.retentionPolicy.count(),
      especialidades: await base.prisma.specialtyCatalog.count(),
      plantillas: await base.prisma.notificationTemplate.count(),
      reglas: await base.prisma.normativeRuleSet.count(),
      enlaces: await base.prisma.rolePermission.count(),
    };

    expect(primera.entidades).toBe(2);
    expect(primera.roles).toBe(19);
    expect(primera.permisos).toBe(PERMISSIONS.length);
    expect(primera.territorios).toBeGreaterThan(30);
    expect(primera.reglas).toBeGreaterThan(0);

    // Segunda ejecución: no duplica nada. Una semilla que no se puede repetir
    // convierte cada despliegue en una operación manual con riesgo.
    await base.seed();

    expect({
      entidades: await base.prisma.legalEntity.count(),
      territorios: await base.prisma.territorialUnit.count(),
      roles: await base.prisma.role.count(),
      permisos: await base.prisma.permission.count(),
      retencion: await base.prisma.retentionPolicy.count(),
      especialidades: await base.prisma.specialtyCatalog.count(),
      plantillas: await base.prisma.notificationTemplate.count(),
      reglas: await base.prisma.normativeRuleSet.count(),
      enlaces: await base.prisma.rolePermission.count(),
    }).toEqual(primera);
  }, 180_000);

  it('no siembra ni una sola persona: el padrón no se inventa', async () => {
    base = await createTestDatabase('semilla_sin_personas');
    await base.seed();

    // Sembrar personas ficticias en un ambiente compartido es exactamente el
    // «dato simulado en producción» que el PRD §0.3 prohíbe.
    expect(await base.prisma.person.count()).toBe(0);
    expect(await base.prisma.user.count()).toBe(0);
    expect(await base.prisma.credential.count()).toBe(0);
  }, 120_000);

  it('el catálogo de permisos de la base coincide con el del código', async () => {
    base = await createTestDatabase('semilla_permisos');
    await base.seed();

    const enBase = (await base.prisma.permission.findMany({ select: { code: true } })).map((fila) => fila.code).sort();
    const enCodigo = PERMISSIONS.map((permiso) => permiso.code).sort();
    expect(enBase).toEqual(enCodigo);
  }, 120_000);

  it('la ruta materializada de cada territorio concuerda con la de su superior', async () => {
    base = await createTestDatabase('semilla_territorio');
    await base.seed();

    const unidades = await base.prisma.territorialUnit.findMany({
      select: { id: true, path: true, depth: true, parentId: true },
    });
    const porId = new Map(unidades.map((unidad) => [unidad.id, unidad]));

    for (const unidad of unidades) {
      if (unidad.parentId === null) {
        expect(unidad.depth, `${unidad.path} es raíz y su profundidad no es cero`).toBe(0);
        continue;
      }
      const superior = porId.get(unidad.parentId);
      expect(superior, `${unidad.path} apunta a un superior inexistente`).toBeDefined();
      expect(unidad.path.startsWith(`${superior!.path}/`), `${unidad.path} no cuelga de ${superior!.path}`).toBe(true);
      expect(unidad.depth).toBe(superior!.depth + 1);
    }
  }, 120_000);
});

describe('la verificación de salud', () => {
  it('responde correctamente sobre una base recién desplegada', async () => {
    base = await createTestDatabase('salud');
    await base.seed();

    const informe = await healthReport();
    expect(['ok', 'degraded']).toContain(informe.status);
    expect(informe.checks.length).toBeGreaterThan(0);

    const fallidas = informe.checks.filter((control) => control.status === 'failed');
    expect(fallidas.map((control) => control.name)).toEqual([]);

    const baseDatos = informe.checks.find((control) => control.name.includes('base'));
    expect(baseDatos?.status).toBe('ok');
  }, 120_000);
});

describe('el arranque de la primera Secretaría Ejecutiva', () => {
  it('crea la cuenta, la nombra y entrega un enlace de activación de un solo uso', async () => {
    base = await createTestDatabase('arranque');
    await base.seed();

    const salida = execFileSync('npx', ['tsx', 'scripts/access/bootstrap-secretary.ts'], {
      input: 'secretaria@ejemplo.invalid\nAna\nRuiz\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, DIRECT_URL: process.env['DIRECT_URL'] ?? '', APP_URL: 'https://ejemplo.invalid' },
    });

    expect(salida).toContain('Secretaría Ejecutiva creada');
    expect(salida).toMatch(/https:\/\/ejemplo\.invalid\/activar\/[A-Za-z0-9_-]{43}/);

    const usuaria = await base.prisma.user.findUniqueOrThrow({
      where: { email: 'secretaria@ejemplo.invalid' },
      select: {
        id: true,
        status: true,
        mustChangePassword: true,
        credentials: { select: { id: true } },
        roleAssignments: { select: { role: { select: { code: true } }, grantReason: true } },
      },
    });

    // Nace sin contraseña y sin poder entrar: una invitación equivocada no
    // concede acceso a nadie hasta que su titular activa el enlace.
    expect(usuaria.status).toBe('INVITED');
    expect(usuaria.mustChangePassword).toBe(true);
    expect(usuaria.credentials).toHaveLength(0);

    expect(usuaria.roleAssignments).toHaveLength(1);
    expect(usuaria.roleAssignments[0]?.role.code).toBe('EXECUTIVE_SECRETARY');
    expect(usuaria.roleAssignments[0]?.grantReason).toContain('arranque');

    // Su actor de atribución existe desde el principio.
    const actor = await base.prisma.actor.findUnique({ where: { userId: usuaria.id }, select: { kind: true } });
    expect(actor?.kind).toBe('PERSON');

    // El acto queda registrado como crítico en la bitácora de seguridad.
    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'PRIVILEGE_GRANTED' },
      select: { severity: true, detail: true },
    });
    expect(evento.severity).toBe('CRITICAL');
    expect(JSON.stringify(evento.detail)).toContain('guion de arranque');
  }, 180_000);

  it('exige que la semilla haya corrido antes', async () => {
    base = await createTestDatabase('arranque_sin_semilla');

    let mensaje = '';
    try {
      execFileSync('npx', ['tsx', 'scripts/access/bootstrap-secretary.ts'], {
        input: '\n',
        encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DIRECT_URL: process.env['DIRECT_URL'] ?? '' },
      });
    } catch (error) {
      const fallo = error as { stdout?: string; stderr?: string };
      mensaje = `${fallo.stdout ?? ''}${fallo.stderr ?? ''}`;
    }
    expect(mensaje).toContain('catálogo de roles no está sembrado');
  }, 120_000);

  it('rechaza un correo con formato inválido en lugar de crear una cuenta rota', async () => {
    base = await createTestDatabase('arranque_correo');
    await base.seed();

    let mensaje = '';
    try {
      execFileSync('npx', ['tsx', 'scripts/access/bootstrap-secretary.ts'], {
        input: 'no-es-un-correo\nAna\nRuiz\n\n',
        encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DIRECT_URL: process.env['DIRECT_URL'] ?? '' },
      });
    } catch (error) {
      const fallo = error as { stdout?: string; stderr?: string };
      mensaje = `${fallo.stdout ?? ''}${fallo.stderr ?? ''}`;
    }
    expect(mensaje).toContain('formato válido');
    expect(await base.prisma.user.count()).toBe(0);
  }, 180_000);
});

describe('la aplicación se conecta con el rol acotado', () => {
  it('el cliente de la aplicación no es el propietario de la base', async () => {
    base = await createTestDatabase('rol_de_aplicacion');

    const { rows } = await base.sql.query<{ rolname: string }>(`SELECT current_user AS rolname`);
    const propietario = rows[0]?.rolname;

    const aplicacion = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.url }) });
    try {
      const usuario = await aplicacion.$queryRaw<{ rolname: string }[]>`SELECT current_user AS rolname`;
      expect(usuario[0]?.rolname).not.toBe(propietario);
    } finally {
      await aplicacion.$disconnect();
    }
  }, 120_000);
});
