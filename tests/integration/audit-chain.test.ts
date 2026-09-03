import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GLOBAL_CHAIN, recordAudit, recordSecurity, verifyAuditChain } from '@/platform/audit/audit-service';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { transaction } from '@/platform/db/unit-of-work';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, contextoDe, crearPersonaConCuenta, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Bitácora encadenada e inmutable (docs/SECURITY.md §5, ADR-0011).
 *
 * Estas pruebas se ejecutan con el rol de aplicación, el mismo con el que corre
 * la plataforma en producción. Es la única forma de comprobar de verdad la
 * inmutabilidad: conectadas como propietarias, las escrituras prohibidas
 * tendrían éxito y la garantía quedaría sin verificar.
 */

let base: TestDatabase;
let persona: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('bitacora');
  persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Actora', familyName: 'Registrada' });
}, 120_000);

afterAll(async () => {
  await base.destroy();
});

async function registrar(veces: number, objectId = 'objeto-de-prueba'): Promise<string[]> {
  const actor = await contextoDe(base.prisma, persona);
  const hashes: string[] = [];
  for (let i = 0; i < veces; i += 1) {
    const resultado = await transaction((tx) =>
      recordAudit(tx, actor, {
        action: AUDIT_ACTIONS.ROLE_GRANTED,
        objectKind: 'RoleAssignment',
        objectId,
        outcome: 'SUCCESS',
        metadata: { indice: i },
      }),
    );
    hashes.push(resultado.hash);
  }
  return hashes;
}

describe('cadena de resúmenes', () => {
  it('cada evento encadena con el anterior y la verificación lo confirma', async () => {
    await registrar(5);

    const verificacion = await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN));
    expect(verificacion.ok).toBe(true);
    expect(verificacion.ok && verificacion.verified).toBeGreaterThanOrEqual(5);

    const eventos = await base.prisma.auditEvent.findMany({
      where: { chainKey: GLOBAL_CHAIN },
      orderBy: { chainSequence: 'asc' },
      select: { chainSequence: true, previousHash: true, hash: true },
    });

    expect(eventos[0]?.previousHash).toBe('0'.repeat(64));
    for (let i = 1; i < eventos.length; i += 1) {
      expect(eventos[i]!.previousHash).toBe(eventos[i - 1]!.hash);
      expect(eventos[i]!.chainSequence).toBe(eventos[i - 1]!.chainSequence + 1n);
    }
  });

  it('la posición dentro de la partición no se repite', async () => {
    await registrar(3);
    const { rows } = await base.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT "chainKey", "chainSequence" FROM "audit_event" GROUP BY 1, 2 HAVING count(*) > 1
       ) AS repetidos`,
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('escrituras concurrentes no colisionan en la misma posición', async () => {
    // El bloqueo consultivo por partición es lo que lo garantiza. Sin él, dos
    // transacciones simultáneas leerían el mismo «último» evento y calcularían
    // la misma posición: una fallaría por el índice único, y la promesa de que
    // la bitácora nunca rechaza un acto ya ocurrido se rompería.
    const actor = await contextoDe(base.prisma, persona);
    const escrituras = Array.from({ length: 8 }, (_, i) =>
      transaction((tx) =>
        recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.ROLE_GRANTED,
          objectKind: 'RoleAssignment',
          objectId: `concurrente-${i}`,
          outcome: 'SUCCESS',
        }),
      ),
    );

    const resultados = await Promise.all(escrituras);
    expect(new Set(resultados.map((r) => r.hash)).size).toBe(8);

    const verificacion = await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN));
    expect(verificacion.ok, verificacion.ok ? '' : verificacion.reason).toBe(true);
  }, 60_000);
});

describe('inmutabilidad exigida por el motor', () => {
  it('el rol de aplicación no puede alterar un evento ya escrito', async () => {
    await registrar(1);
    const evento = await base.prisma.auditEvent.findFirstOrThrow({ select: { id: true } });

    await expect(
      base.prisma.$executeRawUnsafe(`UPDATE "audit_event" SET "outcome" = 'FAILED' WHERE id = '${evento.id}'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });

  it('el rol de aplicación no puede borrar un evento', async () => {
    const evento = await base.prisma.auditEvent.findFirstOrThrow({ select: { id: true } });
    await expect(
      base.prisma.$executeRawUnsafe(`DELETE FROM "audit_event" WHERE id = '${evento.id}'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });

  it('tampoco puede vaciar la tabla', async () => {
    await expect(base.prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_event"`)).rejects.toThrow(
      /permission denied|permiso denegado|must be owner|debe ser el dueño/i,
    );
  });

  it('sí puede escribir: la inmutabilidad no impide registrar', async () => {
    const antes = await base.prisma.auditEvent.count();
    await registrar(1);
    expect(await base.prisma.auditEvent.count()).toBe(antes + 1);
  });

  it('la bitácora de seguridad tiene las mismas protecciones', async () => {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'ACCESS_DENIED',
        severity: 'WARNING',
        actorId: persona.actorId,
        detail: { permiso: 'prueba' },
        correlationId: 'correlacion-de-prueba',
      }),
    );
    const evento = await base.prisma.securityEvent.findFirstOrThrow({ select: { id: true } });
    await expect(
      base.prisma.$executeRawUnsafe(`DELETE FROM "security_event" WHERE id = '${evento.id}'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });
});

describe('detección de alteración', () => {
  it('la verificación detecta un contenido alterado por quien sí tiene privilegios', async () => {
    // Quien tenga acceso de propietario a la base —una persona con las llaves
    // del servidor, no la aplicación— puede alterar una fila. Lo que la cadena
    // promete no es impedirlo, sino que quede en evidencia.
    const propia = await createTestDatabase('bitacora_alterada');
    try {
      const sujeto = await crearPersonaConCuenta(propia.prisma, { givenName: 'Otra', familyName: 'Actora' });
      const actor = await contextoDe(propia.prisma, sujeto);

      for (let i = 0; i < 3; i += 1) {
        await transaction((tx) =>
          recordAudit(tx, actor, {
            action: AUDIT_ACTIONS.ROLE_GRANTED,
            objectKind: 'RoleAssignment',
            objectId: `evento-${i}`,
            outcome: 'SUCCESS',
          }),
        );
      }

      expect((await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN))).ok).toBe(true);

      await propia.sql.query(`UPDATE "audit_event" SET "outcome" = 'FAILED' WHERE "chainSequence" = 2`);

      const verificacion = await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN));
      expect(verificacion.ok).toBe(false);
      expect(verificacion.ok === false && verificacion.brokenAtSequence).toBe(2n);
      expect(verificacion.ok === false && verificacion.reason).toContain('el contenido no corresponde');
    } finally {
      await propia.destroy();
    }
  }, 120_000);

  it('la verificación detecta un evento suprimido', async () => {
    const propia = await createTestDatabase('bitacora_hueco');
    try {
      const sujeto = await crearPersonaConCuenta(propia.prisma, { givenName: 'Tercera', familyName: 'Actora' });
      const actor = await contextoDe(propia.prisma, sujeto);
      for (let i = 0; i < 3; i += 1) {
        await transaction((tx) =>
          recordAudit(tx, actor, {
            action: AUDIT_ACTIONS.ROLE_GRANTED,
            objectKind: 'RoleAssignment',
            objectId: `evento-${i}`,
            outcome: 'SUCCESS',
          }),
        );
      }

      await propia.sql.query(`DELETE FROM "audit_event" WHERE "chainSequence" = 2`);

      const verificacion = await transaction((tx) => verifyAuditChain(tx, GLOBAL_CHAIN));
      expect(verificacion.ok).toBe(false);
      expect(verificacion.ok === false && verificacion.reason).toContain('hueco en la sucesión');
    } finally {
      await propia.destroy();
    }
  }, 120_000);
});

describe('el acto y su evidencia comparten transacción (ADR-0011)', () => {
  it('si la transacción se revierte, no queda evento de un acto que no ocurrió', async () => {
    const actor = await contextoDe(base.prisma, persona);
    const antes = await base.prisma.auditEvent.count();
    const autor = await actorDeMigracion(base.prisma);

    await expect(
      transaction(async (tx) => {
        await tx.person.create({
          data: {
            publicId: 'REVERTIDAREVERTIDAREVE',
            givenName: 'No',
            familyName: 'Debe Quedar',
            createdByActorId: autor,
            updatedByActorId: autor,
          },
        });
        await recordAudit(tx, actor, {
          action: AUDIT_ACTIONS.ROLE_GRANTED,
          objectKind: 'Person',
          objectId: 'revertido',
          outcome: 'SUCCESS',
        });
        throw new Error('fallo posterior al registro');
      }),
    ).rejects.toThrow('fallo posterior al registro');

    expect(await base.prisma.auditEvent.count()).toBe(antes);
    expect(await base.prisma.person.count({ where: { publicId: 'REVERTIDAREVERTIDAREVE' } })).toBe(0);
  });
});
