import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import {
  beneficiaryDetail,
  beneficiaryRegistry,
  closeBeneficiary,
  registerBeneficiary,
  updateBeneficiary,
} from '@/modules/membership';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Beneficiario protegido (PRD §3.4, §8.3; F4-AFI-004).
 *
 * La calidad que existe para que nadie se quede fuera: atención sin afiliación
 * y sin pago. Lo que se prueba aquí es que la protección no dependa de que
 * alguien se acuerde de activarla.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;

/** Fecha de nacimiento de quien tiene la edad indicada hoy. */
function naceHace(anios: number): Date {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate()));
}

beforeAll(async () => {
  base = await createTestDatabase('beneficiarios');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'De Beneficiarios',
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

const NECESIDAD = 'Necesita acompañamiento para un trámite escolar y no sabe por dónde empezar.';

async function personaConEdad(anios: number | null, nombre: string): Promise<PersonaDePrueba> {
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre, familyName: 'Beneficiaria' });
  if (anios !== null) {
    await base.prisma.person.update({
      where: { id: persona.personId },
      data: { birthDate: naceHace(anios) },
    });
  }
  return persona;
}

describe('alta de una atención protegida', () => {
  it('se registra sin afiliación, sin pago y sin cuenta previa', async () => {
    const persona = await personaConEdad(40, 'Adulta');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'EXTERNAL_REFERRAL',
      initialNeed: NECESIDAD,
    });
    expect(alta.ok, alta.ok ? '' : JSON.stringify(alta.error)).toBe(true);
    if (!alta.ok) return;

    const fila = await base.prisma.protectedBeneficiary.findUniqueOrThrow({
      where: { id: alta.data.beneficiaryId },
      select: { privacyLevel: true, status: true, urgencyLevel: true, hasDigitalAccount: true },
    });
    // Reforzada por omisión: la protección no espera a que alguien la pida.
    expect(fila.privacyLevel).toBe('REINFORCED');
    expect(fila.status).toBe('REGISTERED');
    expect(fila.urgencyLevel).toBe('ROUTINE');

    // Y no se le abrió ninguna membresía por el camino.
    const membresias = await base.prisma.membership.count({ where: { personId: persona.personId } });
    expect(membresias).toBe(0);
  });

  it('una persona menor de edad no puede quedar en privacidad estándar', async () => {
    const persona = await personaConEdad(9, 'Menor');
    const responsable = await personaConEdad(35, 'Responsable');

    const intento = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'FAMILY_OR_CAREGIVER',
      initialNeed: NECESIDAD,
      responsiblePersonId: responsable.personId,
      privacyLevel: 'STANDARD',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });

  it('una persona menor de edad exige decir quién la representa', async () => {
    const persona = await personaConEdad(12, 'Menor');
    const intento = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'FAMILY_OR_CAREGIVER',
      initialNeed: NECESIDAD,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) {
      expect(JSON.stringify(intento.error.details)).toMatch(/quién la representa/i);
    }
  });

  it('nadie es responsable de sí mismo', async () => {
    const persona = await personaConEdad(30, 'Sola');
    const intento = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SOCIAL_STAFF',
      initialNeed: NECESIDAD,
      responsiblePersonId: persona.personId,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(JSON.stringify(intento.error.details)).toMatch(/responsable de sí/i);
  });

  it('dos atenciones vivas para la misma persona y entidad no se abren', async () => {
    const persona = await personaConEdad(28, 'Repetida');
    const primera = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'DELEGATE',
      initialNeed: NECESIDAD,
    });
    if (!primera.ok) throw primera.error;

    const segunda = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'DELEGATE',
      initialNeed: NECESIDAD,
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) {
      expect(segunda.error.code).toBe('CONFLICT');
      // El mensaje dice cuál es la abierta, para que quien atiende pueda ir a ella.
      expect(segunda.error.message).toContain(primera.data.publicId);
    }
  });

  it('quien se registra a sí misma declara ese origen y no otro', async () => {
    const persona = await crearPersonaConCuenta(base.prisma, { givenName: 'Pide', familyName: 'Ayuda' });
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, persona);

    const ajeno = await registerBeneficiary(suyo, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'CIAN',
      initialNeed: NECESIDAD,
    });
    expect(ajeno.ok).toBe(false);

    const propio = await registerBeneficiary(suyo, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: NECESIDAD,
    });
    expect(propio.ok, propio.ok ? '' : JSON.stringify(propio.error)).toBe(true);
  });

  it('quien solo puede registrarse a sí misma no registra a otra persona', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Solicita', familyName: 'Nada Mas' });
    await nombrar(base.prisma, {
      userId: quien.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, quien);
    const otra = await personaConEdad(33, 'Ajena');

    const intento = await registerBeneficiary(suyo, {
      personId: otra.personId,
      legalEntityId: entidadId,
      originKind: 'FAMILY_OR_CAREGIVER',
      initialNeed: NECESIDAD,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });
});

describe('seguimiento y cierre de la atención', () => {
  async function atencion(edad = 26) {
    const persona = await personaConEdad(edad, 'Seguimiento');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SOCIAL_STAFF',
      initialNeed: NECESIDAD,
    });
    if (!alta.ok) throw alta.error;
    return { persona, ...alta.data };
  }

  it('bajar la privacidad a estándar exige motivo escrito', async () => {
    const { beneficiaryId } = await atencion();

    const sinMotivo = await updateBeneficiary(secretaria, {
      beneficiaryId,
      urgencyLevel: 'PRIORITY',
      status: 'IN_ATTENTION',
      privacyLevel: 'STANDARD',
    });
    expect(sinMotivo.ok).toBe(false);

    const conMotivo = await updateBeneficiary(secretaria, {
      beneficiaryId,
      urgencyLevel: 'PRIORITY',
      status: 'IN_ATTENTION',
      privacyLevel: 'STANDARD',
      privacyChangeReason: 'La persona pidió por escrito que su caso pueda verlo el equipo territorial.',
    });
    expect(conMotivo.ok, conMotivo.ok ? '' : JSON.stringify(conMotivo.error)).toBe(true);

    const fila = await base.prisma.protectedBeneficiary.findUniqueOrThrow({
      where: { id: beneficiaryId },
      select: { privacyLevel: true, urgencyLevel: true, status: true },
    });
    expect(fila.privacyLevel).toBe('STANDARD');
    expect(fila.urgencyLevel).toBe('PRIORITY');
    expect(fila.status).toBe('IN_ATTENTION');
  });

  it('la privacidad de una persona menor de edad no baja ni con motivo', async () => {
    const persona = await personaConEdad(10, 'Menor');
    const responsable = await personaConEdad(38, 'Madre');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'FAMILY_OR_CAREGIVER',
      initialNeed: NECESIDAD,
      responsiblePersonId: responsable.personId,
    });
    if (!alta.ok) throw alta.error;

    const intento = await updateBeneficiary(secretaria, {
      beneficiaryId: alta.data.beneficiaryId,
      urgencyLevel: 'URGENT',
      status: 'IN_ATTENTION',
      privacyLevel: 'STANDARD',
      privacyChangeReason: 'Motivo escrito que no debería bastar para una persona menor de edad.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });

  it('cerrar exige contar cómo terminó, y lo cerrado ya no se edita', async () => {
    const { beneficiaryId } = await atencion();

    const sinRelato = await closeBeneficiary(secretaria, {
      beneficiaryId,
      outcome: 'CLOSED',
      closeReason: 'ya',
    });
    expect(sinRelato.ok).toBe(false);

    const cerrada = await closeBeneficiary(secretaria, {
      beneficiaryId,
      outcome: 'CLOSED',
      closeReason: 'Se acompañó el trámite hasta el final y la persona confirmó que quedó resuelto.',
    });
    expect(cerrada.ok, cerrada.ok ? '' : JSON.stringify(cerrada.error)).toBe(true);

    const despues = await updateBeneficiary(secretaria, {
      beneficiaryId,
      urgencyLevel: 'URGENT',
      status: 'IN_ATTENTION',
      privacyLevel: 'REINFORCED',
    });
    expect(despues.ok).toBe(false);
    if (!despues.ok) {
      expect(despues.error.code).toBe('CONFLICT');
      expect(despues.error.message).toMatch(/Abre una nueva/i);
    }
  });

  it('cerrada una atención, se puede abrir otra más adelante', async () => {
    const { beneficiaryId, persona } = await atencion();
    const cerrada = await closeBeneficiary(secretaria, {
      beneficiaryId,
      outcome: 'CLOSED',
      closeReason: 'Terminó el acompañamiento y la persona no necesita nada más por ahora.',
    });
    if (!cerrada.ok) throw cerrada.error;

    const nueva = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Volvió meses después con una necesidad distinta, y esta vez es de vivienda.',
    });
    expect(nueva.ok, nueva.ok ? '' : JSON.stringify(nueva.error)).toBe(true);
  });
});

describe('el padrón de atenciones', () => {
  it('con privacidad reforzada no enseña la necesidad en el listado', async () => {
    const persona = await personaConEdad(45, 'Reservada');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'CIAN',
      initialNeed: 'Una necesidad que no tiene por qué leerse de pasada en una lista.',
    });
    if (!alta.ok) throw alta.error;

    const listado = await beneficiaryRegistry(secretaria, { query: alta.data.publicId });
    expect(listado.ok, listado.ok ? '' : JSON.stringify(listado.error)).toBe(true);
    if (!listado.ok) return;
    expect(listado.data).toHaveLength(1);
    expect(listado.data[0]?.initialNeed).toBeNull();
    expect(listado.data[0]?.personName).toContain('Reservada');
  });

  it('el expediente sí enseña la necesidad, y deja constancia de la lectura', async () => {
    const persona = await personaConEdad(38, 'Expediente');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Lo que contó de su vida se lee al abrir el expediente, no de pasada en una tabla.',
    });
    if (!alta.ok) throw alta.error;

    const antes = await base.prisma.auditEvent.count({
      where: { action: 'membership.beneficiary.file_read', objectId: alta.data.beneficiaryId },
    });

    const expediente = await beneficiaryDetail(secretaria, alta.data.beneficiaryId);
    expect(expediente.ok, expediente.ok ? '' : JSON.stringify(expediente.error)).toBe(true);
    if (!expediente.ok) return;
    // Ocultar en el listado y mostrar en el expediente no son la misma regla
    // (defecto `D-F4-011`).
    expect(expediente.data.initialNeed).toContain('Lo que contó de su vida');
    expect(expediente.data.privacyLevel).toBe('REINFORCED');

    const despues = await base.prisma.auditEvent.count({
      where: { action: 'membership.beneficiary.file_read', objectId: alta.data.beneficiaryId },
    });
    expect(despues).toBe(antes + 1);
  });

  it('el expediente con privacidad estándar se lee sin dejar asiento de lectura', async () => {
    const persona = await personaConEdad(41, 'Estandar');
    const alta = await registerBeneficiary(secretaria, {
      personId: persona.personId,
      legalEntityId: entidadId,
      originKind: 'SELF',
      initialNeed: 'Una necesidad que la propia persona pidió que pudiera ver el equipo territorial.',
    });
    if (!alta.ok) throw alta.error;
    const bajada = await updateBeneficiary(secretaria, {
      beneficiaryId: alta.data.beneficiaryId,
      urgencyLevel: 'ROUTINE',
      status: 'REGISTERED',
      privacyLevel: 'STANDARD',
      privacyChangeReason: 'La persona pidió por escrito que su caso lo pueda ver el equipo territorial.',
    });
    if (!bajada.ok) throw bajada.error;

    const expediente = await beneficiaryDetail(secretaria, alta.data.beneficiaryId);
    expect(expediente.ok).toBe(true);
    if (!expediente.ok) return;
    expect(expediente.data.initialNeed).toContain('equipo territorial');

    const asientos = await base.prisma.auditEvent.count({
      where: { action: 'membership.beneficiary.file_read', objectId: alta.data.beneficiaryId },
    });
    expect(asientos).toBe(0);
  });

  it('un expediente inexistente no se distingue de uno ajeno: no encontrado', async () => {
    const inexistente = await beneficiaryDetail(secretaria, '00000000-0000-4000-8000-000000000000');
    expect(inexistente.ok).toBe(false);
    if (!inexistente.ok) expect(inexistente.error.code).toBe('NOT_FOUND');
  });

  it('quien no tiene la facultad de leer el padrón no lo lee', async () => {
    const quien = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Padron' });
    await nombrar(base.prisma, {
      userId: quien.userId,
      roleCode: 'APPLICANT',
      grantedById: secretariaPersona.userId,
      legalEntityId: entidadId,
    });
    const suyo = await contextoDe(base.prisma, quien);

    const listado = await beneficiaryRegistry(suyo);
    expect(listado.ok).toBe(false);
    if (!listado.ok) expect(listado.error.code).toBe('FORBIDDEN');
  });
});
