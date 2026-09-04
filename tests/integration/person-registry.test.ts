import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
} from './helpers/fixtures';
import {
  findDuplicates,
  mergePeople,
  personRecord,
  registerPerson,
  searchPeople,
  updatePerson,
} from '@/modules/identity';
// Interno a propósito: `matchKeyOf` no es un caso de uso y no sale del módulo.
// Lo que esta prueba compara es que la versión de TypeScript y la del motor
// digan lo mismo, y para eso hay que alcanzarla donde vive.
import { matchKeyOf } from '@/modules/identity/application/person-registry';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Registro maestro de persona (PRD §3.1, F4-AFI-001).
 *
 * Lo que se prueba aquí no es que el formulario guarde: es que **una persona no
 * se duplique**, y que cuando ya se duplicó se pueda resolver sin perder nada.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;
let secretaria: ActorContext;

beforeAll(async () => {
  base = await createTestDatabase('registro_personas');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);

  const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Ejecutiva' });
  await nombrar(base.prisma, {
    userId: quien.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quien.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, quien);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

const alta = {
  givenName: 'Guadalupe',
  familyName: 'Muñoz',
  secondFamilyName: 'Reyes',
};

describe('la clave de comparación de nombres (ADR-0070)', () => {
  it('la escribe el motor, no la aplicación: quita acentos y baja a minúsculas', async () => {
    const persona = await base.prisma.person.create({
      data: {
        publicId: newPublicId(),
        givenName: 'José Ángel',
        familyName: 'Yáñez',
        secondFamilyName: 'Peña',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { matchKey: true },
    });
    expect(persona.matchKey).toBe('jose angel yanez pena');
  });

  it('se recalcula al cambiar el nombre', async () => {
    const persona = await base.prisma.person.create({
      data: {
        publicId: newPublicId(),
        givenName: 'Antes',
        familyName: 'Del Cambio',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });
    const cambiada = await base.prisma.person.update({
      where: { id: persona.id },
      data: { familyName: 'Después' },
      select: { matchKey: true },
    });
    expect(cambiada.matchKey).toBe('antes despues ');
  });

  it('la versión de TypeScript produce lo mismo que la del motor', async () => {
    const nombres = [
      { givenName: 'Zenaida', familyName: 'Zúñiga', secondFamilyName: 'Zamora' },
      { givenName: 'José Ángel', familyName: 'Hernández', secondFamilyName: null },
      { givenName: 'Ana', familyName: "O'Brien", secondFamilyName: 'Çelik' },
      { givenName: 'María del Carmen', familyName: 'Íñiguez', secondFamilyName: 'Ávila' },
    ];

    for (const nombreDePrueba of nombres) {
      const fila = await base.prisma.person.create({
        data: {
          publicId: newPublicId(),
          ...nombreDePrueba,
          createdByActorId: actorId,
          updatedByActorId: actorId,
        },
        select: { matchKey: true },
      });
      // El disparador deja un espacio final cuando no hay segundo apellido; la
      // comparación por prefijo no se entera, y fijarlo aquí evita perseguir
      // una diferencia que no importa.
      expect(fila.matchKey?.trimEnd()).toBe(matchKeyOf(nombreDePrueba).trimEnd());
    }
  });

  it('toda persona sembrada o creada por una prueba tiene su clave', async () => {
    const sinClave = await base.prisma.person.count({ where: { matchKey: null } });
    expect(sinClave).toBe(0);
  });
});

describe('el alta avisa antes de duplicar', () => {
  it('crea el registro cuando no hay nada parecido', async () => {
    const creada = await registerPerson(secretaria, { ...alta, birthDate: '1988-03-14' });
    expect(creada.ok).toBe(true);
  });

  it('la segunda vez se detiene y dice a quién se parece', async () => {
    const repetida = await registerPerson(secretaria, { ...alta, birthDate: '1988-03-14' });
    expect(repetida.ok).toBe(false);
    if (repetida.ok) return;
    expect(repetida.error.code).toBe('CONFLICT');
    expect(repetida.error.message).toMatch(/misma fecha de nacimiento/i);
  });

  it('el acento no salva: «Munoz» sin tilde también se detiene', async () => {
    const sinAcento = await registerPerson(secretaria, {
      givenName: 'Guadalupe',
      familyName: 'Munoz',
      secondFamilyName: 'Reyes',
      birthDate: '1988-03-14',
    });
    expect(sinAcento.ok).toBe(false);
    if (sinAcento.ok) return;
    expect(sinAcento.error.code).toBe('CONFLICT');
  });

  it('el mismo correo detiene el alta aunque el nombre sea distinto', async () => {
    const primera = await registerPerson(secretaria, {
      givenName: 'Rosa',
      familyName: 'Hernández',
      primaryEmail: 'rosa@ejemplo.invalid',
    });
    expect(primera.ok).toBe(true);

    const segunda = await registerPerson(secretaria, {
      givenName: 'Rosita',
      familyName: 'Hernandez',
      primaryEmail: 'rosa@ejemplo.invalid',
    });
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.error.message).toMatch(/correo electrónico/i);
  });

  it('confirmar que es otra persona sí crea el registro, y deja constancia', async () => {
    const confirmada = await registerPerson(secretaria, {
      ...alta,
      birthDate: '1988-03-14',
      confirmedDistinct: true,
    });
    expect(confirmada.ok).toBe(true);

    const evento = await base.prisma.auditEvent.findFirst({
      where: { action: 'identity.person.created' },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });
    expect(evento?.metadata).toMatchObject({ coincidencias: expect.any(Number) });
    expect((evento?.metadata as { descartadas?: string[] }).descartadas?.length ?? 0).toBeGreaterThan(0);
  });

  it('sin la facultad de editar personas no se da de alta a nadie', async () => {
    const cualquiera = await crearPersonaConCuenta(base.prisma);
    const sinFacultad = await contextoDe(base.prisma, cualquiera);
    const intento = await registerPerson(sinFacultad, { givenName: 'Nadie', familyName: 'Sin Permiso' });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('el registro maestro presenta una persona, no varias', () => {
  it('una persona con tres calidades sigue siendo un registro', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Acumula', familyName: 'Calidades' });
    for (const typeCode of ['AGREMIADO', 'AFILIADO_HONORARIO'] as const) {
      await crearMembresia(base.prisma, { personId: quien.personId, legalEntityId: entidadId, typeCode });
    }
    await base.prisma.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: quien.personId,
        legalEntityId: entidadId,
        originKind: 'SELF',
        initialNeed: 'Orientación sobre un ajuste razonable.',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
    });

    const registro = await personRecord(secretaria, { personId: quien.personId });
    expect(registro.ok).toBe(true);
    if (!registro.ok) return;
    expect(registro.data.qualities).toHaveLength(3);
    expect(registro.data.account.hasAccount).toBe(true);
  });

  it('la búsqueda encuentra por identificador público', async () => {
    const alguien = await registerPerson(secretaria, {
      givenName: 'Buscable',
      familyName: 'Por Folio',
      confirmedDistinct: true,
    });
    if (!alguien.ok) throw alguien.error;

    const encontrada = await searchPeople(secretaria, { query: alguien.data.publicId });
    expect(encontrada.ok).toBe(true);
    if (!encontrada.ok) return;
    expect(encontrada.data).toHaveLength(1);
    expect(encontrada.data[0]!.personId).toBe(alguien.data.personId);
  });
});

describe('editar el registro', () => {
  it('exige la versión de fila que se leyó', async () => {
    const creada = await registerPerson(secretaria, {
      givenName: 'Concurrencia',
      familyName: 'Optimista',
      confirmedDistinct: true,
    });
    if (!creada.ok) throw creada.error;

    const primera = await updatePerson(secretaria, {
      personId: creada.data.personId,
      rowVersion: 0,
      givenName: 'Concurrencia',
      familyName: 'Optimista',
      primaryPhone: '3312345678',
    });
    expect(primera.ok).toBe(true);

    const segunda = await updatePerson(secretaria, {
      personId: creada.data.personId,
      rowVersion: 0,
      givenName: 'Otra',
      familyName: 'Cosa',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });
});

describe('la fusión resuelve la duplicidad sin borrar historial', () => {
  async function dosRegistrosDeLaMisma() {
    const primera = await registerPerson(secretaria, {
      givenName: 'Duplicada',
      familyName: 'Por Captura',
      confirmedDistinct: true,
    });
    const segunda = await registerPerson(secretaria, {
      givenName: 'Duplicada',
      familyName: 'Por Captura',
      confirmedDistinct: true,
    });
    if (!primera.ok || !segunda.ok) throw new Error('no se pudieron crear los registros de prueba');
    return { conservada: primera.data.personId, duplicada: segunda.data.personId };
  }

  it('la consulta de duplicados encuentra al otro registro', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();
    const encontrados = await findDuplicates(secretaria, { personId: conservada });
    expect(encontrados.ok).toBe(true);
    if (!encontrados.ok) return;
    expect(encontrados.data.candidates.map((c) => c.personId)).toContain(duplicada);
  });

  it('traslada lo operativo y deja el duplicado apuntando al que se conserva', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();

    const membresia = await crearMembresia(base.prisma, {
      personId: duplicada,
      legalEntityId: entidadId,
      typeCode: 'AFILIADO_HONORARIO',
    });

    const fusion = await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: 'Misma persona capturada dos veces por el mismo módulo el mismo día.',
    });
    expect(fusion.ok).toBe(true);
    if (!fusion.ok) return;
    expect(fusion.data.movedRows['membership']).toBe(1);

    const trasladada = await base.prisma.membership.findUniqueOrThrow({
      where: { id: membresia.id },
      select: { personId: true },
    });
    expect(trasladada.personId).toBe(conservada);

    const tumba = await base.prisma.person.findUniqueOrThrow({
      where: { id: duplicada },
      select: { mergedIntoPersonId: true, archivedAt: true },
    });
    expect(tumba.mergedIntoPersonId).toBe(conservada);
    expect(tumba.archivedAt).not.toBeNull();
  });

  it('exige motivo escrito de al menos veinte caracteres', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();
    const corto = await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: 'son la misma',
    });
    expect(corto.ok).toBe(false);
    if (!corto.ok) expect(corto.error.code).toBe('VALIDATION');
  });

  it('no fusiona dos registros con la misma calidad viva: eso lo resuelve una persona', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();
    for (const personId of [conservada, duplicada]) {
      await crearMembresia(base.prisma, { personId, legalEntityId: entidadId, typeCode: 'AGREMIADO' });
    }

    const choque = await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: 'Misma persona capturada dos veces, ambas con membresía sindical.',
    });
    expect(choque.ok).toBe(false);
    if (!choque.ok) {
      expect(choque.error.code).toBe('CONFLICT');
      expect(choque.error.message).toMatch(/agremiada/i);
    }
  });

  it('la cuenta del duplicado queda deshabilitada y sin sesiones', async () => {
    const conCuenta = await crearPersonaConCuenta(base.prisma, {
      givenName: 'Con',
      familyName: 'Cuenta Duplicada',
    });
    const destino = await registerPerson(secretaria, {
      givenName: 'Con',
      familyName: 'Cuenta Duplicada',
      confirmedDistinct: true,
    });
    if (!destino.ok) throw destino.error;

    await base.prisma.session.create({
      data: {
        userId: conCuenta.userId,
        actorKind: 'PERSON',
        tokenHash: `hash-${conCuenta.userId.slice(0, 20)}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const fusion = await mergePeople(secretaria, {
      keepPersonId: destino.data.personId,
      mergePersonId: conCuenta.personId,
      reason: 'La persona se registró sola después de que la registrara la delegación.',
    });
    expect(fusion.ok, fusion.ok ? '' : JSON.stringify(fusion.error)).toBe(true);
    if (!fusion.ok) return;
    expect(fusion.data.accountDisabled).toBe(true);

    const cuenta = await base.prisma.user.findUniqueOrThrow({
      where: { id: conCuenta.userId },
      select: { status: true, sessionVersion: true },
    });
    expect(cuenta.status).toBe('DISABLED');

    const vivas = await base.prisma.session.count({
      where: { userId: conCuenta.userId, revokedAt: null },
    });
    expect(vivas).toBe(0);
  });

  it('no se fusiona dos veces el mismo registro', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();
    const motivo = 'Duplicidad evidente confirmada con la persona por teléfono.';
    const primera = await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: motivo,
    });
    expect(primera.ok).toBe(true);

    const segunda = await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: motivo,
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('un registro fusionado ya no se edita: se edita el que quedó', async () => {
    const { conservada, duplicada } = await dosRegistrosDeLaMisma();
    await mergePeople(secretaria, {
      keepPersonId: conservada,
      mergePersonId: duplicada,
      reason: 'Duplicidad resuelta durante la depuración del padrón.',
    });

    const intento = await updatePerson(secretaria, {
      personId: duplicada,
      rowVersion: 1,
      givenName: 'Ya',
      familyName: 'No Se Toca',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });
});
