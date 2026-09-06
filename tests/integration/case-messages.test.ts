import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import {
  addParticipant,
  assignCase,
  caseDetail,
  editMessage,
  openCase,
  sendMessage,
} from '@/modules/cases';

/**
 * Comunicaciones con audiencias diferenciadas y notas reservadas
 * (PRD §10.2, §10.3; F6-CAS-008).
 *
 * Cuatro promesas que se comprueban ejecutando:
 *
 *  · La audiencia decide **quién lee**: la persona no ve las notas internas, el
 *    equipo no ve las reservadas, y el recorte ocurre en la consulta.
 *  · **No se escribe en un cajón que no se puede abrir**: escribir una nota
 *    reservada exige la misma facultad que leerla.
 *  · Leer deja **acuse** cuando quien lee es la persona a la que iba dirigida.
 *  · Una comunicación **acusada ya no se corrige**: lo que se le dijo es el
 *    hecho.
 */

let base: TestDatabase;
let fuerzaId: string;
let atiende: PersonaDePrueba;
let apoya: PersonaDePrueba;
let supervisa: PersonaDePrueba;
let laPersona: PersonaDePrueba;

const CONTEXTO = { correlationId: 'prueba-comunicaciones', ipHash: 'huella-de-comunicaciones' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

beforeAll(async () => {
  base = await createTestDatabase('comunicaciones');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  supervisa = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Supervisa' });
  // La delegación territorial lleva expedientes y **no** lee lo reservado: es
  // la que separa de verdad las dos facultades.
  apoya = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Apoya' });
  laPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Pidió Ayuda' });

  for (const persona of [atiende, supervisa]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
  await nombrar(base.prisma, {
    userId: apoya.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  // Quien pidió la ayuda entra con el rol que le corresponde por su calidad.
  await nombrar(base.prisma, {
    userId: laPersona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
    'case_event',
    'case_message',
    'case_task',
    'case_assignment',
    'case_participant',
    'case_file',
    'support_request',
  ]) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/**
 * Abre un expediente con quien atiende a cargo, quien apoya en el equipo y la
 * persona que pidió la ayuda como participante que lo ve.
 */
async function abrir(): Promise<{ caseId: string; publicId: string }> {
  const enviado = await submitRequest(
    {
      requestType: 'INDIVIDUAL_LABOR_DISPUTE',
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'Me despidieron tras pedir un ajuste',
      narrative: RELATO,
      acceptedPrivacyNotice: true,
    },
    CONTEXTO,
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true },
  });

  const canalizada = await confirmRouting(await contextoDe(base.prisma, atiende), {
    requestId: solicitud.id,
    legalEntity: 'FUERZA_INDIGO',
    urgency: 'PRIORITY',
    note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral.',
  });
  if (!canalizada.ok) throw new Error(canalizada.error.message);

  const abierto = await openCase(await contextoDe(base.prisma, atiende), {
    supportRequestId: solicitud.id,
    legalEntityId: fuerzaId,
    domain: 'UNION_DEFENSE',
    caseType: 'INDIVIDUAL_LABOR_DISPUTE',
    priority: 'HIGH',
    reason: 'Hay plazo para impugnar el despido y hace falta expediente.',
  });
  if (!abierto.ok) throw new Error(abierto.error.message);

  const entra = await assignCase(await contextoDe(base.prisma, atiende), {
    caseId: abierto.data.caseId,
    userId: apoya.userId,
    assignmentRole: 'SUPPORT',
    reason: 'Entra a apoyar en la preparación de la demanda.',
  });
  if (!entra.ok) throw new Error(entra.error.message);

  const participa = await addParticipant(await contextoDe(base.prisma, atiende), {
    caseId: abierto.data.caseId,
    personId: laPersona.personId,
    role: 'APPLICANT',
    reason: 'Es quien escribió pidiendo ayuda, ya identificada en el padrón.',
  });
  if (!participa.ok) throw new Error(participa.error.message);

  return { caseId: abierto.data.caseId, publicId: abierto.data.publicId };
}

/** Escribe una de cada audiencia y devuelve sus identificadores. */
async function lasTres(caseId: string): Promise<{ conLaPersona: string; delEquipo: string; reservada: string }> {
  const conLaPersona = await sendMessage(await contextoDe(base.prisma, atiende), {
    caseId,
    audience: 'PERSON_AND_TEAM',
    body: 'Ya presentamos la demanda. La audiencia está señalada para el 20 y te acompañamos.',
  });
  const delEquipo = await sendMessage(await contextoDe(base.prisma, atiende), {
    caseId,
    audience: 'TEAM_ONLY',
    body: 'La empresa ofreció conciliar por debajo de lo que corresponde. No lo trasladamos todavía.',
  });
  const reservada = await sendMessage(await contextoDe(base.prisma, atiende), {
    caseId,
    audience: 'SUPERVISION_ONLY',
    body: 'Hay una duda sobre cómo se llevó la primera entrevista. Lo reviso con la coordinación.',
  });
  if (!conLaPersona.ok || !delEquipo.ok || !reservada.ok) throw new Error('No se pudieron escribir las tres.');
  return {
    conLaPersona: conLaPersona.data.messageId,
    delEquipo: delEquipo.data.messageId,
    reservada: reservada.data.messageId,
  };
}

describe('la audiencia decide quién lee', () => {
  it('quien pidió la ayuda solo ve lo que se le dirigió', async () => {
    const { caseId, publicId } = await abrir();
    await lasTres(caseId);

    const suyo = await caseDetail(await contextoDe(base.prisma, laPersona), publicId);
    expect(suyo.ok, suyo.ok ? '' : suyo.error.message).toBe(true);
    if (!suyo.ok) return;

    expect(suyo.data.lectura).toBe('PERSONA');
    expect(suyo.data.comunicaciones).toHaveLength(1);
    expect(suyo.data.comunicaciones[0]?.audiencia).toBe('PERSON_AND_TEAM');
    // Y lo que no le corresponde no llega ni en el cuerpo: no se trajo.
    const todo = JSON.stringify(suyo.data.comunicaciones);
    expect(todo).not.toContain('conciliar por debajo');
    expect(todo).not.toContain('primera entrevista');
  });

  it('quien lleva el expediente ve lo suyo y lo del equipo, nunca lo reservado', async () => {
    const { caseId, publicId } = await abrir();
    await lasTres(caseId);

    const delEquipo = await caseDetail(await contextoDe(base.prisma, apoya), publicId);
    expect(delEquipo.ok, delEquipo.ok ? '' : delEquipo.error.message).toBe(true);
    if (!delEquipo.ok) return;

    expect(delEquipo.data.lectura).toBe('EQUIPO');
    expect(delEquipo.data.comunicaciones).toHaveLength(2);
    expect(delEquipo.data.comunicaciones.map((mensaje) => mensaje.audiencia)).not.toContain('SUPERVISION_ONLY');
    expect(JSON.stringify(delEquipo.data.comunicaciones)).not.toContain('primera entrevista');
  });

  it('quien tiene la facultad de leer lo reservado ve las tres', async () => {
    const { caseId, publicId } = await abrir();
    await lasTres(caseId);

    const conSupervision = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(conSupervision.ok).toBe(true);
    if (!conSupervision.ok) return;

    expect(conSupervision.data.lectura).toBe('SUPERVISION');
    expect(conSupervision.data.comunicaciones).toHaveLength(3);
  });

  it('quien no lleva el expediente ni es parte no ve ninguna, porque no ve el expediente', async () => {
    const { caseId, publicId } = await abrir();
    await lasTres(caseId);

    const ajena = await caseDetail(await contextoDe(base.prisma, supervisa), publicId);
    expect(ajena.ok).toBe(false);
  });
});

describe('no se escribe en un cajón que no se puede abrir', () => {
  it('quien no puede leer lo reservado tampoco escribe una nota reservada', async () => {
    const { caseId } = await abrir();

    const intento = await sendMessage(await contextoDe(base.prisma, apoya), {
      caseId,
      audience: 'SUPERVISION_ONLY',
      body: 'Intento de dejar una nota que después no podría volver a consultar.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('misma facultad que leerla');

    expect(await base.prisma.caseMessage.count({ where: { caseId, audience: 'SUPERVISION_ONLY' } })).toBe(0);
  });

  it('pero sí escribe las otras dos', async () => {
    const { caseId } = await abrir();

    for (const audiencia of ['PERSON_AND_TEAM', 'TEAM_ONLY'] as const) {
      const enviada = await sendMessage(await contextoDe(base.prisma, apoya), {
        caseId,
        audience: audiencia,
        body: 'Comunicación ordinaria dentro del expediente, para la audiencia que corresponde.',
      });
      expect(enviada.ok, enviada.ok ? '' : enviada.error.message).toBe(true);
    }
  });

  it('quien no lleva el expediente no comunica nada dentro de él', async () => {
    const { caseId } = await abrir();

    const intento = await sendMessage(await contextoDe(base.prisma, supervisa), {
      caseId,
      audience: 'TEAM_ONLY',
      body: 'Intento de escribir en un expediente que no lleva ni del que es parte.',
    });
    expect(intento.ok).toBe(false);
  });

  it('la bitácora dice que se comunicó y a quién, nunca qué se dijo', async () => {
    const { caseId } = await abrir();
    await lasTres(caseId);

    const eventos = await base.prisma.caseEvent.findMany({
      where: { caseId, kind: 'MESSAGE_SENT' },
      select: { summary: true, payload: true },
    });
    expect(eventos).toHaveLength(3);

    // Copiar el cuerpo pondría la nota reservada en una tabla que lee más gente
    // que la propia nota.
    const todo = JSON.stringify(eventos);
    expect(todo).not.toContain('primera entrevista');
    expect(todo).not.toContain('conciliar por debajo');
    expect(todo).toContain('Nota reservada');
  });
});

describe('leer deja acuse, y lo acusado ya no se corrige', () => {
  it('cuando la persona lo abre queda constancia de que lo leyó', async () => {
    const { caseId, publicId } = await abrir();
    const mensajes = await lasTres(caseId);

    const antes = await base.prisma.caseMessage.findUniqueOrThrow({
      where: { id: mensajes.conLaPersona },
      select: { readReceipts: true },
    });
    expect(antes.readReceipts).toEqual([]);

    const suyo = await caseDetail(await contextoDe(base.prisma, laPersona), publicId);
    expect(suyo.ok).toBe(true);

    const despues = await base.prisma.caseMessage.findUniqueOrThrow({
      where: { id: mensajes.conLaPersona },
      select: { readReceipts: true },
    });
    const acuses = despues.readReceipts as { personId: string }[];
    expect(acuses).toHaveLength(1);
    expect(acuses[0]?.personId).toBe(laPersona.personId);

    // Leer dos veces no acusa dos veces: el acuse dice que se le dijo, no
    // cuántas veces volvió a mirarlo.
    await caseDetail(await contextoDe(base.prisma, laPersona), publicId);
    const otraVez = await base.prisma.caseMessage.findUniqueOrThrow({
      where: { id: mensajes.conLaPersona },
      select: { readReceipts: true },
    });
    expect(otraVez.readReceipts as unknown[]).toHaveLength(1);
  });

  it('el equipo no acusa recibo de sus propias notas internas', async () => {
    const { caseId, publicId } = await abrir();
    const mensajes = await lasTres(caseId);

    await caseDetail(await contextoDe(base.prisma, apoya), publicId);

    const interna = await base.prisma.caseMessage.findUniqueOrThrow({
      where: { id: mensajes.delEquipo },
      select: { readReceipts: true },
    });
    expect(interna.readReceipts).toEqual([]);
  });

  it('quien la escribió la corrige mientras nadie la haya leído', async () => {
    const { caseId } = await abrir();
    const mensajes = await lasTres(caseId);

    const corregida = await editMessage(await contextoDe(base.prisma, atiende), {
      messageId: mensajes.conLaPersona,
      body: 'Ya presentamos la demanda. La audiencia está señalada para el 21, no el 20, y te acompañamos.',
    });
    expect(corregida.ok, corregida.ok ? '' : corregida.error.message).toBe(true);

    const fila = await base.prisma.caseMessage.findUniqueOrThrow({
      where: { id: mensajes.conLaPersona },
      select: { body: true, editedAt: true },
    });
    expect(fila.body).toContain('el 21');
    // Queda escrito que se corrigió: una corrección invisible es una reescritura.
    expect(fila.editedAt).not.toBeNull();
  });

  it('después del acuse ya no, y lo dice', async () => {
    const { caseId, publicId } = await abrir();
    const mensajes = await lasTres(caseId);

    await caseDetail(await contextoDe(base.prisma, laPersona), publicId);

    const intento = await editMessage(await contextoDe(base.prisma, atiende), {
      messageId: mensajes.conLaPersona,
      body: 'Intento de reescribir lo que la persona ya leyó, que es lo que se le dijo.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('ya la leyó');
  });

  it('otra persona del equipo no reescribe lo que alguien firmó', async () => {
    const { caseId } = await abrir();
    const mensajes = await lasTres(caseId);

    const intento = await editMessage(await contextoDe(base.prisma, apoya), {
      messageId: mensajes.conLaPersona,
      body: 'Intento de reescribir una comunicación que seguiría apareciendo con otro nombre.',
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('quien la escribió');
  });

  it('la base no admite reescribir de quién es ni a quién iba', async () => {
    const { caseId } = await abrir();
    const mensajes = await lasTres(caseId);
    void caseId;

    // La aplicación no tiene privilegio sobre esas columnas: la garantía está
    // en el motor, no en el caso de uso que podría olvidarse de comprobarla.
    await expect(
      base.prisma.caseMessage.update({
        where: { id: mensajes.reservada },
        data: { audience: 'PERSON_AND_TEAM' },
      }),
    ).rejects.toThrow();
  });
});
