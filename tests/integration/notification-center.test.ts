import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import {
  archiveNotification,
  markAllNotificationsRead,
  markNotificationRead,
  myNotificationPreferences,
  myNotifications,
  setNotificationPreferences,
} from '@/modules/notifications';

/**
 * El centro de notificaciones y las preferencias (PRD §16.2, Fase 9 bloque B).
 *
 * Se prueba contra la base real, conectados como el rol de la aplicación, para
 * que las promesas se sostengan de verdad: que un aviso ajeno no se lea, que
 * silenciar una clase la quite del centro y —la garantía que gobierna la fase—
 * que un aviso obligatorio de gobierno no se pueda silenciar, con un mensaje
 * claro y antes de que la base tenga que rechazarlo.
 */

let base: TestDatabase;
let ana: ActorContext;
let beto: ActorContext;

async function aviso(personId: string, category: string, overrides: Record<string, unknown> = {}) {
  return base.prisma.notification.create({
    data: {
      personId,
      category: category as 'PROMOTIONAL',
      title: `Aviso ${category}`,
      body: 'Cuerpo del aviso de prueba.',
      channels: ['IN_APP'],
      ...overrides,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  base = await createTestDatabase('notificaciones');
  await base.seed();
  const personaAna = await crearPersonaConCuenta(base.prisma, { givenName: 'Ana' });
  const personaBeto = await crearPersonaConCuenta(base.prisma, { givenName: 'Beto' });
  ana = await contextoDe(base.prisma, personaAna);
  beto = await contextoDe(base.prisma, personaBeto);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

describe('el centro solo muestra lo de la persona, y cuenta lo no leído', () => {
  it('trae los avisos vivos propios y no los ajenos', async () => {
    await aviso(ana.personId!, 'MEMBERSHIP');
    await aviso(ana.personId!, 'PAYMENT');
    await aviso(beto.personId!, 'MEMBERSHIP');

    const centro = await myNotifications(ana);
    expect(centro.ok).toBe(true);
    if (!centro.ok) return;
    expect(centro.data.items.length).toBe(2);
    expect(centro.data.unreadCount).toBe(2);
  });

  it('un aviso solo para correo no aparece en el centro', async () => {
    const nueva = await crearPersonaConCuenta(base.prisma, { givenName: 'Cé' });
    const ce = await contextoDe(base.prisma, nueva);
    await aviso(ce.personId!, 'PAYMENT', { channels: ['EMAIL'] });

    const centro = await myNotifications(ce);
    expect(centro.ok && centro.data.items.length).toBe(0);
  });
});

describe('marcar y archivar operan solo sobre lo propio', () => {
  it('un aviso ajeno responde «no encontrado», nunca «prohibido»', async () => {
    const suyo = await aviso(beto.personId!, 'CASE');
    const resultado = await markNotificationRead(ana, suyo.id);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('NOT_FOUND');
  });

  it('marcar como leído es idempotente', async () => {
    const propio = await aviso(ana.personId!, 'APPOINTMENT');
    const primero = await markNotificationRead(ana, propio.id);
    expect(primero.ok && primero.data.read).toBe(true);
    const segundo = await markNotificationRead(ana, propio.id);
    expect(segundo.ok && segundo.data.read).toBe(false);
  });

  it('marcar todo deja el contador en cero', async () => {
    await markAllNotificationsRead(ana);
    const centro = await myNotifications(ana);
    expect(centro.ok && centro.data.unreadCount).toBe(0);
  });

  it('archivar saca el aviso del centro sin borrarlo', async () => {
    const propio = await aviso(ana.personId!, 'EVENT');
    const antes = await myNotifications(ana);
    const archivado = await archiveNotification(ana, propio.id);
    expect(archivado.ok && archivado.data.archived).toBe(true);
    const despues = await myNotifications(ana);
    if (!antes.ok || !despues.ok) throw new Error('centro no disponible');
    expect(despues.data.items.length).toBe(antes.data.items.length - 1);
    const sigue = await base.prisma.notification.findUnique({ where: { id: propio.id }, select: { archivedAt: true } });
    expect(sigue?.archivedAt).not.toBeNull();
  });
});

describe('las preferencias gobiernan el centro', () => {
  it('silenciar una clase la quita del centro', async () => {
    const nueva = await crearPersonaConCuenta(base.prisma, { givenName: 'De' });
    const de = await contextoDe(base.prisma, nueva);
    await aviso(de.personId!, 'PROMOTIONAL');
    await aviso(de.personId!, 'MEMBERSHIP');

    const guardado = await setNotificationPreferences(de, {
      channel: 'IN_APP',
      entries: [{ category: 'PROMOTIONAL', suppressed: true }],
    });
    expect(guardado.ok && guardado.data.changed).toBe(1);

    const centro = await myNotifications(de);
    if (!centro.ok) throw new Error('centro no disponible');
    expect(centro.data.items.some((item) => item.category === 'PROMOTIONAL')).toBe(false);
    expect(centro.data.items.some((item) => item.category === 'MEMBERSHIP')).toBe(true);

    const prefs = await myNotificationPreferences(de);
    if (!prefs.ok) throw new Error('preferencias no disponibles');
    expect(prefs.data.categories.find((c) => c.category === 'PROMOTIONAL')?.inAppSuppressed).toBe(true);
  });

  it('guardar lo mismo no cambia nada', async () => {
    const nueva = await crearPersonaConCuenta(base.prisma, { givenName: 'Efe' });
    const efe = await contextoDe(base.prisma, nueva);
    await setNotificationPreferences(efe, { channel: 'IN_APP', entries: [{ category: 'EVENT', suppressed: true }] });
    const otra = await setNotificationPreferences(efe, {
      channel: 'IN_APP',
      entries: [{ category: 'EVENT', suppressed: true }],
    });
    expect(otra.ok && otra.data.changed).toBe(0);
  });
});

describe('un aviso obligatorio no se puede silenciar (la garantía de la fase)', () => {
  it('el caso de uso lo rechaza con un mensaje claro, antes que la base', async () => {
    const nueva = await crearPersonaConCuenta(base.prisma, { givenName: 'Ge' });
    const ge = await contextoDe(base.prisma, nueva);

    const resultado = await setNotificationPreferences(ge, {
      channel: 'IN_APP',
      entries: [{ category: 'GOVERNANCE_MANDATORY', suppressed: true }],
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe('RULE_VIOLATION');
    expect(resultado.error.message).toMatch(/obligatorios/i);

    // No quedó ninguna fila: el rechazo fue antes de tocar la base.
    const filas = await base.prisma.notificationPreference.count({
      where: { personId: ge.personId!, category: 'GOVERNANCE_MANDATORY' },
    });
    expect(filas).toBe(0);
  });

  it('y aun forzando la base, el CHECK la rechaza', async () => {
    const nueva = await crearPersonaConCuenta(base.prisma, { givenName: 'Hache' });
    const hache = await contextoDe(base.prisma, nueva);
    await expect(
      base.prisma.notificationPreference.create({
        data: {
          personId: hache.personId!,
          category: 'GOVERNANCE_MANDATORY',
          channel: 'IN_APP',
          suppressed: true,
          createdByActorId: hache.actorId,
        },
      }),
    ).rejects.toThrow(/preferencia_obligatoria_no_se_suprime/);

    // Un aviso obligatorio sigue en el centro, pase lo que pase con las preferencias.
    await aviso(hache.personId!, 'GOVERNANCE_MANDATORY');
    const centro = await myNotifications(hache);
    expect(centro.ok && centro.data.items.some((i) => i.category === 'GOVERNANCE_MANDATORY')).toBe(true);
  });
});
