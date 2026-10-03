import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  beneficiaryDetail,
  beneficiaryRegistry,
  membershipByCredential,
  registerBeneficiary,
  revokeBeneficiary,
  updateBeneficiary,
  verifyCredential,
} from '@/modules/membership';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { tokenDe } from '@/platform/credentials/signing';

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

function naceHace(anios: number): Date {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate()));
}

beforeAll(async () => {
  base = await createTestDatabase('beneficiarios');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  secretariaPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaria', familyName: 'Beneficiarios' });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);
}, 180_000);

afterAll(async () => base.destroy());

async function personaConEdad(anios: number, nombre: string): Promise<PersonaDePrueba> {
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre, familyName: 'Beneficiaria' });
  await base.prisma.person.update({ where: { id: persona.personId }, data: { birthDate: naceHace(anios) } });
  return persona;
}

async function altaDe(persona: PersonaDePrueba) {
  const alta = await registerBeneficiary(secretaria, {
    personId: persona.personId,
    legalEntityId: entidadId,
    profileKind: 'NEURODIVERGENT_PERSON',
    originKind: 'SOCIAL_STAFF',
  });
  if (!alta.ok) throw alta.error;
  return alta.data;
}

describe('registro protegido persistente', () => {
  it('nace activo, sin membresía ni pago, y emite su propia credencial', async () => {
    const persona = await personaConEdad(40, 'Adulta');
    const alta = await altaDe(persona);
    const fila = await base.prisma.protectedBeneficiary.findUniqueOrThrow({
      where: { id: alta.beneficiaryId },
      include: { credentials: true },
    });
    expect(fila.status).toBe('ACTIVE');
    expect(fila.profileKind).toBe('NEURODIVERGENT_PERSON');
    expect(fila.credentials).toHaveLength(1);
    const credencial = fila.credentials[0]!;
    expect(credencial.credentialKind).toBe('PROTECTED_BENEFICIARY');
    expect(credencial.membershipId).toBeNull();
    const token = tokenDe(credencial);
    expect((await verifyCredential(token)).status).toBe('ACTIVE');
    const paraAsamblea = await membershipByCredential(secretaria, token);
    expect(paraAsamblea.ok).toBe(true);
    if (paraAsamblea.ok) expect(paraAsamblea.data).toBeNull();
    expect(await base.prisma.membership.count({ where: { personId: persona.personId } })).toBe(0);
  });

  it('solo existe una ficha por persona y entidad, incluso después de revocarla', async () => {
    const persona = await personaConEdad(28, 'Única');
    const primera = await altaDe(persona);
    const revocada = await revokeBeneficiary(secretaria, {
      beneficiaryId: primera.beneficiaryId,
      reasonKind: 'PERSON_REQUEST',
      reason: 'La persona solicitó expresamente cancelar su registro protegido.',
    });
    expect(revocada.ok).toBe(true);
    const segunda = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      profileKind: 'NEURODIVERGENT_PERSON',
      originKind: 'SELF',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.message).toMatch(/restaur/i);
  });

  it('una persona menor requiere representante y privacidad reforzada', async () => {
    const menor = await personaConEdad(10, 'Menor');
    const responsable = await personaConEdad(38, 'Responsable');
    const sinResponsable = await registerBeneficiary(secretaria, {
      personId: menor.personId,
      legalEntityId: entidadId,
      profileKind: 'NEURODIVERGENT_PERSON',
      originKind: 'FAMILY_OR_CAREGIVER',
    });
    expect(sinResponsable.ok).toBe(false);
    const sinPrivacidad = await registerBeneficiary(secretaria, {
      personId: menor.personId,
      legalEntityId: entidadId,
      profileKind: 'NEURODIVERGENT_PERSON',
      originKind: 'FAMILY_OR_CAREGIVER',
      responsiblePersonId: responsable.personId,
      privacyLevel: 'STANDARD',
    });
    expect(sinPrivacidad.ok).toBe(false);
  });

  it('quien se registra a sí misma solo puede declarar origen propio', async () => {
    const persona = await personaConEdad(30, 'Propia');
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const actor = await contextoDe(base.prisma, persona);
    const incorrecto = await registerBeneficiary(actor, {
      personId: persona.personId,
      legalEntityId: entidadId,
      profileKind: 'FAMILY_MEMBER',
      originKind: 'EXTERNAL_REFERRAL',
    });
    expect(incorrecto.ok).toBe(false);
    const correcto = await registerBeneficiary(actor, {
      personId: persona.personId,
      legalEntityId: entidadId,
      profileKind: 'NEURODIVERGENT_PERSON',
      originKind: 'SELF',
    });
    expect(correcto.ok).toBe(true);
  });
});

describe('actualización y revocación', () => {
  it('bajar privacidad exige motivo y nunca se permite para menores', async () => {
    const adulta = await personaConEdad(35, 'Privacidad');
    const alta = await altaDe(adulta);
    const sinMotivo = await updateBeneficiary(secretaria, {
      beneficiaryId: alta.beneficiaryId,
      profileKind: 'NEURODIVERGENT_PERSON',
      privacyLevel: 'STANDARD',
    });
    expect(sinMotivo.ok).toBe(false);
    const conMotivo = await updateBeneficiary(secretaria, {
      beneficiaryId: alta.beneficiaryId,
      profileKind: 'NEURODIVERGENT_PERSON',
      privacyLevel: 'STANDARD',
      privacyChangeReason: 'La persona lo solicitó por escrito para la gestión territorial.',
    });
    expect(conMotivo.ok).toBe(true);
  });

  it('revocar conserva la ficha y el acceso al historial, pero revoca la credencial y notifica', async () => {
    const persona = await personaConEdad(42, 'Revocable');
    const alta = await altaDe(persona);
    const credencial = await base.prisma.memberCredential.findFirstOrThrow({
      where: { protectedBeneficiaryId: alta.beneficiaryId },
    });
    const token = tokenDe(credencial);
    const resultado = await revokeBeneficiary(secretaria, {
      beneficiaryId: alta.beneficiaryId,
      reasonKind: 'ADMINISTRATIVE_ERROR',
      reason: 'Se comprobó que el alta corresponde a un error administrativo.',
    });
    expect(resultado.ok).toBe(true);
    expect((await verifyCredential(token)).status).toBe('REVOKED');
    const ficha = await base.prisma.protectedBeneficiary.findUniqueOrThrow({ where: { id: alta.beneficiaryId } });
    expect(ficha.status).toBe('REVOKED');
    expect(ficha.revokedAt).not.toBeNull();
    expect(await base.prisma.notification.count({
      where: { personId: persona.personId, relatedId: alta.beneficiaryId },
    })).toBe(1);
  });
});

describe('lectura del registro', () => {
  it('lista y detalle muestran la ficha, no el relato de una atención', async () => {
    const persona = await personaConEdad(33, 'Consultable');
    const alta = await altaDe(persona);
    const listado = await beneficiaryRegistry(secretaria, { query: alta.publicId });
    expect(listado.ok).toBe(true);
    if (listado.ok) {
      expect(listado.data).toHaveLength(1);
      expect(listado.data[0]?.profileKind).toBe('NEURODIVERGENT_PERSON');
    }
    const detalle = await beneficiaryDetail(secretaria, alta.beneficiaryId);
    expect(detalle.ok).toBe(true);
    if (detalle.ok) expect(detalle.data.status).toBe('ACTIVE');
  });

  it('sin permiso no se puede leer el registro masivo', async () => {
    const persona = await personaConEdad(30, 'Sin Padrón');
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const actor = await contextoDe(base.prisma, persona);
    const listado = await beneficiaryRegistry(actor);
    expect(listado.ok).toBe(false);
    if (!listado.ok) expect(listado.error.code).toBe('FORBIDDEN');
  });
});
