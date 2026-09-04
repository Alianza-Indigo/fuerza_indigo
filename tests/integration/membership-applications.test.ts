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
  applicationDetail,
  applicationQueue,
  attachApplicationDocument,
  createMembershipType,
  membershipTypeList,
  myApplications,
  reviewApplicationDocument,
  saveAssistedDraft,
  startAssistedApplication,
  submitApplication,
  updateMembershipType,
  withdrawApplication,
} from '@/modules/membership';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Solicitud de afiliación y documentación (PRD §8.1, §8.2; F4-AFI-002, F4-AFI-007).
 *
 * Lo que se prueba: que las dos vías pidan lo suyo y solo lo suyo, que lo
 * enviado quede congelado, y que un documento se revise sin arrastrar al resto.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let especialidadId: string;

beforeAll(async () => {
  base = await createTestDatabase('solicitudes');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Organización',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  especialidadId = (
    await base.prisma.specialtyCatalog.findFirstOrThrow({ select: { id: true } })
  ).id;

  // Sin estatuto en vigor nadie puede aceptar nada. La semilla lo deja en
  // borrador a propósito, así que la prueba lo pone en vigor: es un acto de la
  // organización y aquí la organización es la prueba.
  const reglas = await base.prisma.normativeRuleSet.findFirstOrThrow({ select: { id: true } });
  await base.prisma.normativeRuleSet.update({
    where: { id: reglas.id },
    data: { status: 'IN_FORCE', effectiveFrom: new Date('2026-01-01') },
  });

  await base.prisma.membershipType.updateMany({ data: { effectiveFrom: new Date('2026-01-01') } });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function persona(nombre: string) {
  const quien = await crearPersonaConCuenta(base.prisma, { givenName: nombre, familyName: 'Solicitante' });
  await nombrar(base.prisma, {
    userId: quien.userId,
    roleCode: 'APPLICANT',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  return { quien, contexto: await contextoDe(base.prisma, quien) };
}

async function tipoId(code: 'AGREMIADO' | 'AFILIADO_HONORARIO') {
  return (await base.prisma.membershipType.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

const solicitudSindical = (membershipTypeId: string) =>
  ({
    category: 'UNION_MEMBER' as const,
    membershipTypeId,
    occupationSpecialtyId: especialidadId,
    workRelationKind: 'SUBORDINATE' as const,
    neurodivergentContactStatement:
      'Doy clase en una secundaria pública y tengo alumnado autista en tres de mis grupos.',
    otherUnionMembership: 'NONE' as const,
    acceptsStatutes: true,
  });

const solicitudHonoraria = (membershipTypeId: string) =>
  ({
    category: 'HONORARY_AFFILIATE' as const,
    membershipTypeId,
    honoraryProfile: 'FAMILY_MEMBER' as const,
    acceptsStatutes: true,
  });

describe('la vía sindical pide lo suyo', () => {
  it('una solicitud completa se envía y recibe folio', async () => {
    const { contexto } = await persona('Completa');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));

    expect(enviada.ok, enviada.ok ? '' : JSON.stringify(enviada.error)).toBe(true);
    if (!enviada.ok) return;
    expect(enviada.data.folio).toMatch(/^FI-2026-\d{5}$/);
    expect(enviada.data.status).toBe('SUBMITTED');
    expect(enviada.data.requiresReview).toBe(true);
  });

  it('los folios son consecutivos y no se repiten', async () => {
    const antes = await base.prisma.membershipApplication.count();
    for (const nombre of ['Uno', 'Dos', 'Tres']) {
      const { contexto } = await persona(nombre);
      const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
      expect(enviada.ok).toBe(true);
    }
    const folios = await base.prisma.membershipApplication.findMany({ select: { folio: true } });
    expect(new Set(folios.map((una) => una.folio)).size).toBe(antes + 3);
  });

  it('sin aceptar los estatutos no se envía', async () => {
    const { contexto } = await persona('SinAceptar');
    const intento = await submitApplication(contexto, {
      ...solicitudSindical(await tipoId('AGREMIADO')),
      acceptsStatutes: false,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) {
      expect(intento.error.code).toBe('VALIDATION');
      expect(JSON.stringify(intento.error.details)).toMatch(/aceptar los estatutos/i);
    }
  });

  it('declarar otro sindicato sin aclarar no se envía', async () => {
    const { contexto } = await persona('OtroSindicato');
    const intento = await submitApplication(contexto, {
      ...solicitudSindical(await tipoId('AGREMIADO')),
      otherUnionMembership: 'SAME_TRADE',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/Explica tu situación/i);
  });

  it('con la aclaración sí', async () => {
    const { contexto } = await persona('OtroSindicatoAclarado');
    const enviada = await submitApplication(contexto, {
      ...solicitudSindical(await tipoId('AGREMIADO')),
      otherUnionMembership: 'DIFFERENT_TRADE',
      otherUnionClarification: 'Estoy afiliada al sindicato de la universidad donde trabajo por las tardes.',
    });
    expect(enviada.ok, enviada.ok ? '' : JSON.stringify(enviada.error)).toBe(true);
  });

  it('elegir una calidad honoraria con una solicitud sindical se rechaza', async () => {
    const { contexto } = await persona('Cruzada');
    const intento = await submitApplication(contexto, solicitudSindical(await tipoId('AFILIADO_HONORARIO')));
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('VALIDATION');
  });
});

describe('la vía honoraria no pregunta por el trabajo', () => {
  it('se envía sin ningún campo laboral', async () => {
    const { contexto } = await persona('Honoraria');
    const enviada = await submitApplication(contexto, solicitudHonoraria(await tipoId('AFILIADO_HONORARIO')));
    expect(enviada.ok, enviada.ok ? '' : JSON.stringify(enviada.error)).toBe(true);
    if (!enviada.ok) return;

    const guardada = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: enviada.data.applicationId },
      select: {
        occupationSpecialtyId: true,
        workRelationKind: true,
        otherUnionMembership: true,
        honoraryProfile: true,
      },
    });
    expect(guardada.occupationSpecialtyId).toBeNull();
    expect(guardada.workRelationKind).toBeNull();
    expect(guardada.otherUnionMembership).toBeNull();
    expect(guardada.honoraryProfile).toBe('FAMILY_MEMBER');
  });

  it('sin perfil no se envía', async () => {
    const { contexto } = await persona('SinPerfil');
    const intento = await submitApplication(contexto, {
      category: 'HONORARY_AFFILIATE',
      membershipTypeId: await tipoId('AFILIADO_HONORARIO'),
      acceptsStatutes: true,
    } as never);
    expect(intento.ok).toBe(false);
  });
});

describe('nadie sostiene dos trámites vivos de la misma calidad', () => {
  it('la segunda solicitud choca contra la primera', async () => {
    const { contexto } = await persona('Repetidora');
    const tipo = await tipoId('AGREMIADO');
    const primera = await submitApplication(contexto, solicitudSindical(tipo));
    expect(primera.ok).toBe(true);

    const segunda = await submitApplication(contexto, solicitudSindical(tipo));
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) {
      expect(segunda.error.code).toBe('CONFLICT');
      expect(segunda.error.message).toMatch(/ya hay una solicitud en curso/i);
    }
  });

  it('quien ya es agremiada no vuelve a solicitarlo', async () => {
    const { quien, contexto } = await persona('YaAgremiada');
    await crearMembresia(base.prisma, {
      personId: quien.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
    });

    const intento = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toMatch(/ya es agremiada/i);
  });

  it('pero sí puede pedir la honoraria: son calidades distintas', async () => {
    const { quien, contexto } = await persona('AgremiadaYHonoraria');
    await crearMembresia(base.prisma, {
      personId: quien.personId,
      legalEntityId: entidadId,
      typeCode: 'AGREMIADO',
    });

    const honoraria = await submitApplication(contexto, solicitudHonoraria(await tipoId('AFILIADO_HONORARIO')));
    expect(honoraria.ok, honoraria.ok ? '' : JSON.stringify(honoraria.error)).toBe(true);
  });
});

describe('lo enviado queda congelado', () => {
  it('el resumen guarda lo que la persona mandó', async () => {
    const { contexto } = await persona('Congelada');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;

    const fila = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: enviada.data.applicationId },
      select: { originalSummary: true },
    });
    const resumen = fila.originalSummary as Record<string, unknown>;
    expect(resumen['neurodivergentContactStatement']).toMatch(/alumnado autista/);
    expect(resumen['estatutoAceptado']).toBeTypeOf('string');
  });

  it('y el motor impide reescribirlo', async () => {
    const solicitud = await base.prisma.membershipApplication.findFirstOrThrow({
      where: { status: 'SUBMITTED' },
      select: { id: true },
    });
    await expect(
      base.prisma.membershipApplication.update({
        where: { id: solicitud.id },
        data: { originalSummary: { manipulado: true } },
      }),
    ).rejects.toThrow(/no se puede modificar/i);
  });
});

describe('retirar la solicitud', () => {
  it('la persona puede retirar la suya, con motivo', async () => {
    const { contexto } = await persona('Retirada');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;

    const retirada = await withdrawApplication(contexto, {
      applicationId: enviada.data.applicationId,
      reason: 'Cambié de trabajo y ya no cumplo el requisito.',
    });
    expect(retirada.ok, retirada.ok ? '' : JSON.stringify(retirada.error)).toBe(true);

    const fila = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: enviada.data.applicationId },
      select: { status: true, resolutionReason: true },
    });
    expect(fila.status).toBe('WITHDRAWN');
    expect(fila.resolutionReason).toMatch(/cambié de trabajo/i);
  });

  it('no puede retirar la de otra persona', async () => {
    const { contexto } = await persona('Ajena');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;

    const { contexto: intrusa } = await persona('Intrusa');
    const intento = await withdrawApplication(intrusa, {
      applicationId: enviada.data.applicationId,
      reason: 'Me apetece retirar la solicitud de otra persona.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });

  it('y retirada ya no se retira otra vez', async () => {
    const { contexto } = await persona('DobleRetiro');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;
    const motivo = 'Me equivoqué de calidad al enviarla.';
    await withdrawApplication(contexto, { applicationId: enviada.data.applicationId, reason: motivo });
    const otra = await withdrawApplication(contexto, { applicationId: enviada.data.applicationId, reason: motivo });
    expect(otra.ok).toBe(false);
  });
});

describe('quién ve qué', () => {
  it('cada persona ve solo sus solicitudes', async () => {
    const { contexto: una } = await persona('VeLoSuyo');
    await submitApplication(una, solicitudSindical(await tipoId('AGREMIADO')));

    const mias = await myApplications(una);
    expect(mias.ok).toBe(true);
    if (!mias.ok) return;
    expect(mias.data).toHaveLength(1);
  });

  it('la cola de revisión no la abre quien solo solicita', async () => {
    const { contexto } = await persona('SinCola');
    const cola = await applicationQueue(contexto);
    expect(cola.ok).toBe(false);
    if (!cola.ok) expect(cola.error.code).toBe('FORBIDDEN');
  });

  it('la Secretaría sí la abre y ve las de todo el mundo', async () => {
    const cola = await applicationQueue(secretaria);
    expect(cola.ok, cola.ok ? '' : JSON.stringify(cola.error)).toBe(true);
    if (!cola.ok) return;
    expect(cola.data.length).toBeGreaterThan(3);
  });

  it('nadie abre el detalle de una solicitud ajena', async () => {
    const { contexto: duenia } = await persona('Dueña');
    const enviada = await submitApplication(duenia, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;

    const { contexto: curiosa } = await persona('Curiosa');
    const intento = await applicationDetail(curiosa, { applicationId: enviada.data.applicationId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('documentación con revisión por documento', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

  async function conDocumento() {
    const { contexto } = await persona('ConDocumento');
    const enviada = await submitApplication(contexto, solicitudSindical(await tipoId('AGREMIADO')));
    if (!enviada.ok) throw enviada.error;
    const adjuntado = await attachApplicationDocument(contexto, {
      applicationId: enviada.data.applicationId,
      documentKind: 'WORK_PROOF',
      originalFileName: 'constancia.png',
      mimeType: 'image/png',
      content: PNG,
    });
    if (!adjuntado.ok) throw adjuntado.error;
    return { contexto, applicationId: enviada.data.applicationId, documentId: adjuntado.data.documentId };
  }

  it('la persona adjunta un documento a su solicitud', async () => {
    const { documentId } = await conDocumento();
    const fila = await base.prisma.applicationDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { status: true, fileObject: { select: { classification: true, contextKind: true } } },
    });
    expect(fila.status).toBe('SUBMITTED');
    expect(fila.fileObject.classification).toBe('SENSITIVE_PERSONAL');
    expect(fila.fileObject.contextKind).toBe('APPLICATION');
  });

  it('rechazar un documento sin decir qué le falta no se puede', async () => {
    const { documentId } = await conDocumento();
    const intento = await reviewApplicationDocument(secretaria, {
      documentId,
      decision: 'REJECTED',
      reviewNote: null,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/qué le falta/i);
  });

  it('rechazar con nota sí, y solo afecta a ese documento', async () => {
    const { contexto, applicationId, documentId } = await conDocumento();
    const segundo = await attachApplicationDocument(contexto, {
      applicationId,
      documentKind: 'IDENTITY',
      originalFileName: 'ine.png',
      mimeType: 'image/png',
      content: PNG,
    });
    if (!segundo.ok) throw segundo.error;

    const rechazado = await reviewApplicationDocument(secretaria, {
      documentId,
      decision: 'REJECTED',
      reviewNote: 'La constancia se ve borrosa: no se lee la fecha.',
    });
    expect(rechazado.ok, rechazado.ok ? '' : JSON.stringify(rechazado.error)).toBe(true);

    const detalle = await applicationDetail(secretaria, { applicationId });
    expect(detalle.ok).toBe(true);
    if (!detalle.ok) return;
    expect(detalle.data.documents.rejected).toBe(1);
    expect(detalle.data.documents.pending).toBe(1);
  });

  it('un documento ya revisado no se revisa dos veces', async () => {
    const { documentId } = await conDocumento();
    await reviewApplicationDocument(secretaria, { documentId, decision: 'ACCEPTED', reviewNote: null });
    const otra = await reviewApplicationDocument(secretaria, {
      documentId,
      decision: 'REJECTED',
      reviewNote: 'Ahora que lo pienso, no me gusta.',
    });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });

  it('quien solicita no revisa documentos', async () => {
    const { contexto, documentId } = await conDocumento();
    const intento = await reviewApplicationDocument(contexto, {
      documentId,
      decision: 'ACCEPTED',
      reviewNote: null,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('captura asistida', () => {
  it('la Secretaría abre un borrador, lo guarda y lo envía', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Asistida', familyName: 'Por Delegación' });

    const abierto = await startAssistedApplication(secretaria, {
      personId: quien.personId,
      membershipTypeId: await tipoId('AGREMIADO'),
      territorialUnitId: null,
    });
    expect(abierto.ok, abierto.ok ? '' : JSON.stringify(abierto.error)).toBe(true);
    if (!abierto.ok) return;

    const guardado = await saveAssistedDraft(secretaria, {
      applicationId: abierto.data.applicationId,
      draft: { workRelationKind: 'INDEPENDENT' },
    });
    expect(guardado.ok).toBe(true);

    const enviada = await submitApplication(secretaria, {
      ...solicitudSindical(await tipoId('AGREMIADO')),
      applicationId: abierto.data.applicationId,
      personId: quien.personId,
    });
    expect(enviada.ok, enviada.ok ? '' : JSON.stringify(enviada.error)).toBe(true);
    if (!enviada.ok) return;
    expect(enviada.data.folio).toBe(abierto.data.folio);

    const fila = await base.prisma.membershipApplication.findUniqueOrThrow({
      where: { id: abierto.data.applicationId },
      select: { status: true, autosavedDraft: true, originalSummary: true },
    });
    expect(fila.status).toBe('SUBMITTED');
    expect(fila.autosavedDraft).toBeNull();
    expect((fila.originalSummary as Record<string, unknown>)['capturaAsistida']).toBe(true);
  });

  it('quien solo solicita no abre capturas asistidas', async () => {
    const { contexto } = await persona('SinAsistir');
    const otra = await crearPersonaConCuenta(base.prisma);
    const intento = await startAssistedApplication(contexto, {
      personId: otra.personId,
      membershipTypeId: await tipoId('AGREMIADO'),
      territorialUnitId: null,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });

  it('un borrador enviado ya no se guarda', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Cerrada', familyName: 'Ya' });
    const abierto = await startAssistedApplication(secretaria, {
      personId: quien.personId,
      membershipTypeId: await tipoId('AFILIADO_HONORARIO'),
      territorialUnitId: null,
    });
    if (!abierto.ok) throw abierto.error;

    await submitApplication(secretaria, {
      ...solicitudHonoraria(await tipoId('AFILIADO_HONORARIO')),
      applicationId: abierto.data.applicationId,
      personId: quien.personId,
    });

    const tarde = await saveAssistedDraft(secretaria, {
      applicationId: abierto.data.applicationId,
      draft: { honoraryProfile: 'CAREGIVER' },
    });
    expect(tarde.ok).toBe(false);
    if (!tarde.ok) expect(tarde.error.code).toBe('CONFLICT');
  });
});

describe('el catálogo de calidades', () => {
  it('crea una calidad sindical con sus derechos', async () => {
    const creada = await createMembershipType(secretaria, {
      code: 'AGREMIADO_JUBILADO',
      name: 'Agremiado jubilado',
      category: 'UNION_MEMBER',
      legalEntityId: entidadId,
      benefitsSummary: 'Conserva voz y voto tras la jubilación, conforme al estatuto vigente.',
      grantsPoliticalRights: true,
      countsForQuorum: true,
      appearsInAuthorityRoster: true,
      effectiveFrom: '2026-01-01',
    });
    expect(creada.ok, creada.ok ? '' : JSON.stringify(creada.error)).toBe(true);
  });

  it('una calidad honoraria con derechos políticos ni siquiera llega a la base', async () => {
    const intento = await createMembershipType(secretaria, {
      code: 'HONORARIO_CON_VOTO',
      name: 'Honorario con voto',
      category: 'HONORARY_AFFILIATE',
      legalEntityId: entidadId,
      benefitsSummary: 'Esto no debería existir en ninguna instalación.',
      grantsPoliticalRights: true,
      effectiveFrom: '2026-01-01',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) {
      expect(intento.error.code).toBe('VALIDATION');
      expect(JSON.stringify(intento.error.details)).toMatch(/no concede derechos políticos/i);
    }
  });

  it('exigir pago sin concepto no se guarda', async () => {
    const intento = await createMembershipType(secretaria, {
      code: 'PAGO_SIN_CONCEPTO',
      name: 'Con costo pero sin concepto',
      category: 'UNION_MEMBER',
      legalEntityId: entidadId,
      benefitsSummary: 'Una calidad que dice cobrar y no dice con qué.',
      requiresPayment: true,
      effectiveFrom: '2026-01-01',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/con qué concepto/i);
  });

  it('una vigencia que termina antes de empezar tampoco', async () => {
    const intento = await createMembershipType(secretaria, {
      code: 'VIGENCIA_IMPOSIBLE',
      name: 'Vigencia imposible',
      category: 'UNION_MEMBER',
      legalEntityId: entidadId,
      benefitsSummary: 'Empieza en marzo y termina en enero del mismo año.',
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-01-01',
    });
    expect(intento.ok).toBe(false);
  });

  it('editar no ofrece cambiar la categoría ni los derechos', async () => {
    const honorario = await base.prisma.membershipType.findUniqueOrThrow({
      where: { code: 'AFILIADO_HONORARIO' },
      select: { id: true },
    });

    const editada = await updateMembershipType(secretaria, {
      membershipTypeId: honorario.id,
      name: 'Afiliado honorario renombrado',
      benefitsSummary: 'El mismo alcance, con otro nombre para la prueba.',
      effectiveFrom: '2026-01-01',
    });
    expect(editada.ok, editada.ok ? '' : JSON.stringify(editada.error)).toBe(true);

    const despues = await base.prisma.membershipType.findUniqueOrThrow({
      where: { id: honorario.id },
      select: { category: true, grantsPoliticalRights: true, name: true },
    });
    expect(despues.category).toBe('HONORARY_AFFILIATE');
    expect(despues.grantsPoliticalRights).toBe(false);
    expect(despues.name).toBe('Afiliado honorario renombrado');
  });

  it('quien solicita puede leer el catálogo pero no tocarlo', async () => {
    const { contexto } = await persona('SoloLee');
    const listado = await membershipTypeList(contexto, { onlyActive: true });
    expect(listado.ok).toBe(true);

    const intento = await createMembershipType(contexto, {
      code: 'NO_DEBERIA',
      name: 'No debería poder',
      category: 'UNION_MEMBER',
      legalEntityId: entidadId,
      benefitsSummary: 'Una calidad creada por alguien sin facultades.',
      effectiveFrom: '2026-01-01',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});
