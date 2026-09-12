import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyRootCredentials, rootActorId, systemActorId } from '@/platform/auth/superadmin';
import { resolveActor } from '@/platform/auth/actor-resolver';
import {
  issueSession,
  resolveSession,
  revokeSession,
  SUPERADMIN_COOKIE,
  SESSION_COOKIE,
  SUPERADMIN_SESSION_TTL_MS,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '@/platform/auth/session';
import { transaction } from '@/platform/db/unit-of-work';
import { can } from '@/platform/authz/policy';
import { updateLegalEntity } from '@/modules/admin';
import { activateInitialRules } from '@/modules/governance';
import { isAuthorizedCron } from '@/platform/http/cron-auth';
import { env, resetEnvCache } from '@/platform/config/env';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';
import { ROOT_TEST_PASSWORD } from './setup-env';

/**
 * Superadmin raíz y trabajos programados (PRD §4.4, §17.5, docs/SECURITY.md §3).
 *
 * Criterio de la fase: **un Superadmin puede iniciar sesión sin existir como
 * miembro**. Su correo y su hash viven en el entorno; en la base solo tiene un
 * `Actor` de atribución. Ese actor recibe el acceso total decidido en ADR-0174
 * y permite sacar a una instalación nueva del arranque circular.
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
    const resultado = verifyRootCredentials(env().SUPERADMIN_EMAIL, ROOT_TEST_PASSWORD);
    expect(resultado.ok).toBe(true);

    // No hay ninguna persona ni cuenta que le corresponda: su acceso no depende
    // del padrón, y por eso puede administrar un sistema todavía vacío.
    expect(await base.prisma.person.count()).toBe(0);
    expect(await base.prisma.user.count()).toBe(0);
  });

  it('rechaza la contraseña incorrecta y el correo incorrecto por igual', () => {
    expect((verifyRootCredentials(env().SUPERADMIN_EMAIL, 'otra cosa')).ok).toBe(false);
    expect((verifyRootCredentials('otro@ejemplo.invalid', ROOT_TEST_PASSWORD)).ok).toBe(false);
    expect((verifyRootCredentials('otro@ejemplo.invalid', 'otra cosa')).ok).toBe(false);
  });

  it('el correo se compara sin distinguir mayúsculas ni espacios sobrantes', () => {
    const variante = `  ${env().SUPERADMIN_EMAIL.toUpperCase()}  `;
    expect((verifyRootCredentials(variante, ROOT_TEST_PASSWORD)).ok).toBe(true);
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

describe('la sesión raíz es independiente y de larga duración', () => {
  it('no caduca sola: dura mucho más que una sesión ordinaria (ADR-0176)', () => {
    expect(SUPERADMIN_SESSION_TTL_MS).toBeGreaterThan(SESSION_TTL_MS);
    expect(SUPERADMIN_SESSION_TTL_MS).toBe(10 * 365 * 24 * 60 * 60 * 1000);
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

  it('resuelve a un actor raíz sin cuenta pero con todos los compartimentos', async () => {
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
    // Acceso total (ADR-0174): la raíz tiene los tres compartimentos.
    expect([...actor.compartments].sort()).toEqual(['DISCIPLINARY', 'SOCIAL', 'UNION']);
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

describe('la raíz tiene acceso total (ADR-0174)', () => {
  it('puede administrar y también gobernar: rol, datos sensibles y consentimiento', async () => {
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

    // Acceso total: incluso sin escribir un motivo, la raíz pasa todas las puertas.
    expect(can(actor, 'system.health.read', { kind: 'System' }).allowed).toBe(true);
    expect(can(actor, 'audit.audit.read', { kind: 'AuditEvent' }).allowed).toBe(true);
    expect(can(actor, 'access.role.assign', { kind: 'RoleAssignment' }).allowed).toBe(true);
    expect(can(actor, 'identity.person.read_sensitive', { kind: 'Person' }).allowed).toBe(true);
    expect(can(actor, 'consent.grant', { kind: 'Consent' }).allowed).toBe(true);
  }, 60_000);

  it('puede nombrar a la primera Secretaría Ejecutiva para salir del arranque circular', async () => {
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

    expect(can(actor, 'access.role.assign', { kind: 'RoleAssignment' }).allowed).toBe(true);

    const entidadId = await entidadPrincipal(base.prisma);
    const resultado = await assignRole(actor, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      reason: 'la raíz intenta nombrar una secretaría',
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;

    const assignment = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: resultado.data.assignmentId },
      select: { grantedById: true, grantReason: true },
    });
    // La cuenta designada ocupa el campo relacional obligatorio; el acto real
    // queda atribuido al actor raíz en la bitácora y marcado como arranque.
    expect(assignment.grantedById).toBe(persona.userId);
    expect(assignment.grantReason).toContain('raíz');

    const segundo = await crearPersonaConCuenta(base.prisma, { givenName: 'Segunda' });
    const duplicado = await assignRole(actor, {
      userId: segundo.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      reason: 'intento de repetir la puesta en marcha inicial',
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(duplicado.ok).toBe(false);
    expect(!duplicado.ok && duplicado.error.code).toBe('RULE_VIOLATION');
  }, 60_000);

  it('completa la entidad jurídica con concurrencia y auditoría', async () => {
    const actorId = await rootActorId();
    const actor = {
      actorId,
      actorKind: 'ROOT_SUPERADMIN' as const,
      userId: null,
      personId: null,
      jobType: null,
      sessionId: null,
      roles: [],
      legalEntityScope: [],
      compartments: new Set<'UNION' | 'SOCIAL' | 'DISCIPLINARY'>(['UNION', 'SOCIAL', 'DISCIPLINARY']),
      reason: null,
      correlationId: 'configuracion-entidad-raiz',
      ipHash: null,
      userAgentSummary: 'prueba',
      locale: 'es-MX',
      timeZone: 'America/Mexico_City',
    };
    const entity = await base.prisma.legalEntity.findUniqueOrThrow({
      where: { code: 'FUERZA_INDIGO' },
      select: { id: true, legalName: true, shortName: true, contactEmail: true, rowVersion: true },
    });

    const result = await updateLegalEntity(actor, {
      legalEntityId: entity.id,
      rowVersion: entity.rowVersion,
      legalName: entity.legalName,
      shortName: entity.shortName,
      taxId: '',
      registryNumber: 'REGISTRO-SINDICAL-DE-PRUEBA',
      address: 'Domicilio institucional ficticio para la prueba',
      contactEmail: entity.contactEmail,
      privacyNoticeUrl: '',
      reason: 'completar la ficha durante la puesta en marcha',
    });
    expect(result.ok, result.ok ? '' : result.error.message).toBe(true);

    const updated = await base.prisma.legalEntity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(updated.registryNumber).toBe('REGISTRO-SINDICAL-DE-PRUEBA');
    expect(updated.rowVersion).toBe(entity.rowVersion + 1);
  });

  it('registra la primera versión desde el instrumento constitutivo, pero nunca una reforma', async () => {
    const actorId = await rootActorId();
    const actor = {
      actorId,
      actorKind: 'ROOT_SUPERADMIN' as const,
      userId: null,
      personId: null,
      jobType: null,
      sessionId: null,
      roles: [],
      legalEntityScope: [],
      compartments: new Set<'UNION' | 'SOCIAL' | 'DISCIPLINARY'>(['UNION', 'SOCIAL', 'DISCIPLINARY']),
      reason: null,
      correlationId: 'reglas-iniciales-raiz',
      ipHash: null,
      userAgentSummary: 'prueba',
      locale: 'es-MX',
      timeZone: 'America/Mexico_City',
    };
    const initial = await base.prisma.normativeRuleSet.findUniqueOrThrow({ where: { version: '2026.1' } });
    const completeRules = {
      executiveCommitteeTermMonths: 48,
      oversightCommissionSeats: 3,
      electoralCommissionSeats: 3,
      firstCallQuorum: 'HALF_PLUS_ONE',
      secondCallQuorum: 'THOSE_PRESENT',
      ordinaryMajority: 'SIMPLE',
      ordinaryAssemblyMinimumPerYear: 1,
      assemblyNoticeDaysOrdinary: 15,
      assemblyNoticeDaysExtraordinary: 8,
      extraordinaryAssemblyPetitionPercent: 33,
      reelectionAllowed: false,
      statuteAmendmentMajority: 'TWO_THIRDS',
      dissolutionMajority: 'THREE_FOURTHS',
      electionCallNoticeDays: 30,
      genderProportionalityMinPercent: 40,
      disciplinaryAnswerDays: 10,
      disciplinaryAppealDays: 15,
      bargainingConsultationMajority: 'SIMPLE',
    };
    await base.prisma.normativeRuleSet.update({ where: { id: initial.id }, data: { rules: completeRules } });

    const result = await activateInitialRules(actor, {
      ruleSetId: initial.id,
      effectiveFrom: '2026-01-01',
      foundingInstrumentReference: 'Acta constitutiva ficticia número uno',
      reason: 'registrar las reglas constitutivas de la prueba',
    });
    expect(result.ok, result.ok ? '' : result.error.message).toBe(true);

    const second = await base.prisma.normativeRuleSet.create({
      data: {
        version: '2026.2',
        status: 'DRAFT',
        rules: completeRules,
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
    });
    const repeated = await activateInitialRules(actor, {
      ruleSetId: second.id,
      effectiveFrom: '2026-02-01',
      foundingInstrumentReference: 'Una referencia que ya no puede usarse',
      reason: 'intento de omitir el acuerdo de asamblea posterior',
    });
    expect(repeated.ok).toBe(false);
    expect(!repeated.ok && repeated.error.code).toBe('CONFLICT');
  });
});

describe('la sesión raíz se puede revocar de verdad', () => {
  async function abrirSesionRaiz(version = env().SUPERADMIN_SESSION_VERSION) {
    return transaction((tx) =>
      issueSession(tx, {
        userId: null,
        actorKind: 'ROOT_SUPERADMIN',
        sessionVersion: version,
        ipHash: null,
        userAgentSummary: null,
      }),
    );
  }

  it('rotar SUPERADMIN_SESSION_VERSION invalida las sesiones abiertas', async () => {
    // Es el único mecanismo de expulsión inmediata de quien sospeche que la
    // credencial raíz se comprometió. Antes se guardaba al abrir la sesión y no
    // se volvía a mirar, de modo que rotarlo no invalidaba nada aunque la
    // documentación prometiera que sí (`D-F1-014`).
    const emitida = await abrirSesionRaiz();
    expect(await resolveSession(emitida.token)).not.toBeNull();

    const anterior = process.env['SUPERADMIN_SESSION_VERSION'];
    try {
      process.env['SUPERADMIN_SESSION_VERSION'] = String(env().SUPERADMIN_SESSION_VERSION + 1);
      resetEnvCache();
      expect(await resolveSession(emitida.token)).toBeNull();
    } finally {
      if (anterior === undefined) delete process.env['SUPERADMIN_SESSION_VERSION'];
      else process.env['SUPERADMIN_SESSION_VERSION'] = anterior;
      resetEnvCache();
    }

    // Y al volver la versión anterior, la sesión no resucita por sí sola porque
    // el testigo siga existiendo: vuelve a coincidir, que es lo esperado.
    expect(await resolveSession(emitida.token)).not.toBeNull();
  }, 60_000);

  it('una sesión abierta con una versión antigua no resuelve', async () => {
    const emitida = await abrirSesionRaiz(env().SUPERADMIN_SESSION_VERSION - 1);
    expect(await resolveSession(emitida.token)).toBeNull();
  }, 60_000);

  it('cerrar sesión revoca la fila, no solo la cookie del navegador', async () => {
    // Borrar solo la cookie dejaba el testigo válido hasta vencer: quien lo
    // hubiera copiado seguía dentro después de que la persona creyera salir.
    const emitida = await abrirSesionRaiz();
    expect(await resolveSession(emitida.token)).not.toBeNull();

    await transaction((tx) => revokeSession(tx, emitida.sessionId, 'LOGOUT'));

    expect(await resolveSession(emitida.token)).toBeNull();
    const fila = await base.prisma.session.findUniqueOrThrow({
      where: { id: emitida.sessionId },
      select: { revokedAt: true, revokedReason: true },
    });
    expect(fila.revokedAt).not.toBeNull();
    expect(fila.revokedReason).toBe('LOGOUT');
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
