import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyRootCredentials, rootActorId, rootInstitutionalUserId, systemActorId } from '@/platform/auth/superadmin';
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
import {
  startAssistedApplication,
  submitApplication,
  startReview,
  resolveApplication,
} from '@/modules/membership';
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
  it('entra con las credenciales del entorno, sin consultar la base', () => {
    // Sin `await` a propósito: comprobar la credencial de la raíz no toca la
    // base. Por eso puede administrar una instalación recién encendida.
    const resultado = verifyRootCredentials(env().SUPERADMIN_EMAIL, ROOT_TEST_PASSWORD);
    expect(resultado.ok).toBe(true);
  });

  /**
   * La raíz **sí** tiene ahora una cuenta institucional, porque varios actos
   * —tomar y resolver una solicitud de afiliación, responder una aclaración—
   * exigen una persona identificada y no un actor. Lo que esa cuenta no hace es
   * abrir un segundo camino de acceso: nace sin credencial, de modo que nadie
   * puede iniciar sesión con ella por la puerta ordinaria.
   *
   * Si algún día se le crea una credencial, esta prueba cae. Debe caer: sería
   * una contraseña más con acceso total, fuera del entorno y fuera de rotación.
   */
  it('su cuenta institucional existe y no abre un segundo camino de acceso', async () => {
    const cuenta = await base.prisma.user.findUnique({
      where: { email: env().SUPERADMIN_EMAIL.trim().toLowerCase() },
      select: { id: true, status: true, _count: { select: { credentials: true } } },
    });
    expect(cuenta, 'la semilla debe crear la cuenta institucional de la raíz').not.toBeNull();
    expect(cuenta?.status).toBe('ACTIVE');
    expect(cuenta?._count.credentials).toBe(0);
  });

  it('recrea la cuenta institucional si una instalación antigua no la tiene', async () => {
    const email = env().SUPERADMIN_EMAIL.trim().toLowerCase();
    const anterior = await base.prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, personId: true },
    });

    await base.prisma.user.delete({ where: { id: anterior.id } });

    const recreadaId = await rootInstitutionalUserId();
    const recreada = await base.prisma.user.findUniqueOrThrow({
      where: { id: recreadaId },
      select: {
        email: true,
        personId: true,
        status: true,
        _count: { select: { credentials: true } },
      },
    });

    expect(recreada.email).toBe(email);
    expect(recreada.personId).toBe(anterior.personId);
    expect(recreada.status).toBe('ACTIVE');
    expect(recreada._count.credentials).toBe(0);
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

  it('resuelve a un actor raíz con su cuenta institucional y todos los compartimentos', async () => {
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

    const institucional = await base.prisma.user.findUniqueOrThrow({
      where: { email: env().SUPERADMIN_EMAIL.trim().toLowerCase() },
      select: { id: true },
    });

    expect(actor.actorKind).toBe('ROOT_SUPERADMIN');
    // Actúa con su cuenta institucional allí donde el sistema exige una persona.
    expect(actor.userId).toBe(institucional.id);
    // Y su poder no viene de un rol: sigue sin ninguno, como siempre.
    expect(actor.roles).toEqual([]);
    // Acceso total (ADR-0174): la raíz tiene los tres compartimentos.
    expect([...actor.compartments].sort()).toEqual(['DISCIPLINARY', 'SOCIAL', 'UNION']);
  }, 60_000);

  it('autocura la cuenta institucional si falta, sin crear credencial ordinaria', async () => {
    const email = env().SUPERADMIN_EMAIL.trim().toLowerCase();
    const anterior = await base.prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, personId: true },
    });

    await base.prisma.user.delete({ where: { id: anterior.id } });

    const emitida = await transaction((tx) =>
      issueSession(tx, {
        userId: null,
        actorKind: 'ROOT_SUPERADMIN',
        sessionVersion: env().SUPERADMIN_SESSION_VERSION,
        ipHash: 'ip-autocuracion',
        userAgentSummary: 'prueba-autocuracion',
      }),
    );

    const actor = await resolveActor({
      sessionToken: null,
      rootSessionToken: emitida.token,
      correlationId: 'correlacion-autocuracion',
      ipHash: 'ip-autocuracion',
      userAgentSummary: 'prueba-autocuracion',
    });

    const recreada = await base.prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        id: true,
        personId: true,
        status: true,
        _count: { select: { credentials: true } },
      },
    });

    expect(actor.actorKind).toBe('ROOT_SUPERADMIN');
    expect(actor.userId).toBe(recreada.id);
    expect(recreada.personId).toBe(anterior.personId);
    expect(recreada.status).toBe('ACTIVE');
    expect(recreada._count.credentials).toBe(0);
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
    // El otorgante es la cuenta institucional de la raíz. Antes se anotaba a la
    // propia persona designada, porque la columna es obligatoria y la raíz no
    // tenía cuenta: se nombraba a sí misma. Ahora dice quién nombró de verdad.
    const institucional = await base.prisma.user.findUniqueOrThrow({
      where: { email: env().SUPERADMIN_EMAIL.trim().toLowerCase() },
      select: { id: true },
    });
    expect(assignment.grantedById).toBe(institucional.id);
    expect(assignment.grantedById).not.toBe(persona.userId);
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

/** Contexto de una sesión raíz viva, como la que resuelve una petición real. */
async function raizAutenticada() {
  const emitida = await transaction((tx) =>
    issueSession(tx, {
      userId: null,
      actorKind: 'ROOT_SUPERADMIN',
      sessionVersion: env().SUPERADMIN_SESSION_VERSION,
      ipHash: null,
      userAgentSummary: null,
    }),
  );
  return resolveActor({
    sessionToken: null,
    rootSessionToken: emitida.token,
    correlationId: 'correlacion-afiliacion',
    ipHash: null,
    userAgentSummary: null,
  });
}

describe('la raíz puede dar de alta y aceptar una afiliación', () => {
  /**
   * Es lo que el acceso total del ADR-0174 prometía y la base impedía. Los
   * permisos nunca fueron el problema —la raíz los tiene todos—: `reviewerId` y
   * `resolvedById` apuntan a `User` y no admiten vacío, de modo que sin cuenta
   * institucional los seis actos de revisión fallaban con «necesitas haber
   * iniciado sesión», después de que la pantalla ya se hubiera pintado entera.
   *
   * Se ejerce el recorrido completo, no una comprobación de permiso: dar de
   * alta, tomar la revisión y resolver. Y se mira después lo que quedó escrito,
   * que es lo que de verdad importa: el expediente tiene que poder decir quién
   * admitió a esa persona.
   */
  it('recorre alta, revisión y resolución, y el expediente dice quién resolvió', async () => {
    const actor = await raizAutenticada();

    const solicitante = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Se Afilia' });
    const calidad = await base.prisma.membershipType.findFirstOrThrow({
      where: { code: 'AGREMIADO' },
      select: { id: true },
    });

    const alta = await startAssistedApplication(actor, {
      personId: solicitante.personId,
      membershipTypeId: calidad.id,
      territorialUnitId: null,
    });
    expect(alta.ok, alta.ok ? '' : alta.error.message).toBe(true);
    if (!alta.ok) return;

    // La captura asistida nace en borrador; presentarla es lo que la pone en
    // trámite, igual que en el formulario público.
    const oficio = await base.prisma.specialtyCatalog.findFirstOrThrow({ select: { id: true } });
    const presentada = await submitApplication(actor, {
      category: 'UNION_MEMBER',
      applicationId: alta.data.applicationId,
      personId: solicitante.personId,
      membershipTypeId: calidad.id,
      territorialUnitId: null,
      occupationSpecialtyId: oficio.id,
      workRelationKind: 'INDEPENDENT',
      neurodivergentContactStatement:
        'Acompaño a personas neurodivergentes en su entorno laboral desde hace varios años.',
      otherUnionMembership: 'NONE',
      otherUnionClarification: null,
      acceptsStatutes: true,
    });
    expect(presentada.ok, presentada.ok ? '' : presentada.error.message).toBe(true);

    const tomada = await startReview(actor, {
      applicationId: alta.data.applicationId,
      note: 'La revisa la administración durante la puesta en marcha.',
    });
    expect(tomada.ok, tomada.ok ? '' : tomada.error.message).toBe(true);

    const resuelta = await resolveApplication(actor, {
      applicationId: alta.data.applicationId,
      decision: 'APPROVED',
      rationale:
        'Cumple los requisitos estatutarios de afiliación y acompañó la documentación exigida. Se admite.',
    });
    expect(resuelta.ok, resuelta.ok ? '' : resuelta.error.message).toBe(true);
    if (!resuelta.ok) return;
    expect(resuelta.data.status).toBe('APPROVED');

    const institucional = await base.prisma.user.findUniqueOrThrow({
      where: { email: env().SUPERADMIN_EMAIL.trim().toLowerCase() },
      select: { id: true },
    });
    const expediente = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: alta.data.applicationId },
      select: { status: true, resolvedById: true },
    });
    // Aprobar no deja el expediente en «aprobado»: esta calidad no exige cobro
    // previo, así que la resolución activa la membresía en el mismo acto y el
    // estado final es `ACTIVATED`. Se admiten los dos para no atar la prueba a
    // si una calidad cobra o no.
    expect(['APPROVED', 'ACTIVATED']).toContain(expediente.status);
    // Lo que esto compra: la pregunta «¿quién admitió a esta persona?» tiene
    // respuesta en el propio expediente, no solo en la bitácora.
    expect(expediente.resolvedById).toBe(institucional.id);

    const revisiones = await base.prisma.applicationReview.findMany({
      where: { applicationId: alta.data.applicationId },
      select: { reviewerId: true },
    });
    expect(revisiones.length).toBeGreaterThan(0);
    for (const revision of revisiones) expect(revision.reviewerId).toBe(institucional.id);
  }, 120_000);
});
