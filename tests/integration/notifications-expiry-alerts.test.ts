import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { crearMembresia, crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';
import { systemContext } from '@/platform/kernel/actor-context';
import { newCorrelationId } from '@/platform/kernel/ids';
import { dispatchExpiryAlerts } from '@/modules/notifications';

/**
 * Alertas de vencimientos, una sola vez (PRD §24 Fase 9).
 *
 * Se prueba contra la base real, con el método de romper: una membresía que
 * vence pronto genera un aviso; correr el trabajo otra vez no lo repite; y una
 * membresía que vence lejos todavía no se avisa.
 */

let base: TestDatabase;
let entidadId: string;

function sistema() {
  return systemContext({ actorId: '00000000-0000-0000-0000-000000000000', jobType: 'expiry-alerts', correlationId: newCorrelationId() });
}

async function personaConMembresia(nombre: string, diasParaVencer: number): Promise<string> {
  const p = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  await crearMembresia(base.prisma, {
    personId: p.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + diasParaVencer * 24 * 3600 * 1000),
  });
  return p.personId;
}

beforeAll(async () => {
  base = await createTestDatabase('alertas_vencimiento');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

describe('alertas de vencimiento', () => {
  it('una membresía que vence pronto genera un aviso; correrlo otra vez no lo repite', async () => {
    const personId = await personaConMembresia('Pronto', 10);

    const primera = await dispatchExpiryAlerts(sistema());
    expect(primera.ok && primera.data.membershipAlerts).toBeGreaterThanOrEqual(1);

    const avisos = await base.prisma.notification.count({
      where: { personId, relatedKind: 'MEMBERSHIP_EXPIRY' },
    });
    expect(avisos).toBe(1);

    // LA GARANTÍA: la segunda pasada no crea nada nuevo.
    const segunda = await dispatchExpiryAlerts(sistema());
    const nuevos = (segunda.ok ? segunda.data.membershipAlerts : -1);
    // No cuenta la de esta persona otra vez.
    const avisosDespues = await base.prisma.notification.count({
      where: { personId, relatedKind: 'MEMBERSHIP_EXPIRY' },
    });
    expect(avisosDespues).toBe(1);
    expect(nuevos).toBeGreaterThanOrEqual(0);
  });

  it('una membresía que vence lejos todavía no se avisa', async () => {
    const personId = await personaConMembresia('Lejos', 200);
    await dispatchExpiryAlerts(sistema());
    const avisos = await base.prisma.notification.count({
      where: { personId, relatedKind: 'MEMBERSHIP_EXPIRY' },
    });
    expect(avisos).toBe(0);
  });
});
