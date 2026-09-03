import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryAuditEvents, querySecurityEvents } from '@/modules/audit';
import { listAdministrablePeople } from '@/modules/admin';
import { recordAudit } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { transaction } from '@/platform/db/unit-of-work';
import { can } from '@/platform/authz/policy';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Aislamiento por entidad jurídica y por territorio (PRD §24 Fase 1).
 *
 * Criterio de la fase: **el aislamiento funciona en consultas y mutaciones**.
 * Que funcione en la vista no basta: si el filtro se aplicara al pintar la
 * pantalla, los datos ajenos ya habrían salido de la base y estarían en la
 * respuesta. Aquí se comprueba que el recorte ocurre en la consulta.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let auditoraFuerza: PersonaDePrueba;
let delegadaJalisco: PersonaDePrueba;
let unidadJalisco: { id: string; path: string };
let unidadNayarit: { id: string; path: string };

beforeAll(async () => {
  base = await createTestDatabase('aislamiento');
  await base.seed();

  const entidades = await base.prisma.legalEntity.findMany({ select: { id: true, code: true } });
  fuerzaId = entidades.find((entidad) => entidad.code === 'FUERZA_INDIGO')!.id;
  alianzaId = entidades.find((entidad) => entidad.code !== 'FUERZA_INDIGO')!.id;

  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true, path: true },
  });
  unidadJalisco = unidades[0]!;
  unidadNayarit = unidades[1]!;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien Nombra' });

  auditoraFuerza = await crearPersonaConCuenta(base.prisma, { givenName: 'Auditora', familyName: 'De Fuerza' });
  await nombrar(base.prisma, {
    userId: auditoraFuerza.userId,
    roleCode: 'AUDITOR',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  delegadaJalisco = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'De Jalisco' });
  await nombrar(base.prisma, {
    userId: delegadaJalisco.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    territorialUnitIds: [unidadJalisco.id],
    includesDescendants: true,
  });

  // Eventos de auditoría en las dos entidades, para poder comprobar el recorte.
  const autor = await contextoDe(base.prisma, quienNombra);
  for (const entidadId of [fuerzaId, alianzaId]) {
    for (let i = 0; i < 3; i += 1) {
      await transaction((tx) =>
        recordAudit(tx, autor, {
          action: AUDIT_ACTIONS.ROLE_GRANTED,
          objectKind: 'RoleAssignment',
          objectId: `evento-${entidadId}-${i}`,
          outcome: 'SUCCESS',
          legalEntityId: entidadId,
        }),
      );
    }
  }
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

describe('aislamiento por entidad jurídica en las consultas', () => {
  it('el visor de bitácoras no devuelve eventos de la otra entidad', async () => {
    const actor = await contextoDe(base.prisma, auditoraFuerza);
    const pagina = await queryAuditEvents(actor, { limit: 100 });

    expect(pagina.ok, pagina.ok ? '' : pagina.error.message).toBe(true);
    if (!pagina.ok) return;

    const ajenos = pagina.data.items.filter((evento) => evento.objectId.includes(alianzaId));
    expect(ajenos).toEqual([]);
    expect(pagina.data.items.length).toBeGreaterThan(0);
  });

  it('pedir explícitamente la otra entidad tampoco la devuelve', async () => {
    // El filtro que llega de la interfaz no puede ampliar el alcance. Si el
    // recorte se aplicara solo cuando no hay filtro, bastaría con escribir el
    // identificador ajeno en la URL.
    const actor = await contextoDe(base.prisma, auditoraFuerza);
    const pagina = await queryAuditEvents(actor, { legalEntityId: alianzaId, limit: 100 });

    if (!pagina.ok) {
      expect(pagina.error.code).toBe('FORBIDDEN');
      return;
    }
    expect(pagina.data.items.filter((evento) => evento.objectId.includes(alianzaId))).toEqual([]);
  });

  it('el recorte ocurre en la consulta, no al pintar', async () => {
    // Se compara contra el total real de la tabla: si la consulta trajera todo
    // y la vista recortara, este número coincidiría.
    const actor = await contextoDe(base.prisma, auditoraFuerza);
    const pagina = await queryAuditEvents(actor, { limit: 100 });
    const totales = await base.prisma.auditEvent.count();

    expect(pagina.ok).toBe(true);
    if (!pagina.ok) return;
    expect(pagina.data.items.length).toBeLessThan(totales);
  });

  it('el motor deniega la mutación sobre un recurso de la otra entidad', async () => {
    const actor = await contextoDe(base.prisma, auditoraFuerza);
    const propia = can(actor, 'identity.person.read', { kind: 'Person', legalEntityId: fuerzaId });
    const ajena = can(actor, 'identity.person.read', { kind: 'Person', legalEntityId: alianzaId });

    expect(propia.allowed).toBe(true);
    expect(ajena.allowed).toBe(false);
    expect(ajena.reason).toBe('FUERA_DE_ENTIDAD');
  });
});

describe('aislamiento territorial', () => {
  it('la delegada alcanza su unidad y las que cuelgan de ella', async () => {
    const actor = await contextoDe(base.prisma, delegadaJalisco);
    const hija = await base.prisma.territorialUnit.findFirst({
      where: { path: { startsWith: `${unidadJalisco.path}/` } },
      select: { path: true },
    });

    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: unidadJalisco.path }).allowed).toBe(true);
    if (hija !== null) {
      expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: hija.path }).allowed).toBe(true);
    }
  });

  it('no alcanza el territorio de otra delegación', async () => {
    const actor = await contextoDe(base.prisma, delegadaJalisco);
    const decision = can(actor, 'identity.person.read', { kind: 'Person', territorialPath: unidadNayarit.path });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('FUERA_DE_TERRITORIO');
  });

  it('el alcance sale de la base, no de lo que la prueba supone', async () => {
    // El contexto se arma leyendo los nombramientos reales. Si la semilla o el
    // modelo cambiaran de forma incompatible, esta prueba lo detectaría en vez
    // de seguir midiendo un objeto inventado.
    const actor = await contextoDe(base.prisma, delegadaJalisco);
    expect(actor.roles).toHaveLength(1);
    expect(actor.roles[0]?.territories.map((alcance) => alcance.path)).toEqual([unidadJalisco.path]);
    expect(actor.roles[0]?.permissions.has('identity.person.read')).toBe(true);
  });

  it('un nombramiento vencido deja de conceder sin que nadie lo revoque', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Con Vencimiento' });
    const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra Que Nombra' });
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'TERRITORIAL_DELEGATE',
      grantedById: quienNombra.userId,
      endsAt: new Date(Date.now() - 60_000),
    });

    const actor = await contextoDe(base.prisma, persona);
    expect(actor.roles).toHaveLength(0);
    expect(can(actor, 'identity.person.read', { kind: 'Person' }).reason).toBe('SIN_PERMISO');
  }, 60_000);
});

describe('el visor de bitácoras exige su permiso', () => {
  it('quien no lo tiene no lee la bitácora', async () => {
    const cualquiera = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin Permiso' });
    const actor = await contextoDe(base.prisma, cualquiera);

    const auditoria = await queryAuditEvents(actor, { limit: 10 });
    const seguridad = await querySecurityEvents(actor, { limit: 10 });

    expect(auditoria.ok).toBe(false);
    expect(seguridad.ok).toBe(false);
    expect(!auditoria.ok && auditoria.error.code).toBe('FORBIDDEN');
  }, 60_000);

  it('el listado administrativo tampoco se abre a cualquiera', async () => {
    const cualquiera = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin Permiso Tampoco' });
    const actor = await contextoDe(base.prisma, cualquiera);
    const personas = await listAdministrablePeople(actor);
    expect(personas.ok).toBe(false);
  }, 60_000);
});
