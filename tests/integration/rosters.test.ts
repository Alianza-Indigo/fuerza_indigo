import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import {
  advanceFiling,
  authorityFilings,
  authorityRoster,
  endMembership,
  exportRoster,
  honoraryRoster,
  unionRoster,
} from '@/modules/membership';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Padrones separados y expediente ante la autoridad laboral
 * (PRD §7.1, §8.1 paso 14, §9.7; F4-PAD-001 a F4-PAD-004).
 *
 * La promesa que se prueba: **ningún padrón mezcla calidades**, y el que se
 * remite a autoridades es más estrecho que el de agremiados, no igual.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('padrones');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Padrones',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  // La semilla deja `appearsInAuthorityRoster` en verdadero solo para la
  // calidad sindical, que es lo que dice el PRD §3.3. Se confirma aquí porque
  // todo lo que sigue depende de ello.
  const sindical = await base.prisma.membershipType.findUniqueOrThrow({
    where: { code: 'AGREMIADO' },
    select: { appearsInAuthorityRoster: true },
  });
  expect(sindical.appearsInAuthorityRoster).toBe(true);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

let contador = 0;

async function conMembresia(
  tipo: 'AGREMIADO' | 'AFILIADO_HONORARIO',
  estado: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
) {
  contador += 1;
  const persona = await crearPersonaConCuenta(base.prisma, {
    givenName: `Miembro${contador}`,
    familyName: tipo === 'AGREMIADO' ? 'Agremiada' : 'Honoraria',
  });
  const membresia = await crearMembresia(base.prisma, {
    personId: persona.personId,
    legalEntityId: entidadId,
    typeCode: tipo,
    status: estado,
  });
  return { persona, membresia };
}

describe('los padrones no se mezclan (PRD §7.1)', () => {
  it('el de agremiados solo trae agremiados, y el honorario solo honorarios', async () => {
    await conMembresia('AGREMIADO');
    await conMembresia('AFILIADO_HONORARIO');

    const sindical = await unionRoster(secretaria);
    expect(sindical.ok, sindical.ok ? '' : JSON.stringify(sindical.error)).toBe(true);
    if (!sindical.ok) return;
    expect(sindical.data.length).toBeGreaterThan(0);
    expect(sindical.data.every((fila) => fila.category === 'UNION_MEMBER')).toBe(true);

    const honorario = await honoraryRoster(secretaria);
    expect(honorario.ok).toBe(true);
    if (!honorario.ok) return;
    expect(honorario.data.length).toBeGreaterThan(0);
    expect(honorario.data.every((fila) => fila.category === 'HONORARY_AFFILIATE')).toBe(true);

    // Y ninguna persona aparece en los dos.
    const enAmbos = sindical.data.filter((una) =>
      honorario.data.some((otra) => otra.personId === una.personId),
    );
    expect(enAmbos).toHaveLength(0);
  });

  it('cada fila dice su calidad exacta, no solo el título de la pantalla', async () => {
    const sindical = await unionRoster(secretaria);
    expect(sindical.ok).toBe(true);
    if (!sindical.ok) return;
    expect(sindical.data.every((fila) => fila.category !== undefined)).toBe(true);
    expect(sindical.data.every((fila) => fila.membershipType !== '')).toBe(true);
  });

  it('quien no tiene la facultad no lee ningún padrón', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Padron' });
    await nombrar(base.prisma, {
      userId: quien.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, quien);

    for (const consulta of [unionRoster(suyo), honoraryRoster(suyo), authorityRoster(suyo)]) {
      const resultado = await consulta;
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('el padrón que se remite a la autoridad es más estrecho', () => {
  it('solo entran agremiados con membresía activa', async () => {
    const { persona: suspendida } = await conMembresia('AGREMIADO', 'SUSPENDED');
    const { persona: activa } = await conMembresia('AGREMIADO');
    const { persona: honoraria } = await conMembresia('AFILIADO_HONORARIO');

    const remitido = await authorityRoster(secretaria);
    expect(remitido.ok, remitido.ok ? '' : JSON.stringify(remitido.error)).toBe(true);
    if (!remitido.ok) return;

    const identificadores = remitido.data.map((fila) => fila.personId);
    expect(identificadores).toContain(activa.personId);
    // Una membresía suspendida no está activa: no se remite.
    expect(identificadores).not.toContain(suspendida.personId);
    // Y una afiliación honoraria nunca (PRD §3.3).
    expect(identificadores).not.toContain(honoraria.personId);
    expect(remitido.data.every((fila) => fila.appearsInAuthorityRoster)).toBe(true);
  });

  it('el padrón de agremiados sí incluye a la suspendida, y por eso son dos consultas', async () => {
    const sindical = await unionRoster(secretaria, { status: 'SUSPENDED' });
    expect(sindical.ok).toBe(true);
    if (!sindical.ok) return;
    expect(sindical.data.length).toBeGreaterThan(0);
    expect(sindical.data.every((fila) => fila.status === 'SUSPENDED')).toBe(true);
  });
});

describe('exportar un padrón deja rastro', () => {
  it('sin motivo escrito no se exporta', async () => {
    const intento = await exportRoster(secretaria, { roster: 'UNION', reason: 'porque sí' });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/para qué/i);
  });

  it('con motivo, entrega el archivo y lo anota en la bitácora', async () => {
    const antes = await base.prisma.auditEvent.count({
      where: { action: 'membership.roster.exported' },
    });

    const exportado = await exportRoster(secretaria, {
      roster: 'UNION',
      reason: 'Se remite a la asamblea seccional del quince de octubre, conforme al acuerdo del comité.',
    });
    expect(exportado.ok, exportado.ok ? '' : JSON.stringify(exportado.error)).toBe(true);
    if (!exportado.ok) return;

    expect(exportado.data.fileName).toMatch(/padron-de-agremiados-\d{4}-\d{2}-\d{2}\.csv/);
    // La calidad exacta viaja en el archivo, no solo en su nombre: un CSV se
    // renombra y se recorta, la columna no.
    expect(exportado.data.content).toContain('calidad_exacta');
    expect(exportado.data.content).toContain('UNION_MEMBER');
    expect(exportado.data.rows).toBeGreaterThan(0);

    const despues = await base.prisma.auditEvent.count({
      where: { action: 'membership.roster.exported' },
    });
    expect(despues).toBe(antes + 1);

    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'membership.roster.exported' },
      orderBy: { occurredAt: 'desc' },
      select: { reason: true },
    });
    expect(asiento.reason).toMatch(/asamblea seccional/);
  });
});

describe('expediente ante la autoridad laboral (PRD §9.7)', () => {
  it('dar de baja a una agremiada abre el expediente de la baja', async () => {
    const { persona, membresia } = await conMembresia('AGREMIADO');

    // La membresía de prueba se crea a mano, así que el alta no abrió
    // expediente. Lo que se prueba aquí es la baja.
    const terminada = await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió por escrito dejar de ser agremiada.',
    });
    expect(terminada.ok, terminada.ok ? '' : JSON.stringify(terminada.error)).toBe(true);

    const expedientes = await base.prisma.labourAuthorityFiling.findMany({
      where: { personId: persona.personId },
      select: { kind: true, status: true, occurredAt: true },
    });
    expect(expedientes).toHaveLength(1);
    expect(expedientes[0]?.kind).toBe('ROSTER_REMOVAL');
    expect(expedientes[0]?.status).toBe('PENDING');
  });

  it('una afiliación honoraria no abre expediente, porque no hay obligación', async () => {
    const { persona, membresia } = await conMembresia('AFILIADO_HONORARIO');

    const terminada = await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'La persona pidió dejar de ser afiliada honoraria.',
    });
    if (!terminada.ok) throw terminada.error;

    const expedientes = await base.prisma.labourAuthorityFiling.count({
      where: { personId: persona.personId },
    });
    expect(expedientes).toBe(0);
  });

  it('el trámite avanza, guarda cada fecha y no retrocede', async () => {
    const { membresia } = await conMembresia('AGREMIADO');
    const terminada = await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'VOLUNTARY_WITHDRAWAL',
      reason: 'Baja voluntaria para probar el avance del trámite ante la autoridad.',
    });
    if (!terminada.ok) throw terminada.error;

    const expediente = await base.prisma.labourAuthorityFiling.findFirstOrThrow({
      where: { membershipId: membresia.id },
      select: { id: true },
    });

    const preparado = await advanceFiling(secretaria, { filingId: expediente.id, status: 'PREPARED' });
    expect(preparado.ok, preparado.ok ? '' : JSON.stringify(preparado.error)).toBe(true);

    const presentado = await advanceFiling(secretaria, { filingId: expediente.id, status: 'SUBMITTED' });
    expect(presentado.ok).toBe(true);

    // Un acuse sin referencia no acredita nada.
    const sinReferencia = await advanceFiling(secretaria, {
      filingId: expediente.id,
      status: 'ACKNOWLEDGED',
    });
    expect(sinReferencia.ok).toBe(false);

    const acusado = await advanceFiling(secretaria, {
      filingId: expediente.id,
      status: 'ACKNOWLEDGED',
      authorityReference: 'STPS-2026-004417',
    });
    expect(acusado.ok, acusado.ok ? '' : JSON.stringify(acusado.error)).toBe(true);

    const fila = await base.prisma.labourAuthorityFiling.findUniqueOrThrow({
      where: { id: expediente.id },
      select: {
        status: true,
        preparedAt: true,
        submittedAt: true,
        acknowledgedAt: true,
        authorityReference: true,
      },
    });
    expect(fila.status).toBe('ACKNOWLEDGED');
    // Las tres fechas siguen ahí: un acuse que borrara la presentación diría
    // que se acusó algo que no se presentó.
    expect(fila.preparedAt).not.toBeNull();
    expect(fila.submittedAt).not.toBeNull();
    expect(fila.acknowledgedAt).not.toBeNull();
    expect(fila.authorityReference).toBe('STPS-2026-004417');

    // Y no retrocede.
    const atras = await advanceFiling(secretaria, { filingId: expediente.id, status: 'PREPARED' });
    expect(atras.ok).toBe(false);
    if (!atras.ok) expect(atras.error.code).toBe('CONFLICT');
  });

  it('descartar la obligación exige explicarlo', async () => {
    const { membresia } = await conMembresia('AGREMIADO');
    const terminada = await endMembership(secretaria, {
      membershipId: membresia.id,
      endReason: 'DUPLICATE',
      reason: 'La persona ya tenía esta membresía en otro registro que se conservó.',
    });
    if (!terminada.ok) throw terminada.error;

    const expediente = await base.prisma.labourAuthorityFiling.findFirstOrThrow({
      where: { membershipId: membresia.id },
      select: { id: true },
    });

    const sinMotivo = await advanceFiling(secretaria, {
      filingId: expediente.id,
      status: 'NOT_REQUIRED',
      notes: 'no',
    });
    expect(sinMotivo.ok).toBe(false);

    const conMotivo = await advanceFiling(secretaria, {
      filingId: expediente.id,
      status: 'NOT_REQUIRED',
      notes: 'La membresía se canceló por duplicidad y el alta nunca llegó a informarse.',
    });
    expect(conMotivo.ok, conMotivo.ok ? '' : JSON.stringify(conMotivo.error)).toBe(true);
  });

  it('el listado dice cuánto lleva esperando cada trámite', async () => {
    const listado = await authorityFilings(secretaria);
    expect(listado.ok, listado.ok ? '' : JSON.stringify(listado.error)).toBe(true);
    if (!listado.ok) return;
    expect(listado.data.length).toBeGreaterThan(0);

    const pendiente = listado.data.find((uno) => uno.status === 'PENDING');
    if (pendiente !== undefined) expect(pendiente.daysOpen).not.toBeNull();

    const cerrado = listado.data.find((uno) => uno.status === 'ACKNOWLEDGED');
    // Un trámite terminado no lleva esperando nada.
    if (cerrado !== undefined) expect(cerrado.daysOpen).toBeNull();
  });

  it('quien lee el padrón no puede hacer avanzar un trámite', async () => {
    const auditor = await crearPersonaConCuenta(base.prisma, { givenName: 'Audita', familyName: 'Nada Mas' });
    await nombrar(base.prisma, {
      userId: auditor.userId,
      roleCode: 'AUDITOR',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, auditor);

    const expediente = await base.prisma.labourAuthorityFiling.findFirstOrThrow({ select: { id: true } });
    const intento = await advanceFiling(suyo, { filingId: expediente.id, status: 'PREPARED' });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});
