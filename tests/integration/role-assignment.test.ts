import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assignRole, assignableRoles, liveAssignments, revokeRole } from '@/modules/access';
import { can } from '@/platform/authz/policy';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';

/**
 * Nombramientos (PRD §4.3, docs/PERMISSIONS.md §7 y §9).
 *
 * Criterio de aceptación de la Fase 1: **un administrador ordinario no puede
 * asignarse permisos superiores**. Los dos controles que lo garantizan se
 * prueban aquí en negativo, que es la única forma de saber que existen: un
 * control que solo se prueba en positivo se puede borrar sin que nada falle.
 */

let base: TestDatabase;
let secretaria: PersonaDePrueba;
let delegada: PersonaDePrueba;
let sinRol: PersonaDePrueba;
let entidadId: string;
let otraEntidadId: string;

beforeAll(async () => {
  base = await createTestDatabase('nombramientos');
  await base.seed();

  secretaria = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Ejecutiva' });
  delegada = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'Territorial' });
  sinRol = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Nombramiento' });

  entidadId = await entidadPrincipal(base.prisma);
  const otra = await base.prisma.legalEntity.findFirstOrThrow({
    where: { code: { not: 'FUERZA_INDIGO' } },
    select: { id: true },
  });
  otraEntidadId = otra.id;

  await nombrar(base.prisma, {
    userId: secretaria.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretaria.userId,
    legalEntityId: entidadId,
  });
  await nombrar(base.prisma, {
    userId: delegada.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: secretaria.userId,
    legalEntityId: entidadId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const MOTIVO = 'nombramiento acordado en la sesión del comité del 3 de septiembre';

describe('la facultad de nombrar existe y está en alguien', () => {
  it('la Secretaría Ejecutiva puede otorgar nombramientos', async () => {
    // Sin esta prueba, un catálogo en el que nadie tuviera `access.role.assign`
    // pasaría inadvertido: todas las pruebas negativas seguirían en verde y el
    // sistema desplegado sería incapaz de nombrar a nadie, para siempre.
    const actor = await contextoDe(base.prisma, secretaria);
    expect(can({ ...actor, reason: MOTIVO }, 'access.role.assign', { kind: 'RoleAssignment' }).allowed).toBe(true);
  });

  it('el Superadmin raíz no la tiene, y esa ausencia es deliberada', async () => {
    const filas = await base.prisma.role.findMany({
      where: { permissions: { some: { permission: { code: 'access.role.assign' } } } },
      select: { code: true },
    });
    expect(filas.map((fila) => fila.code)).toEqual(['EXECUTIVE_SECRETARY']);
  });

  it('otorga de verdad y el nombramiento queda vigente', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'UNION_MEMBER',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;

    const creado = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: resultado.data.assignmentId },
      select: { userId: true, grantedById: true, grantReason: true, revokedAt: true },
    });
    expect(creado.userId).toBe(sinRol.userId);
    expect(creado.grantedById).toBe(secretaria.userId);
    expect(creado.grantReason).toBe(MOTIVO);
    expect(creado.revokedAt).toBeNull();
  });
});

describe('prueba negativa 2 · escalamiento vertical', () => {
  it('nadie otorga un rol con permisos que no posee', async () => {
    // La delegada territorial no tiene `audit.audit.read`, que sí tiene la
    // auditoría. Intentar crear una auditoría sería concederse por interpósita
    // persona lo que ella misma no puede.
    const actor = await contextoDe(base.prisma, delegada);
    const resultado = await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'AUDITOR',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // Antes que nada, le falta el propio permiso de nombrar.
    expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('quien sí puede nombrar tampoco otorga por encima de sí misma', async () => {
    // La Secretaría Ejecutiva sí tiene `access.role.assign`, pero no tiene
    // `audit.audit.read`: la regla la alcanza igual.
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'AUDITOR',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('FORBIDDEN');
    expect(resultado.error.internalReason).toContain('permisos que el actor no posee');
    expect(resultado.error.internalReason).toContain('audit.audit.read');
    // El mensaje visible no enumera los permisos: no es información para quien
    // acaba de intentar escalar.
    expect(resultado.error.message).not.toContain('audit.audit.read');
  });

  it('el intento queda en la bitácora de seguridad como crítico', async () => {
    const evento = await base.prisma.securityEvent.findFirstOrThrow({
      where: { kind: 'ACCESS_DENIED', severity: 'CRITICAL' },
      orderBy: { occurredAt: 'desc' },
      select: { detail: true, actorId: true },
    });
    expect(JSON.stringify(evento.detail)).toContain('elevación de privilegios');
    expect(evento.actorId).toBe(secretaria.actorId);
  });

  it('la pantalla no ofrece siquiera los roles que la regla va a rechazar', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const roles = await assignableRoles(actor);
    expect(roles.ok).toBe(true);
    if (!roles.ok) return;

    const codigos = roles.data.map((rol) => rol.code);
    expect(codigos).toContain('UNION_MEMBER');
    expect(codigos).not.toContain('AUDITOR');
    expect(codigos).not.toContain('OVERSIGHT_COMMISSION');
  });
});

describe('prueba negativa 2 bis · autonombramiento', () => {
  it('nadie se otorga un rol a sí mismo, ni siquiera uno que ya tiene', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: secretaria.userId,
      roleCode: 'UNION_MEMBER',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('RULE_VIOLATION');
    expect(resultado.error.internalReason).toContain('autonombramiento');
    // El mensaje explica el porqué institucional, no solo que está prohibido.
    expect(resultado.error.message).toContain('otra persona');
  });

  it('el control no es redundante: sin él, el rol propio pasaría la regla de no elevación', async () => {
    // La Secretaría tiene todos los permisos de su propio rol, de modo que
    // otorgárselo a sí misma no elevaría nada y el control 2 no lo detendría.
    // Lo que impide es concentrar cargos saltándose quién nombra a quién.
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: secretaria.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.internalReason).toContain('autonombramiento');
  });

  it('la propia cuenta no aparece entre las personas nombrables', async () => {
    const { accountsForAppointment } = await import('@/modules/access');
    const actor = await contextoDe(base.prisma, secretaria);
    const cuentas = await accountsForAppointment(actor);
    expect(cuentas.ok).toBe(true);
    if (!cuentas.ok) return;
    expect(cuentas.data.map((cuenta) => cuenta.userId)).not.toContain(secretaria.userId);
  });
});

describe('quien no tiene la facultad', () => {
  it('no puede nombrar y el intento se registra', async () => {
    const actor = await contextoDe(base.prisma, sinRol);
    const resultado = await assignRole(actor, {
      userId: delegada.userId,
      roleCode: 'UNION_MEMBER',
      reason: MOTIVO,
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('FORBIDDEN');

    const evento = await base.prisma.securityEvent.findFirst({
      where: { kind: 'ACCESS_DENIED', actorId: sinRol.actorId },
      orderBy: { occurredAt: 'desc' },
    });
    expect(evento).not.toBeNull();
  });

  it('un motivo demasiado corto se rechaza como validación, con el campo señalado', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'UNION_MEMBER',
      reason: 'porque sí',
      legalEntityId: entidadId,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('VALIDATION');
    expect(resultado.error.details?.['reason']).toBeDefined();
  });
});

describe('prueba negativa 1 bis · ningún nombramiento con permisos queda sin entidad', () => {
  // El defecto `D-F1-012`. Un nombramiento sin entidad no alcanza ninguna, de
  // modo que crearlo produce un cargo inservible; y antes de la corrección
  // producía lo contrario, acceso a las dos personas morales del ecosistema. En
  // los dos casos es un nombramiento mal hecho y se rechaza al crearlo.
  it('otorgar sin entidad se rechaza y señala el campo', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'UNION_MEMBER',
      reason: MOTIVO,
      territorialUnitIds: [],
      includesDescendants: true,
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('VALIDATION');
    expect(resultado.error.details?.['legalEntityId']).toBeDefined();
    expect(JSON.stringify(resultado.error.details)).toContain('personas morales distintas');
  });

  it('no se crea ninguna fila cuando se rechaza', async () => {
    const antes = await base.prisma.roleAssignment.count();
    const actor = await contextoDe(base.prisma, secretaria);
    await assignRole(actor, {
      userId: sinRol.userId,
      roleCode: 'UNION_MEMBER',
      reason: MOTIVO,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(await base.prisma.roleAssignment.count()).toBe(antes);
  });

  it('un nombramiento de una entidad no alcanza los recursos de la otra', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    expect(actor.roles[0]?.legalEntityId).toBe(entidadId);

    expect(can(actor, 'identity.person.read', { kind: 'Person', legalEntityId: entidadId }).allowed).toBe(true);
    expect(can(actor, 'identity.person.read', { kind: 'Person', legalEntityId: otraEntidadId }).reason).toBe(
      'FUERA_DE_ENTIDAD',
    );
  });

  it('el catálogo no declara global ningún rol con permisos', async () => {
    // Un rol global con permisos es la forma en que el defecto vuelve a
    // aparecer: se nombra sin entidad porque su alcance dice que no la necesita.
    const globales = await base.prisma.role.findMany({
      where: { scopeKind: 'GLOBAL' },
      select: { code: true, _count: { select: { permissions: true } } },
    });
    const conPermisos = globales.filter((rol) => rol._count.permissions > 0);
    expect(conPermisos.map((rol) => rol.code)).toEqual([]);
  });
});

describe('revocación', () => {
  let asignacionId: string;

  beforeEach(async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Revocable' });
    asignacionId = await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'UNION_MEMBER',
      grantedById: secretaria.userId,
      legalEntityId: entidadId,
    });
  });

  it('revoca y conserva el historial (E2E-13)', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await revokeRole(actor, { assignmentId: asignacionId, reason: 'conclusión del periodo acordada' });
    expect(resultado.ok && resultado.data.revoked).toBe(true);

    const fila = await base.prisma.roleAssignment.findUniqueOrThrow({
      where: { id: asignacionId },
      select: { revokedAt: true, revokedById: true, revokeReason: true, grantReason: true },
    });
    // La fila sigue existiendo: se marca, no se borra. El historial de quién
    // ocupó qué cargo es parte del registro institucional.
    expect(fila.revokedAt).not.toBeNull();
    expect(fila.revokedById).toBe(secretaria.userId);
    expect(fila.revokeReason).toBe('conclusión del periodo acordada');
    expect(fila.grantReason).not.toBe('');
  });

  it('revocar dos veces no falla ni vuelve a registrar', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    await revokeRole(actor, { assignmentId: asignacionId, reason: 'conclusión del periodo acordada' });
    const segunda = await revokeRole(actor, { assignmentId: asignacionId, reason: 'conclusión del periodo acordada' });
    expect(segunda.ok && segunda.data.revoked).toBe(false);
  });

  it('un nombramiento revocado deja de aparecer entre los vigentes', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    await revokeRole(actor, { assignmentId: asignacionId, reason: 'conclusión del periodo acordada' });

    const vigentes = await liveAssignments(actor);
    expect(vigentes.ok).toBe(true);
    if (!vigentes.ok) return;
    expect(vigentes.data.map((fila) => fila.id)).not.toContain(asignacionId);
  });

  it('un nombramiento inexistente responde no encontrado', async () => {
    const actor = await contextoDe(base.prisma, secretaria);
    const resultado = await revokeRole(actor, {
      assignmentId: '00000000-0000-4000-8000-000000000000',
      reason: 'motivo suficientemente largo',
    });
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe('NOT_FOUND');
  });
});

describe('guion de arranque de la primera Secretaría Ejecutiva', () => {
  it('se niega a ejecutarse cuando ya existe una vigente', () => {
    // Es el control que impide que el arranque quede como puerta trasera
    // permanente. A partir del primer nombramiento, nombrar ocurre dentro de la
    // plataforma, con motivo escrito y registro.
    let mensaje = '';
    try {
      execFileSync('npx', ['tsx', 'scripts/access/bootstrap-secretary.ts'], {
        input: 'otra@ejemplo.invalid\nOtra\nSecretaria\n\nFUERZA_INDIGO\n',
        encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, DIRECT_URL: process.env['DIRECT_URL'] ?? '' },
      });
    } catch (error) {
      mensaje = String((error as { stdout?: string; stderr?: string }).stdout ?? '') +
        String((error as { stderr?: string }).stderr ?? '');
    }
    expect(mensaje).toContain('Ya existe una Secretaría Ejecutiva vigente');
  }, 120_000);
});
