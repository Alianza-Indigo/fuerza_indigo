import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { withReason } from '@/platform/kernel/actor-context';
import { assignRole } from '@/modules/access';
import { exportLedger } from '@/modules/billing';

/**
 * Revisión de seguridad de la Fase 10 (PRD §20.5, §24 Fase 10 bloque B).
 *
 * No construye nada: **comprueba, ejecutando el sistema**, que las garantías
 * transversales de seguridad siguen en pie sobre el sistema entero. Cada
 * amenaza del plan (`docs/SECURITY.md` §8) tiene su prueba propietaria en la
 * fase que la construyó; esta suite reejerce integralmente las tres que cruzan
 * todos los módulos y cuya caída sería más grave:
 *
 *  - Amenaza 2, escalamiento vertical: nadie otorga un rol con permisos que no
 *    tiene, ni siquiera el superadministrador.
 *  - Amenaza 14, modificación retrospectiva: la bitácora es inmutable **en la
 *    base**, no solo en la interfaz —el rol de la aplicación no puede alterarla—.
 *  - Aislamiento entre entidades jurídicas: quien administra una entidad no
 *    alcanza los datos de la otra, aunque tenga la misma facultad.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let granter: PersonaDePrueba;
let secretaria: ActorContext; // EXECUTIVE_SECRETARY de Fuerza
let finanzasFuerza: ActorContext;
let finanzasAlianza: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('fase10-seguridad');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })).id;

  granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const pSecre = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: fuerzaId });
  secretaria = await contextoDe(base.prisma, pSecre);

  const pFin = await crearPersonaConCuenta(base.prisma, { givenName: 'Finanzas', familyName: 'Fuerza' });
  await nombrar(base.prisma, { userId: pFin.userId, roleCode: 'FINANCE', grantedById: granter.userId, legalEntityId: fuerzaId });
  finanzasFuerza = await contextoDe(base.prisma, pFin);

  const pFinA = await crearPersonaConCuenta(base.prisma, { givenName: 'Finanzas', familyName: 'Alianza' });
  await nombrar(base.prisma, { userId: pFinA.userId, roleCode: 'FINANCE', grantedById: granter.userId, legalEntityId: alianzaId });
  finanzasAlianza = await contextoDe(base.prisma, pFinA);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

describe('Amenaza 2 · escalamiento vertical de privilegios', () => {
  it('quien administra roles no puede otorgar uno con permisos que no tiene', async () => {
    // La Secretaría Ejecutiva tiene la facultad de nombrar, pero no las facultades
    // de la Comisión Electoral (p. ej. certificar el escrutinio). Otorgar ese rol
    // sería concederse por interpósita persona lo que no se tiene.
    const objetivo = await crearPersonaConCuenta(base.prisma, { givenName: 'Aspirante', familyName: 'A Comisionado' });
    const intento = await assignRole(secretaria, {
      userId: objetivo.userId,
      roleCode: 'ELECTORAL_COMMISSION',
      reason: 'intento de conceder facultades electorales que quien nombra no posee',
      legalEntityId: fuerzaId,
      territorialUnitIds: [],
      includesDescendants: true,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
    // Y no quedó ningún nombramiento.
    const asignados = await base.prisma.roleAssignment.count({ where: { userId: objetivo.userId, role: { code: 'ELECTORAL_COMMISSION' } } });
    expect(asignados).toBe(0);
  });
});

describe('Amenaza 14 · modificación retrospectiva de registros históricos', () => {
  it('la bitácora es inmutable en la base: el rol de la aplicación no puede alterarla', async () => {
    // Una acción auditada deja rastro en la bitácora.
    await exportLedger(withReason(finanzasFuerza, 'exportación del libro para la revisión de seguridad de la fase'), { legalEntityId: fuerzaId, periodStart: '2026-01-01', periodEnd: '2026-12-31', reason: 'exportación del libro para la revisión de seguridad de la fase' });
    const hay = await base.prisma.auditEvent.count();
    expect(hay).toBeGreaterThan(0);

    // LA GARANTÍA: alterarla con las credenciales de la aplicación falla en la base,
    // no solo en la interfaz.
    await expect(base.prisma.$executeRawUnsafe(`UPDATE "audit_event" SET "outcome" = 'DENIED'`)).rejects.toThrow();
    await expect(base.prisma.$executeRawUnsafe(`DELETE FROM "audit_event"`)).rejects.toThrow();
  });
});

describe('Aislamiento entre entidades jurídicas', () => {
  it('quien lleva las finanzas de una entidad no exporta el libro de la otra, aunque tenga la misma facultad', async () => {
    // Finanzas de Fuerza sí exporta el libro de Fuerza.
    const motivoPropio = 'exportación del libro propio para la conciliación del periodo';
    const propia = await exportLedger(withReason(finanzasFuerza, motivoPropio), { legalEntityId: fuerzaId, periodStart: '2026-01-01', periodEnd: '2026-12-31', reason: motivoPropio });
    expect(propia.ok, propia.ok ? '' : propia.error.message).toBe(true);

    // Finanzas de Alianza NO exporta el libro de Fuerza: la facultad no cruza la entidad.
    const motivoAjeno = 'intento de exportar el libro de otra entidad jurídica distinta a la propia';
    const ajena = await exportLedger(withReason(finanzasAlianza, motivoAjeno), { legalEntityId: fuerzaId, periodStart: '2026-01-01', periodEnd: '2026-12-31', reason: motivoAjeno });
    expect(ajena.ok).toBe(false);
    if (!ajena.ok) expect(ajena.error.code).toBe('FORBIDDEN');
  });
});
