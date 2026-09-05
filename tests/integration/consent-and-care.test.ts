import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  careRelationships,
  registerCareRelationship,
  relationshipReach,
  revokeCareRelationship,
} from '@/modules/membership';
import {
  consentVersionList,
  draftConsentVersion,
  grantConsent,
  hasLiveConsent,
  personConsents,
  publishConsentVersion,
  retireConsentVersion,
  revokeConsent,
} from '@/platform/consent';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Consentimientos y relaciones de cuidado (PRD §3.5, §7.3; F4-AFI-005).
 *
 * La promesa que se prueba aquí, y que atraviesa todo el archivo: **una relación
 * familiar no otorga por sí sola acceso a expedientes**. Lo declarado y lo
 * efectivo son cosas distintas, y el sistema tiene que poder decirlo en voz alta.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

beforeAll(async () => {
  base = await createTestDatabase('consentimientos');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Consentimientos',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

let contador = 0;
const codigo = (): string => {
  contador += 1;
  return `CONSENT_PRUEBA_${contador}`;
};

const TEXTO = {
  title: 'Consentimiento de prueba',
  bodyMarkdown:
    'Este es el cuerpo completo del texto de prueba. Tiene que superar los doscientos caracteres porque un aviso más corto que eso no informa de nada, y el caso de uso lo rechaza a propósito para que nadie publique un texto vacío pensando que ya cumplió.',
  plainLanguageSummary:
    'Resumen en lenguaje claro para la prueba. Explica en frases cortas qué se autoriza y cómo se retira, que es lo que la mayoría de la gente va a leer de verdad.',
};

async function textoPublicado(proposito: 'MINOR_REPRESENTATION' | 'DIRECTORY_PUBLICATION') {
  const borrador = await draftConsentVersion(secretaria, {
    ...TEXTO,
    code: codigo(),
    legalEntityId: entidadId,
    requiredFor: [proposito],
  });
  if (!borrador.ok) throw borrador.error;
  const publicado = await publishConsentVersion(secretaria, {
    consentVersionId: borrador.data.consentVersionId,
    effectiveFrom: '2026-01-01',
  });
  if (!publicado.ok) throw publicado.error;
  return borrador.data.consentVersionId;
}

describe('los textos se publican desde la plataforma (defecto `D-F4-001`)', () => {
  it('la semilla los deja en borrador, y un borrador no sirve para consentir', async () => {
    const listado = await consentVersionList(secretaria);
    expect(listado.ok).toBe(true);
    if (!listado.ok) return;
    expect(listado.data.length).toBeGreaterThan(0);
    expect(listado.data.every((texto) => texto.status === 'DRAFT')).toBe(true);
  });

  it('publicar uno lo deja disponible, con su fecha de vigencia', async () => {
    const sembrado = await base.prisma.consentVersion.findFirstOrThrow({
      where: { code: 'PRIVACY_NOTICE_PUBLIC_INTAKE' },
      select: { id: true },
    });

    const publicado = await publishConsentVersion(secretaria, {
      consentVersionId: sembrado.id,
      effectiveFrom: '2026-01-01',
    });
    expect(publicado.ok, publicado.ok ? '' : JSON.stringify(publicado.error)).toBe(true);

    const despues = await base.prisma.consentVersion.findUniqueOrThrow({
      where: { id: sembrado.id },
      select: { status: true, effectiveFrom: true },
    });
    expect(despues.status).toBe('PUBLISHED');
    expect(despues.effectiveFrom.getTime()).toBeGreaterThan(0);
  });

  it('publicar una versión nueva retira la anterior en el mismo acto', async () => {
    const code = codigo();
    const primera = await draftConsentVersion(secretaria, {
      ...TEXTO,
      code,
      legalEntityId: entidadId,
      requiredFor: ['DIRECTORY_PUBLICATION'],
    });
    if (!primera.ok) throw primera.error;
    await publishConsentVersion(secretaria, {
      consentVersionId: primera.data.consentVersionId,
      effectiveFrom: '2026-01-01',
    });

    const segunda = await draftConsentVersion(secretaria, {
      ...TEXTO,
      code,
      legalEntityId: entidadId,
      requiredFor: ['DIRECTORY_PUBLICATION'],
    });
    if (!segunda.ok) throw segunda.error;
    expect(segunda.data.version).toBe(2);

    const publicada = await publishConsentVersion(secretaria, {
      consentVersionId: segunda.data.consentVersionId,
      effectiveFrom: '2026-06-01',
    });
    expect(publicada.ok).toBe(true);
    if (!publicada.ok) return;
    expect(publicada.data.supersededId).toBe(primera.data.consentVersionId);

    const anterior = await base.prisma.consentVersion.findUniqueOrThrow({
      where: { id: primera.data.consentVersionId },
      select: { status: true },
    });
    expect(anterior.status).toBe('RETIRED');
  });

  it('un texto publicado no se vuelve a publicar', async () => {
    const id = await textoPublicado('DIRECTORY_PUBLICATION');
    const otra = await publishConsentVersion(secretaria, {
      consentVersionId: id,
      effectiveFrom: '2026-02-01',
    });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });

  it('retirar exige motivo y solo se puede sobre lo publicado', async () => {
    const id = await textoPublicado('DIRECTORY_PUBLICATION');
    const sinMotivo = await retireConsentVersion(secretaria, { consentVersionId: id, reason: 'ya no' });
    expect(sinMotivo.ok).toBe(false);

    const conMotivo = await retireConsentVersion(secretaria, {
      consentVersionId: id,
      reason: 'La asamblea aprobó un texto distinto para este propósito.',
    });
    expect(conMotivo.ok, conMotivo.ok ? '' : JSON.stringify(conMotivo.error)).toBe(true);
  });
});

describe('otorgar y revocar un consentimiento', () => {
  it('la propia persona consiente sobre un texto publicado', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Consiente', familyName: 'Ella Misma' });
    await nombrar(base.prisma, {
      userId: quien.userId,
      roleCode: 'UNION_MEMBER',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, quien);
    const versionId = await textoPublicado('DIRECTORY_PUBLICATION');

    const otorgado = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'DIRECTORY_PUBLICATION',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    expect(otorgado.ok, otorgado.ok ? '' : JSON.stringify(otorgado.error)).toBe(true);

    expect(await hasLiveConsent(quien.personId, 'DIRECTORY_PUBLICATION')).toBe(true);

    const suyos = await personConsents(suyo, { personId: quien.personId });
    expect(suyos.ok).toBe(true);
    if (!suyos.ok) return;
    expect(suyos.data[0]?.live).toBe(true);
  });

  it('no se consiente sobre un borrador', async () => {
    const quien = await crearPersonaConCuenta(base.prisma);
    const borrador = await draftConsentVersion(secretaria, {
      ...TEXTO,
      code: codigo(),
      legalEntityId: entidadId,
      requiredFor: ['DIRECTORY_PUBLICATION'],
    });
    if (!borrador.ok) throw borrador.error;

    const intento = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'DIRECTORY_PUBLICATION',
      consentVersionId: borrador.data.consentVersionId,
      medium: 'SCREEN',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });

  it('un texto genérico no sirve para un propósito que no cubre', async () => {
    const quien = await crearPersonaConCuenta(base.prisma);
    const versionId = await textoPublicado('DIRECTORY_PUBLICATION');

    const intento = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'CLINICAL_DATA_SHARING',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) {
      expect(JSON.stringify(intento.error.details)).toMatch(/no cubre este propósito/i);
    }
  });

  it('otorgar el mismo propósito otra vez revoca el anterior', async () => {
    const quien = await crearPersonaConCuenta(base.prisma);
    const versionId = await textoPublicado('DIRECTORY_PUBLICATION');

    const primero = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'DIRECTORY_PUBLICATION',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    if (!primero.ok) throw primero.error;

    const segundo = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'DIRECTORY_PUBLICATION',
      consentVersionId: versionId,
      medium: 'SIGNED_PAPER',
    });
    expect(segundo.ok).toBe(true);
    if (!segundo.ok) return;
    expect(segundo.data.replacedConsentId).toBe(primero.data.consentId);

    const vivos = await base.prisma.consent.count({
      where: { personId: quien.personId, purpose: 'DIRECTORY_PUBLICATION', revokedAt: null },
    });
    expect(vivos).toBe(1);
  });

  it('revocar surte efecto hacia el futuro y conserva la evidencia', async () => {
    const quien = await crearPersonaConCuenta(base.prisma);
    const versionId = await textoPublicado('DIRECTORY_PUBLICATION');
    const otorgado = await grantConsent(secretaria, {
      personId: quien.personId,
      purpose: 'DIRECTORY_PUBLICATION',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    if (!otorgado.ok) throw otorgado.error;

    const revocado = await revokeConsent(secretaria, {
      consentId: otorgado.data.consentId,
      reason: 'La persona pidió salir del directorio.',
    });
    expect(revocado.ok, revocado.ok ? '' : JSON.stringify(revocado.error)).toBe(true);

    expect(await hasLiveConsent(quien.personId, 'DIRECTORY_PUBLICATION')).toBe(false);

    const fila = await base.prisma.consent.findUniqueOrThrow({
      where: { id: otorgado.data.consentId },
      select: { revokedAt: true, evidence: true },
    });
    expect(fila.revokedAt).not.toBeNull();
    expect((fila.evidence as Record<string, unknown>)['medio']).toBe('SCREEN');
  });

  it('consentir en nombre de otra persona exige decir en qué relación te apoyas', async () => {
    const hija = await crearPersonaConCuenta(base.prisma, { givenName: 'Hija', familyName: 'Menor' });
    const versionId = await textoPublicado('MINOR_REPRESENTATION');

    const madre = await crearPersonaConCuenta(base.prisma, { givenName: 'Madre', familyName: 'Menor' });
    await nombrar(base.prisma, {
      userId: madre.userId,
      roleCode: 'UNION_MEMBER',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, madre);

    const sinRelacion = await grantConsent(suyo, {
      personId: hija.personId,
      purpose: 'MINOR_REPRESENTATION',
      consentVersionId: versionId,
      medium: 'SIGNED_PAPER',
    });
    expect(sinRelacion.ok).toBe(false);
    if (!sinRelacion.ok) {
      expect(JSON.stringify(sinRelacion.error.details)).toMatch(/en qué relación te apoyas/i);
    }
  });
});

describe('una relación familiar no abre expedientes por sí sola', () => {
  async function madreEHija() {
    const madre = await crearPersonaConCuenta(base.prisma, { givenName: 'Madre', familyName: `Rel${contador}` });
    const hija = await crearPersonaConCuenta(base.prisma, { givenName: 'Hija', familyName: `Rel${contador}` });
    const relacion = await registerCareRelationship(secretaria, {
      fromPersonId: madre.personId,
      toPersonId: hija.personId,
      kind: 'PARENT_OR_GUARDIAN',
      scope: ['MEMBERSHIP', 'DOCUMENTS'],
    });
    if (!relacion.ok) throw relacion.error;
    return { madre, hija, relationshipId: relacion.data.relationshipId };
  }

  it('lo declarado y lo efectivo son cosas distintas', async () => {
    const { relationshipId } = await madreEHija();
    const alcance = await relationshipReach(secretaria, { relationshipId });
    expect(alcance.ok, alcance.ok ? '' : JSON.stringify(alcance.error)).toBe(true);
    if (!alcance.ok) return;

    expect(alcance.data.live).toBe(true);
    expect(alcance.data.declaredScope).toEqual(['MEMBERSHIP', 'DOCUMENTS']);
    expect(alcance.data.effectiveScope).toEqual([]);
    expect(alcance.data.blockedBecause).toMatch(/no hay consentimiento/i);
  });

  it('con el consentimiento otorgado, lo efectivo alcanza lo declarado', async () => {
    const { hija, relationshipId } = await madreEHija();
    const versionId = await textoPublicado('MINOR_REPRESENTATION');

    const otorgado = await grantConsent(secretaria, {
      personId: hija.personId,
      purpose: 'MINOR_REPRESENTATION',
      consentVersionId: versionId,
      representationRef: relationshipId,
      medium: 'SIGNED_PAPER',
    });
    expect(otorgado.ok, otorgado.ok ? '' : JSON.stringify(otorgado.error)).toBe(true);

    const alcance = await relationshipReach(secretaria, { relationshipId });
    if (!alcance.ok) throw alcance.error;
    expect(alcance.data.effectiveScope).toEqual(['MEMBERSHIP', 'DOCUMENTS']);
    expect(alcance.data.blockedBecause).toBeNull();
  });

  it('revocar la relación tumba los consentimientos que se apoyaban en ella', async () => {
    const { hija, relationshipId } = await madreEHija();
    const versionId = await textoPublicado('MINOR_REPRESENTATION');
    await grantConsent(secretaria, {
      personId: hija.personId,
      purpose: 'MINOR_REPRESENTATION',
      consentVersionId: versionId,
      representationRef: relationshipId,
      medium: 'SIGNED_PAPER',
    });
    expect(await hasLiveConsent(hija.personId, 'MINOR_REPRESENTATION')).toBe(true);

    const revocada = await revokeCareRelationship(secretaria, {
      relationshipId,
      reason: 'Resolución judicial que retira la patria potestad.',
    });
    expect(revocada.ok, revocada.ok ? '' : JSON.stringify(revocada.error)).toBe(true);

    expect(await hasLiveConsent(hija.personId, 'MINOR_REPRESENTATION')).toBe(false);

    const alcance = await relationshipReach(secretaria, { relationshipId });
    if (!alcance.ok) throw alcance.error;
    expect(alcance.data.live).toBe(false);
    expect(alcance.data.effectiveScope).toEqual([]);
    expect(alcance.data.blockedBecause).toMatch(/revocada/i);
  });

  it('no se puede ser madre e hija de la misma persona a la vez', async () => {
    const { madre, hija } = await madreEHija();
    const inversa = await registerCareRelationship(secretaria, {
      fromPersonId: hija.personId,
      toPersonId: madre.personId,
      kind: 'CHILD',
      scope: [],
    });
    expect(inversa.ok).toBe(false);
    if (!inversa.ok) expect(inversa.error.code).toBe('CONFLICT');
  });

  it('nadie es familiar de sí mismo', async () => {
    const quien = await crearPersonaConCuenta(base.prisma);
    const intento = await registerCareRelationship(secretaria, {
      fromPersonId: quien.personId,
      toPersonId: quien.personId,
      kind: 'PRIMARY_CAREGIVER',
      scope: [],
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('VALIDATION');
  });

  it('la consulta muestra las relaciones en los dos sentidos', async () => {
    const { madre, hija } = await madreEHija();
    const deLaHija = await careRelationships(secretaria, { personId: hija.personId });
    const deLaMadre = await careRelationships(secretaria, { personId: madre.personId });
    expect(deLaHija.ok && deLaHija.data.length).toBeGreaterThan(0);
    expect(deLaMadre.ok && deLaMadre.data.length).toBeGreaterThan(0);
  });

  it('quien no tiene facultades no registra relaciones de terceros', async () => {
    const cualquiera = await crearPersonaConCuenta(base.prisma);
    const sinFacultad = await contextoDe(base.prisma, cualquiera);
    const uno = await crearPersonaConCuenta(base.prisma);
    const otro = await crearPersonaConCuenta(base.prisma);

    const intento = await registerCareRelationship(sinFacultad, {
      fromPersonId: uno.personId,
      toPersonId: otro.personId,
      kind: 'RELATIVE',
      scope: [],
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});
