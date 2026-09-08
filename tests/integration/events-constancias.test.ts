import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { draftTemplate, publishTemplate } from '@/modules/documents';
import {
  addEventMaterial,
  createEvent,
  eventMaterialsForViewer,
  issueConstancy,
  openEventRegistration,
  publishEvent,
  registerAttendance,
  registerForEvent,
  revokeConstancy,
  verifyConstancy,
} from '@/modules/events';
import { authorizeDownload } from '@/platform/files';
import { withReason } from '@/platform/kernel/actor-context';

/**
 * Asistencia, materiales y constancias verificables y revocables
 * (PRD §16.3; Fase 9, bloque G, criterio 5).
 *
 * Se prueba contra la base real, con el método de romper: la constancia se emite
 * a quien asistió y verifica como válida; una constancia revocada verifica como
 * revocada —nunca como válida—; no se revoca una que no existe; y un material
 * reservado no se sirve a quien no está inscrito.
 */

let base: TestDatabase;
let entidadId: string;
let organiza: ActorContext;

/** Un PDF mínimo con su firma real: el servicio comprueba el contenido. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);

beforeAll(async () => {
  base = await createTestDatabase('eventos_constancias');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const org = await crearPersonaConCuenta(base.prisma, { givenName: 'Organiza', familyName: 'Eventos' });
  // La Secretaría Ejecutiva gestiona eventos, emite y revoca constancias, y
  // administra plantillas de documento: puede montar el flujo entero.
  await nombrar(base.prisma, { userId: org.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  organiza = await contextoDe(base.prisma, org);

  const plantilla = await draftTemplate(organiza, {
    code: 'CONSTANCIA_EVENTO',
    name: 'Constancia de participación',
    kind: 'ATTENDANCE_CONSTANCY',
    legalEntityId: entidadId,
    bodyTemplate: '<p>Se hace constar que {{participante}} participó en {{evento}}, del {{inicia}} al {{concluye}}.</p>',
    variables: ['participante', 'evento', 'inicia', 'concluye'],
    numberingSeries: 'CONST',
  });
  if (!plantilla.ok) throw new Error(plantilla.error.message);
  const publicada = await publishTemplate(organiza, { templateId: plantilla.data.templateId });
  if (!publicada.ok) throw new Error(publicada.error.message);
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

async function persona(nombre: string): Promise<ActorContext> {
  const p = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  return contextoDe(base.prisma, p);
}

async function eventoConConstancia(): Promise<string> {
  const plantilla = await base.prisma.documentTemplate.findFirstOrThrow({
    where: { code: 'CONSTANCIA_EVENTO', status: 'PUBLISHED' },
    select: { id: true },
  });
  const inicio = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const creado = await createEvent(organiza, {
    title: `Curso ${Math.random().toString(36).slice(2, 7)}`,
    kind: 'COURSE',
    legalEntityId: entidadId,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
    modality: 'IN_PERSON',
    visibility: 'MEMBERS',
    issuesConstancy: true,
    constancyTemplateId: plantilla.id,
  });
  if (!creado.ok) throw new Error(creado.error.message);
  await publishEvent(organiza, { eventId: creado.data.eventId });
  await openEventRegistration(organiza, { eventId: creado.data.eventId });
  return creado.data.eventId;
}

async function inscribir(eventId: string, actor: ActorContext): Promise<string> {
  const r = await registerForEvent(actor, { eventId });
  if (!r.ok) throw new Error('no se inscribió');
  const reg = await base.prisma.eventRegistration.findFirstOrThrow({
    where: { eventId, personId: actor.personId ?? '' },
    select: { id: true },
  });
  return reg.id;
}

describe('constancias verificables y revocables', () => {
  it('se emite a quien asistió y verifica como válida', async () => {
    const eventId = await eventoConConstancia();
    const ana = await persona('Ana');
    const registrationId = await inscribir(eventId, ana);

    await registerAttendance(organiza, { registrationId, attended: true, evaluationScore: 90 });
    const emitida = await issueConstancy(organiza, { registrationId });
    expect(emitida.ok).toBe(true);
    if (!emitida.ok) return;

    const v = await verifyConstancy(emitida.data.publicId);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.data.revoked).toBe(false);
    expect(v.data.participantName).toContain('Ana');
  });

  it('no se emite a quien no asistió', async () => {
    const eventId = await eventoConConstancia();
    const beto = await persona('Beto');
    const registrationId = await inscribir(eventId, beto);

    const emitida = await issueConstancy(organiza, { registrationId });
    expect(emitida.ok).toBe(false);
    if (!emitida.ok) expect(emitida.error.code).toBe('RULE_VIOLATION');
  });

  it('LA GARANTÍA: una constancia revocada verifica como revocada, nunca como válida', async () => {
    const eventId = await eventoConConstancia();
    const ce = await persona('Ce');
    const registrationId = await inscribir(eventId, ce);
    await registerAttendance(organiza, { registrationId, attended: true });
    const emitida = await issueConstancy(organiza, { registrationId });
    if (!emitida.ok) throw new Error('no se emitió');

    const revocada = await revokeConstancy(withReason(organiza, 'Se emitió a la persona equivocada.'), { registrationId });
    expect(revocada.ok).toBe(true);

    const v = await verifyConstancy(emitida.data.publicId);
    expect(v.ok && v.data.revoked).toBe(true);

    // El documento subyacente queda cancelado: una constancia revocada no es un
    // documento vigente.
    const doc = await base.prisma.generatedDocument.findFirstOrThrow({
      where: { publicId: emitida.data.publicId },
      select: { status: true },
    });
    expect(doc.status).toBe('CANCELLED');
  });

  it('no se revoca una constancia que no existe', async () => {
    const eventId = await eventoConConstancia();
    const de = await persona('De');
    const registrationId = await inscribir(eventId, de);
    const revocada = await revokeConstancy(withReason(organiza, 'motivo'), { registrationId });
    expect(revocada.ok).toBe(false);
    if (!revocada.ok) expect(revocada.error.code).toBe('CONFLICT');
  });

  it('no se emite dos veces la misma constancia', async () => {
    const eventId = await eventoConConstancia();
    const efe = await persona('Efe');
    const registrationId = await inscribir(eventId, efe);
    await registerAttendance(organiza, { registrationId, attended: true });
    const primera = await issueConstancy(organiza, { registrationId });
    expect(primera.ok).toBe(true);
    const segunda = await issueConstancy(organiza, { registrationId });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');
  });

  it('quien no puede emitir constancias no las emite', async () => {
    const eventId = await eventoConConstancia();
    const ge = await persona('Ge');
    const registrationId = await inscribir(eventId, ge);
    await registerAttendance(organiza, { registrationId, attended: true });
    const emitida = await issueConstancy(ge, { registrationId });
    expect(emitida.ok).toBe(false);
    if (!emitida.ok) expect(emitida.error.code).toBe('FORBIDDEN');
  });
});

describe('materiales reservados a inscritos', () => {
  it('un material reservado no se sirve a quien no está inscrito, y sí a quien sí', async () => {
    const eventId = await eventoConConstancia();
    const material = await addEventMaterial(organiza, {
      eventId,
      title: 'Lectura del curso',
      membersOnly: true,
      originalFileName: 'lectura.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    expect(material.ok).toBe(true);
    if (!material.ok) return;
    const fila = await base.prisma.eventMaterial.findUniqueOrThrow({ where: { id: material.data.materialId }, select: { fileObjectId: true } });

    const fuera = await persona('Fuera');
    const negado = await authorizeDownload(fuera, fila.fileObjectId);
    expect(negado.ok).toBe(false);
    if (!negado.ok) expect(negado.error.code).toBe('NOT_FOUND');

    const dentro = await persona('Dentro');
    await inscribir(eventId, dentro);
    const permitido = await authorizeDownload(dentro, fila.fileObjectId);
    expect(permitido.ok).toBe(true);

    // Quien gestiona el evento también lo alcanza, sin inscribirse.
    const gestor = await authorizeDownload(organiza, fila.fileObjectId);
    expect(gestor.ok).toBe(true);
  });

  it('un material abierto se sirve a cualquiera; el listado de la vista oculta lo reservado a quien no está inscrito', async () => {
    const eventId = await eventoConConstancia();
    await addEventMaterial(organiza, { eventId, title: 'Guía abierta', membersOnly: false, originalFileName: 'guia.pdf', mimeType: 'application/pdf', content: PDF });
    await addEventMaterial(organiza, { eventId, title: 'Anexo reservado', membersOnly: true, originalFileName: 'anexo.pdf', mimeType: 'application/pdf', content: PDF });

    const fuera = await persona('Ajena');
    const vistaFuera = await eventMaterialsForViewer(fuera, eventId);
    expect(vistaFuera.ok && vistaFuera.data.length).toBe(1);
    expect(vistaFuera.ok && vistaFuera.data.every((m) => !m.membersOnly)).toBe(true);

    const dentro = await persona('Inscrita');
    await inscribir(eventId, dentro);
    const vistaDentro = await eventMaterialsForViewer(dentro, eventId);
    expect(vistaDentro.ok && vistaDentro.data.length).toBe(2);
  });
});
