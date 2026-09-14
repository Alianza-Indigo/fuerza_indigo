import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createIndigoAmbassador,
  listIndigoAmbassadors,
  publicIndigoAmbassador,
  updateIndigoAmbassador,
} from '@/modules/admin';
import { rootActorId } from '@/platform/auth/superadmin';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { contextoDe, crearPersonaConCuenta } from './helpers/fixtures';
import { createTestDatabase, type TestDatabase } from './helpers/database';

let base: TestDatabase;
let root: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('ambassadors');
  await base.seed();
  root = {
    actorId: await rootActorId(),
    actorKind: 'ROOT_SUPERADMIN',
    userId: null,
    personId: null,
    jobType: null,
    sessionId: null,
    roles: [],
    legalEntityScope: [],
    compartments: new Set(['UNION', 'SOCIAL', 'DISCIPLINARY']),
    reason: null,
    correlationId: 'embajadores-prueba',
    ipHash: null,
    userAgentSummary: 'vitest',
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
  };
}, 180_000);

afterAll(async () => base.destroy());

describe('padrón de Embajadores Índigo', () => {
  it('solo la raíz crea, administra y suspende afiliadores', async () => {
    const created = await createIndigoAmbassador(root, {
      givenName: 'Ana',
      familyName: 'Pérez',
      secondFamilyName: '',
      email: 'ana.embajadora@ejemplo.mx',
      phone: '614 123 4567',
      territory: 'Chihuahua',
      notes: 'Afiliación presencial.',
    });
    expect(created.ok, created.ok ? '' : created.error.message).toBe(true);
    if (!created.ok) return;
    expect(created.data.code).toBe('FI-EMB-00001');
    expect(await publicIndigoAmbassador(created.data.code)).toEqual({
      code: created.data.code,
      displayName: 'Ana Pérez',
    });

    const person = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultad' });
    const denied = await listIndigoAmbassadors(await contextoDe(base.prisma, person));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe('FORBIDDEN');

    const row = await base.prisma.indigoAmbassador.findUniqueOrThrow({
      where: { id: created.data.ambassadorId },
      select: {
        id: true,
        rowVersion: true,
        givenName: true,
        familyName: true,
        secondFamilyName: true,
        email: true,
        phone: true,
        territory: true,
        notes: true,
      },
    });
    const suspended = await updateIndigoAmbassador(root, {
      ambassadorId: row.id,
      rowVersion: row.rowVersion,
      givenName: row.givenName,
      familyName: row.familyName,
      secondFamilyName: row.secondFamilyName ?? '',
      email: row.email,
      phone: row.phone ?? '',
      territory: row.territory ?? '',
      notes: row.notes ?? '',
      status: 'SUSPENDED',
      reason: 'Suspensión solicitada para comprobar el cierre del enlace público.',
    });
    expect(suspended.ok).toBe(true);
    expect(await publicIndigoAmbassador(created.data.code)).toBeNull();
  });
});
