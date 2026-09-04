import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { actorDeMigracion, crearPersonaConCuenta, entidadPrincipal } from './helpers/fixtures';
import { newPublicId } from '@/platform/kernel/ids';

/**
 * Lo que el motor garantiza sobre la afiliación (PRD §3, §7, §8; Fase 4).
 *
 * Ningún caso de uso se prueba aquí. Se prueba que las promesas del modelo **no
 * dependan de que el código las respete**: que un afiliado honorario no pueda
 * obtener voto aunque alguien escriba mal un `update`, que una revisión no pueda
 * alterar lo que la persona envió, y que dos membresías sindicales vivas de la
 * misma persona no quepan en la tabla.
 */

let base: TestDatabase;
let entidadId: string;
let actorId: string;
let reglaId: string;

beforeAll(async () => {
  base = await createTestDatabase('afiliacion');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  actorId = await actorDeMigracion(base.prisma);
  reglaId = (await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

let contador = 0;
const codigo = (prefijo: string): string => {
  contador += 1;
  return `${prefijo}_${contador}`;
};

async function tipo(overrides: Record<string, unknown> = {}) {
  return base.prisma.membershipType.create({
    data: {
      code: codigo('TIPO'),
      name: 'Calidad de prueba',
      category: 'UNION_MEMBER',
      legalEntityId: entidadId,
      benefitsSummary: 'Derechos de prueba.',
      effectiveFrom: new Date('2026-01-01'),
      ...overrides,
    },
    select: { id: true, category: true },
  });
}

async function persona() {
  return crearPersonaConCuenta(base.prisma);
}

async function solicitud(personId: string, tipoId: string, category: 'UNION_MEMBER' | 'HONORARY_AFFILIATE', overrides: Record<string, unknown> = {}) {
  return base.prisma.membershipApplication.create({
    data: {
      folio: codigo('FI-2026'),
      personId,
      membershipTypeId: tipoId,
      category,
      legalEntityId: entidadId,
      acceptedRuleSetId: reglaId,
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, status: true },
  });
}

async function membresia(personId: string, tipoId: string, category: 'UNION_MEMBER' | 'HONORARY_AFFILIATE', overrides: Record<string, unknown> = {}) {
  return base.prisma.membership.create({
    data: {
      publicId: newPublicId(),
      memberNumber: codigo('N'),
      personId,
      membershipTypeId: tipoId,
      category,
      legalEntityId: entidadId,
      startedAt: new Date('2026-01-01'),
      createdByActorId: actorId,
      updatedByActorId: actorId,
      ...overrides,
    },
    select: { id: true, status: true },
  });
}

describe('el afiliado honorario nunca obtiene voto por error', () => {
  it('un tipo honorario no puede conceder derechos políticos', async () => {
    await expect(tipo({ category: 'HONORARY_AFFILIATE', grantsPoliticalRights: true })).rejects.toThrow(
      /membership_type_honoraria_sin_derechos_politicos/,
    );
  });

  it('tampoco puede computar para el quórum', async () => {
    await expect(tipo({ category: 'HONORARY_AFFILIATE', countsForQuorum: true })).rejects.toThrow(
      /membership_type_honoraria_sin_derechos_politicos/,
    );
  });

  it('tampoco puede aparecer en el padrón que se remite a la autoridad', async () => {
    await expect(tipo({ category: 'HONORARY_AFFILIATE', appearsInAuthorityRoster: true })).rejects.toThrow(
      /membership_type_honoraria_sin_derechos_politicos/,
    );
  });

  it('y tampoco se le pueden conceder después con una actualización', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    await expect(
      base.prisma.membershipType.update({
        where: { id: honorario.id },
        data: { grantsPoliticalRights: true },
      }),
    ).rejects.toThrow(/membership_type_honoraria_sin_derechos_politicos/);
  });

  it('la calidad sindical sí los concede: la restricción no prohíbe de más', async () => {
    const sindical = await tipo({
      category: 'UNION_MEMBER',
      grantsPoliticalRights: true,
      countsForQuorum: true,
      appearsInAuthorityRoster: true,
    });
    expect(sindical.category).toBe('UNION_MEMBER');
  });

  it('la calidad honoraria de la semilla llega sin ninguno de los tres derechos', async () => {
    const honorario = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { grantsPoliticalRights: true, countsForQuorum: true, appearsInAuthorityRoster: true },
    });
    expect(honorario).toEqual({
      grantsPoliticalRights: false,
      countsForQuorum: false,
      appearsInAuthorityRoster: false,
    });
  });
});

describe('los campos de la solicitud dependen de la categoría', () => {
  it('una solicitud honoraria no puede llevar campos laborales', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    await expect(
      solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE', {
        honoraryProfile: 'FAMILY_MEMBER',
        workRelationKind: 'SUBORDINATE',
      }),
    ).rejects.toThrow(/campos_ajenos_a_la_categoria/);
  });

  it('una solicitud sindical no puede llevar perfil honorario', async () => {
    const sindical = await tipo();
    const quien = await persona();
    await expect(
      solicitud(quien.personId, sindical.id, 'UNION_MEMBER', { honoraryProfile: 'CAREGIVER' }),
    ).rejects.toThrow(/campos_ajenos_a_la_categoria/);
  });

  it('un borrador sindical puede estar a medias: para eso es un borrador', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const creada = await solicitud(quien.personId, sindical.id, 'UNION_MEMBER');
    expect(creada.status).toBe('DRAFT');
  });

  it('pero enviarlo a medias no cabe en la tabla', async () => {
    const sindical = await tipo();
    const quien = await persona();
    await expect(
      solicitud(quien.personId, sindical.id, 'UNION_MEMBER', {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        originalSummary: { enviado: true },
      }),
    ).rejects.toThrow(/campos_obligatorios_al_enviar/);
  });

  it('enviar sin resumen inmutable tampoco', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    await expect(
      solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE', {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        honoraryProfile: 'NEURODIVERGENT_PERSON',
      }),
    ).rejects.toThrow(/enviada_con_resumen/);
  });

  it('declarar pertenencia a otro sindicato sin aclarar nada se rechaza', async () => {
    const sindical = await tipo();
    const quien = await persona();
    await expect(
      solicitud(quien.personId, sindical.id, 'UNION_MEMBER', { otherUnionMembership: 'SAME_TRADE' }),
    ).rejects.toThrow(/aclaracion_de_otro_sindicato/);
  });

  it('la categoría copiada no puede contradecir al catálogo', async () => {
    const sindical = await tipo({ category: 'UNION_MEMBER' });
    const quien = await persona();
    await expect(
      solicitud(quien.personId, sindical.id, 'HONORARY_AFFILIATE', { honoraryProfile: 'CAREGIVER' }),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

describe('la revisión no altera la solicitud original', () => {
  it('el resumen enviado no se puede modificar', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    const creada = await solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE', {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      honoraryProfile: 'FAMILY_MEMBER',
      originalSummary: { ocupacion: 'lo que la persona escribió' },
    });

    await expect(
      base.prisma.membershipApplication.update({
        where: { id: creada.id },
        data: { originalSummary: { ocupacion: 'lo que quien revisa prefiere' } },
      }),
    ).rejects.toThrow(/no se puede modificar/i);
  });

  it('pero el estado y el motivo de la resolución sí avanzan', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    const revisora = await persona();
    const creada = await solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE', {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      honoraryProfile: 'FAMILY_MEMBER',
      originalSummary: { ocupacion: 'lo que la persona escribió' },
    });

    const resuelta = await base.prisma.membershipApplication.update({
      where: { id: creada.id },
      data: {
        status: 'APPROVED',
        resolutionAt: new Date(),
        resolvedById: revisora.userId,
        resolutionReason: 'Cumple los requisitos del estatuto.',
      },
      select: { status: true, originalSummary: true },
    });

    expect(resuelta.status).toBe('APPROVED');
    expect(resuelta.originalSummary).toEqual({ ocupacion: 'lo que la persona escribió' });
  });

  it('resolver sin motivo no cabe en la tabla', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    const creada = await solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE', {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      honoraryProfile: 'FAMILY_MEMBER',
      originalSummary: { ocupacion: 'x' },
    });

    await expect(
      base.prisma.membershipApplication.update({
        where: { id: creada.id },
        data: { status: 'REJECTED', resolutionAt: new Date() },
      }),
    ).rejects.toThrow(/resolucion_fundada/);
  });
});

describe('una persona acumula calidades sin duplicarse', () => {
  it('no caben dos membresías sindicales vivas de la misma persona', async () => {
    const sindical = await tipo();
    const quien = await persona();
    await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    await expect(membresia(quien.personId, sindical.id, 'UNION_MEMBER')).rejects.toThrow(
      /una_activa_por_persona_y_categoria/,
    );
  });

  it('pero sí una sindical y una honoraria a la vez, sobre el mismo registro de persona', async () => {
    const sindical = await tipo();
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();

    await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    await membresia(quien.personId, honorario.id, 'HONORARY_AFFILIATE');
    await base.prisma.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: quien.personId,
        legalEntityId: entidadId,
        originKind: 'SELF',
        initialNeed: 'Orientación sobre un ajuste razonable en el trabajo.',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
    });

    const personas = await base.prisma.person.count({ where: { id: quien.personId } });
    const calidades = await base.prisma.membership.count({ where: { personId: quien.personId } });
    const beneficiaria = await base.prisma.protectedBeneficiary.count({ where: { personId: quien.personId } });

    expect(personas).toBe(1);
    expect(calidades).toBe(2);
    expect(beneficiaria).toBe(1);
  });

  it('quien se dio de baja puede volver: el índice único solo mira las vivas', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const primera = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');

    await base.prisma.membership.update({
      where: { id: primera.id },
      data: { status: 'VOLUNTARY_WITHDRAWAL', endedAt: new Date(), endReason: 'VOLUNTARY_WITHDRAWAL' },
    });

    const segunda = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    expect(segunda.status).toBe('ACTIVE');
  });

  it('una baja sin motivo no cabe en la tabla', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const viva = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');

    await expect(
      base.prisma.membership.update({
        where: { id: viva.id },
        data: { status: 'VOLUNTARY_WITHDRAWAL', endedAt: new Date() },
      }),
    ).rejects.toThrow(/baja_con_fecha_y_motivo/);
  });
});

describe('lo que se asienta no se edita', () => {
  it('una revisión anotada no se puede cambiar', async () => {
    const honorario = await tipo({ category: 'HONORARY_AFFILIATE' });
    const quien = await persona();
    const revisora = await persona();
    const creada = await solicitud(quien.personId, honorario.id, 'HONORARY_AFFILIATE');
    const revision = await base.prisma.applicationReview.create({
      data: {
        applicationId: creada.id,
        reviewerId: revisora.userId,
        action: 'ASSIGNED',
        rationale: 'Se asigna a la Secretaría de Organización.',
      },
      select: { id: true },
    });

    await expect(
      base.prisma.applicationReview.update({ where: { id: revision.id }, data: { rationale: 'otra cosa' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(base.prisma.applicationReview.delete({ where: { id: revision.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('una transición de estado tampoco', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const viva = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    const evento = await base.prisma.membershipStatusEvent.create({
      data: {
        membershipId: viva.id,
        toStatus: 'ACTIVE',
        reason: 'Alta por resolución aprobada y cuota cubierta.',
        actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.membershipStatusEvent.update({ where: { id: evento.id }, data: { reason: 'otra' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('ni una consulta al verificador', async () => {
    const registro = await base.prisma.credentialVerification.create({
      data: {
        queriedCode: 'FI-XXXX-XXXX',
        result: 'NOT_FOUND',
        occurredAtHour: new Date('2026-09-04T21:00:00.000Z'),
      },
      select: { id: true },
    });

    await expect(
      base.prisma.credentialVerification.update({ where: { id: registro.id }, data: { result: 'VALID' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('la medición del verificador se guarda por hora, no al segundo', async () => {
    await expect(
      base.prisma.credentialVerification.create({
        data: {
          queriedCode: 'FI-XXXX-XXXX',
          result: 'NOT_FOUND',
          occurredAtHour: new Date('2026-09-04T21:37:11.000Z'),
        },
      }),
    ).rejects.toThrow(/hora_truncada/);
  });

  it('un resultado NOT_FOUND no puede apuntar a una credencial', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const viva = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    const credencial = await base.prisma.memberCredential.create({
      data: {
        publicCode: codigo('FI-CRED'),
        signingKeyId: 'k1',
        signature: 'firma-de-prueba',
        membershipId: viva.id,
        personId: quien.personId,
        credentialKind: 'UNION_MEMBER',
        displayName: 'Persona De Prueba',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.credentialVerification.create({
        data: {
          credentialId: credencial.id,
          queriedCode: 'FI-XXXX-XXXX',
          result: 'NOT_FOUND',
          occurredAtHour: new Date('2026-09-04T21:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/resultado_coherente/);
  });
});

describe('la credencial acredita lo que acreditaba cuando se imprimió', () => {
  it('el código y la firma no se pueden cambiar', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const viva = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    const credencial = await base.prisma.memberCredential.create({
      data: {
        publicCode: codigo('FI-CRED'),
        signingKeyId: 'k1',
        signature: 'firma-de-prueba',
        membershipId: viva.id,
        personId: quien.personId,
        credentialKind: 'UNION_MEMBER',
        displayName: 'Persona De Prueba',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.memberCredential.update({
        where: { id: credencial.id },
        data: { publicCode: codigo('FI-OTRO') },
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      base.prisma.memberCredential.update({
        where: { id: credencial.id },
        data: { signature: 'otra-firma' },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('revocarla sí, y con motivo', async () => {
    const sindical = await tipo();
    const quien = await persona();
    const viva = await membresia(quien.personId, sindical.id, 'UNION_MEMBER');
    const credencial = await base.prisma.memberCredential.create({
      data: {
        publicCode: codigo('FI-CRED'),
        signingKeyId: 'k1',
        signature: 'firma-de-prueba',
        membershipId: viva.id,
        personId: quien.personId,
        credentialKind: 'UNION_MEMBER',
        displayName: 'Persona De Prueba',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.memberCredential.update({
        where: { id: credencial.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    ).rejects.toThrow(/revocacion_con_motivo/);

    const revocada = await base.prisma.memberCredential.update({
      where: { id: credencial.id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'Extravío reportado por la titular.' },
      select: { status: true },
    });
    expect(revocada.status).toBe('REVOKED');
  });

  it('una credencial de agremiado sin membresía no cabe en la tabla', async () => {
    const quien = await persona();
    await expect(
      base.prisma.memberCredential.create({
        data: {
          publicCode: codigo('FI-CRED'),
          signingKeyId: 'k1',
          signature: 'firma-de-prueba',
          personId: quien.personId,
          credentialKind: 'UNION_MEMBER',
          displayName: 'Persona De Prueba',
          createdByActorId: actorId,
          updatedByActorId: actorId,
        },
      }),
    ).rejects.toThrow(/membresia_segun_el_tipo/);
  });
});

describe('publicar es consecuencia de consentir', () => {
  async function preferencia(overrides: Record<string, unknown> = {}) {
    const quien = await persona();
    const aviso = await base.prisma.consentVersion.findFirstOrThrow({ select: { id: true } });
    const creada = await base.prisma.directoryPreference.create({
      data: {
        personId: quien.personId,
        consentVersionId: aviso.id,
        createdByActorId: actorId,
        ...overrides,
      },
      select: { id: true, personId: true, visibility: true },
    });
    return creada;
  }

  it('la preferencia nace oculta', async () => {
    const creada = await preferencia();
    expect(creada.visibility).toBe('HIDDEN');
  });

  it('oculta no publica nada: ni foto, ni contacto, ni indexación', async () => {
    await expect(preferencia({ allowSearchEngineIndexing: true })).rejects.toThrow(
      /oculta_no_publica_nada/,
    );
  });

  it('una preferencia otorgada no se edita: lo único que cambia es que se revoque', async () => {
    const creada = await preferencia();
    await expect(
      base.prisma.directoryPreference.update({
        where: { id: creada.id },
        data: { visibility: 'PROFESSIONAL_PROFILE' },
      }),
    ).rejects.toThrow(/permission denied/i);

    const revocada = await base.prisma.directoryPreference.update({
      where: { id: creada.id },
      data: { revokedAt: new Date() },
      select: { revokedAt: true },
    });
    expect(revocada.revokedAt).not.toBeNull();
  });

  it('una publicación retirada no puede seguir siendo indexable', async () => {
    const creada = await preferencia({ visibility: 'NAME_AND_TERRITORY', allowSearchEngineIndexing: true });
    const publicada = await base.prisma.directoryPublication.create({
      data: {
        personId: creada.personId,
        slug: codigo('persona-de-prueba'),
        publishedFields: { nombre: 'Persona De Prueba' },
        indexable: true,
        sourcePreferenceId: creada.id,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.directoryPublication.update({
        where: { id: publicada.id },
        data: { withdrawnAt: new Date() },
      }),
    ).rejects.toThrow(/retirada_no_indexable/);

    const retirada = await base.prisma.directoryPublication.update({
      where: { id: publicada.id },
      data: { withdrawnAt: new Date(), indexable: false },
      select: { withdrawnAt: true, indexable: true },
    });
    expect(retirada.indexable).toBe(false);
    expect(retirada.withdrawnAt).not.toBeNull();
  });

  it('el texto publicado tampoco se edita', async () => {
    const creada = await preferencia({ visibility: 'NAME_AND_TERRITORY' });
    const publicada = await base.prisma.directoryPublication.create({
      data: {
        personId: creada.personId,
        slug: codigo('persona-de-prueba'),
        publishedFields: { nombre: 'Persona De Prueba' },
        sourcePreferenceId: creada.id,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.directoryPublication.update({
        where: { id: publicada.id },
        data: { publishedFields: { nombre: 'Otro nombre' } },
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('relaciones familiares y de cuidado', () => {
  it('nadie es familiar de sí mismo', async () => {
    const quien = await persona();
    await expect(
      base.prisma.careRelationship.create({
        data: {
          fromPersonId: quien.personId,
          toPersonId: quien.personId,
          kind: 'PRIMARY_CAREGIVER',
          createdByActorId: actorId,
          updatedByActorId: actorId,
        },
      }),
    ).rejects.toThrow(/personas_distintas/);
  });

  it('la misma relación no se registra dos veces mientras siga viva', async () => {
    const madre = await persona();
    const hija = await persona();
    const datos = {
      fromPersonId: madre.personId,
      toPersonId: hija.personId,
      kind: 'PARENT_OR_GUARDIAN' as const,
      createdByActorId: actorId,
      updatedByActorId: actorId,
    };

    const primera = await base.prisma.careRelationship.create({ data: datos, select: { id: true } });
    await expect(base.prisma.careRelationship.create({ data: datos })).rejects.toThrow(
      /una_viva_por_par_y_tipo/,
    );

    await base.prisma.careRelationship.update({
      where: { id: primera.id },
      data: { revokedAt: new Date(), revokeReason: 'Resolución judicial.' },
    });
    const segunda = await base.prisma.careRelationship.create({ data: datos, select: { id: true } });
    expect(segunda.id).not.toBe(primera.id);
  });

  it('revocar sin motivo no cabe en la tabla', async () => {
    const uno = await persona();
    const otro = await persona();
    const relacion = await base.prisma.careRelationship.create({
      data: {
        fromPersonId: uno.personId,
        toPersonId: otro.personId,
        kind: 'EMERGENCY_CONTACT',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.careRelationship.update({ where: { id: relacion.id }, data: { revokedAt: new Date() } }),
    ).rejects.toThrow(/revocacion_con_motivo/);
  });
});

describe('el beneficiario protegido no paga ni se afilia', () => {
  it('nace con privacidad reforzada', async () => {
    const quien = await persona();
    const registro = await base.prisma.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: quien.personId,
        legalEntityId: entidadId,
        originKind: 'EXTERNAL_REFERRAL',
        initialNeed: 'Canalización desde una escuela.',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { privacyLevel: true, hasDigitalAccount: true, urgencyLevel: true },
    });
    expect(registro.privacyLevel).toBe('REINFORCED');
    expect(registro.hasDigitalAccount).toBe(false);
    expect(registro.urgencyLevel).toBe('ROUTINE');
  });

  it('nadie es responsable de sí mismo', async () => {
    const quien = await persona();
    await expect(
      base.prisma.protectedBeneficiary.create({
        data: {
          publicId: newPublicId(),
          personId: quien.personId,
          legalEntityId: entidadId,
          originKind: 'SELF',
          initialNeed: 'x',
          responsiblePersonId: quien.personId,
          createdByActorId: actorId,
          updatedByActorId: actorId,
        },
      }),
    ).rejects.toThrow(/responsable_distinto/);
  });

  it('cerrar exige motivo', async () => {
    const quien = await persona();
    const registro = await base.prisma.protectedBeneficiary.create({
      data: {
        publicId: newPublicId(),
        personId: quien.personId,
        legalEntityId: entidadId,
        originKind: 'CIAN',
        initialNeed: 'Acompañamiento en una valoración.',
        createdByActorId: actorId,
        updatedByActorId: actorId,
      },
      select: { id: true },
    });

    await expect(
      base.prisma.protectedBeneficiary.update({
        where: { id: registro.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      }),
    ).rejects.toThrow(/cierre_con_motivo/);
  });
});
