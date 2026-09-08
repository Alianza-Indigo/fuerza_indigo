import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  actorDeMigracion,
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
  type PersonaDePrueba,
} from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import { withReason } from '@/platform/kernel/actor-context';
import { newPublicId } from '@/platform/kernel/ids';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';
import { UMBRAL_DE_PRIVACIDAD } from '@/platform/privacy/threshold';
import { setMailerForTests } from '@/platform/mail/mailer';
import {
  draftNotificationTemplate,
  publishNotificationTemplate,
  sendCampaign,
  setNotificationPreferences,
} from '@/modules/notifications';
import { draftTemplate, publishTemplate } from '@/modules/documents';
import {
  createEvent,
  issueConstancy,
  openEventRegistration,
  publishEvent,
  registerAttendance,
  registerForEvent,
  revokeConstancy,
  verifyConstancy,
} from '@/modules/events';
import { panelDeGestion, territorialIndicators, transparenciaPublica } from '@/modules/dashboards';
import { exportRoster } from '@/modules/membership';
import { PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';

/**
 * Los seis criterios del PRD §24 Fase 9, comprobados **ejecutando el sistema** y
 * mirando después lo que quedó en la base con las credenciales de la aplicación,
 * nunca leyendo el código.
 *
 *  1. Comunicaciones obligatorias y promocionales se gestionan separadamente.
 *  2. Las plantillas están versionadas.
 *  3. Los indicadores sensibles usan agregación y umbrales de privacidad.
 *  4. Las exportaciones respetan permisos y quedan auditadas.
 *  5. Las constancias son verificables y revocables.
 *  6. Los paneles muestran decisiones accionables, no métricas decorativas.
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext; // EXECUTIVE_SECRETARY: eventos, constancias, publica plantillas, tablero, indicadores, exporta
let prensa: ActorContext; // COMMUNICATIONS: redacta plantillas y envía campañas

const enviados: string[] = [];

let contador = 0;
function unico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}-${Math.random().toString(36).slice(2, 6)}`;
}

beforeAll(async () => {
  base = await createTestDatabase('fase9-criterios');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  const pSecre = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Secretaria' });
  const pPrensa = await crearPersonaConCuenta(base.prisma, { givenName: 'La', familyName: 'Prensa' });
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  await nombrar(base.prisma, { userId: pPrensa.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: entidadId });
  secretaria = await contextoDe(base.prisma, pSecre);
  prensa = await contextoDe(base.prisma, pPrensa);

  // La campaña necesita un canal de correo: se captura sin salida real.
  setMailerForTests({
    name: 'prueba',
    capability: 'DELIVERS',
    capabilityDetail: 'adaptador de prueba',
    send: ({ to }) => {
      enviados.push(to);
      return Promise.resolve({ providerMessageId: `msg-${enviados.length}` });
    },
  });

  // La constancia de evento necesita una plantilla de documento publicada.
  const plantilla = await draftTemplate(secretaria, {
    code: 'CONSTANCIA_EVENTO',
    name: 'Constancia de participación',
    kind: 'ATTENDANCE_CONSTANCY',
    legalEntityId: entidadId,
    bodyTemplate: '<p>Se hace constar que {{participante}} participó en {{evento}}, del {{inicia}} al {{concluye}}.</p>',
    variables: ['participante', 'evento', 'inicia', 'concluye'],
    numberingSeries: 'CONST',
  });
  if (!plantilla.ok) throw new Error(plantilla.error.message);
  const publicada = await publishTemplate(secretaria, { templateId: plantilla.data.templateId });
  if (!publicada.ok) throw new Error(publicada.error.message);

  await base.prisma.consentVersion.updateMany({ where: { code: PUBLIC_INTAKE_NOTICE_CODE }, data: { status: 'PUBLISHED' } });
}, 180_000);

afterAll(async () => {
  setMailerForTests(null);
  await base?.destroy();
});

/** Redacta y publica una plantilla de aviso por correo de la categoría dada; devuelve su código. */
async function plantillaPublicada(category: 'EVENT' | 'GOVERNANCE_MANDATORY'): Promise<string> {
  const code = unico('AVISO').toUpperCase().replace(/-/g, '_');
  const borrador = await draftNotificationTemplate(prensa, {
    code,
    channel: 'EMAIL',
    category,
    locale: 'es-MX',
    subject: 'Un aviso para {{givenName}}',
    bodyTemplate: 'Hola {{givenName}}, esto es un aviso.',
    variables: ['givenName'],
  });
  if (!borrador.ok) throw new Error(borrador.error.message);
  const pub = await publishNotificationTemplate(secretaria, { templateId: borrador.data.templateId, reason: 'publicar el aviso para la prueba de criterios' });
  if (!pub.ok) throw new Error(pub.error.message);
  return code;
}

/** Una persona agremiada de la entidad, para poblar la audiencia de una campaña. */
async function agremiada(nombre: string): Promise<PersonaDePrueba> {
  const p = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  await crearMembresia(base.prisma, { personId: p.personId, legalEntityId: entidadId, typeCode: 'AGREMIADO', status: 'ACTIVE' });
  return p;
}

/* -------------------------------------------------------------------------- */

describe('Criterio 1 · lo obligatorio y lo promocional se gestionan por separado (F9)', () => {
  it('una campaña no puede enviar un aviso obligatorio de gobierno, y sí uno promocional', async () => {
    // Lo obligatorio no viaja como difusión: la campaña lo rechaza.
    const obligatorio = await plantillaPublicada('GOVERNANCE_MANDATORY');
    const rechazada = await sendCampaign(prensa, { templateCode: obligatorio, legalEntityId: entidadId, reason: 'intentar enviar un aviso obligatorio como campaña' });
    expect(rechazada.ok).toBe(false);
    if (!rechazada.ok) expect(rechazada.error.code).toBe('RULE_VIOLATION');

    // Lo promocional sí, y respeta a quien lo silenció.
    const promocional = await plantillaPublicada('EVENT');
    const quiere = await agremiada('Quiere');
    const noQuiere = await agremiada('NoQuiere');
    const noQuiereCtx = await contextoDe(base.prisma, noQuiere);
    await setNotificationPreferences(noQuiereCtx, { channel: 'EMAIL', entries: [{ category: 'EVENT', suppressed: true }] });

    const enviada = await sendCampaign(prensa, { templateCode: promocional, legalEntityId: entidadId, reason: 'enviar la campaña de eventos a la entidad' });
    expect(enviada.ok).toBe(true);
    if (!enviada.ok) return;
    // Quien silenció esa categoría queda suprimido; quien no, en cola.
    expect(enviada.data.suppressed).toBeGreaterThanOrEqual(1);
    expect(enviada.data.queued).toBe(enviada.data.audience - enviada.data.suppressed);
    void quiere;
  });

  it('una clase obligatoria de gobierno no se puede silenciar', async () => {
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Silenciadora' });
    const ctx = await contextoDe(base.prisma, p);
    const intento = await setNotificationPreferences(ctx, { channel: 'EMAIL', entries: [{ category: 'GOVERNANCE_MANDATORY', suppressed: true }] });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('RULE_VIOLATION');
  });
});

describe('Criterio 2 · las plantillas están versionadas', () => {
  it('dos borradores del mismo código son versiones 1 y 2; publicar la segunda retira la primera', async () => {
    const code = unico('PLANTILLA').toUpperCase().replace(/-/g, '_');
    const datos = { channel: 'EMAIL' as const, category: 'EVENT' as const, locale: 'es-MX', subject: 'Hola {{n}}', bodyTemplate: 'Cuerpo {{n}}.', variables: ['n'] };

    const v1 = await draftNotificationTemplate(prensa, { code, ...datos });
    const v2 = await draftNotificationTemplate(prensa, { code, ...datos });
    expect(v1.ok && v1.data.version).toBe(1);
    expect(v2.ok && v2.data.version).toBe(2);
    if (!v1.ok || !v2.ok) return;

    const pub1 = await publishNotificationTemplate(secretaria, { templateId: v1.data.templateId, reason: 'publicar la primera versión del aviso' });
    expect(pub1.ok && pub1.data.retiredVersion).toBe(null);
    const pub2 = await publishNotificationTemplate(secretaria, { templateId: v2.data.templateId, reason: 'publicar la segunda versión del aviso' });
    expect(pub2.ok && pub2.data.retiredVersion).toBe(1);

    // Nunca hay dos publicadas a la vez del mismo (código, canal, idioma).
    const publicadas = await base.prisma.notificationTemplate.count({ where: { code, channel: 'EMAIL', locale: 'es-MX', status: 'PUBLISHED' } });
    expect(publicadas).toBe(1);
  });
});

describe('Criterio 3 · los indicadores sensibles usan agregación y umbrales de privacidad', () => {
  async function eventoConAsistentes(unitId: string, n: number): Promise<void> {
    const inicio = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const creado = await createEvent(secretaria, {
      title: unico('Taller'),
      kind: 'WORKSHOP',
      legalEntityId: entidadId,
      territorialUnitId: unitId,
      startsAt: inicio.toISOString(),
      endsAt: new Date(inicio.getTime() + 3600 * 1000).toISOString(),
      modality: 'IN_PERSON',
      visibility: 'MEMBERS',
    });
    if (!creado.ok) throw new Error(creado.error.message);
    await publishEvent(secretaria, { eventId: creado.data.eventId });
    await openEventRegistration(secretaria, { eventId: creado.data.eventId });
    for (let i = 0; i < n; i += 1) {
      const p = await crearPersonaConCuenta(base.prisma, { givenName: `Asiste${i}` });
      const ctx = await contextoDe(base.prisma, p);
      const r = await registerForEvent(ctx, { eventId: creado.data.eventId });
      if (!r.ok) throw new Error('no se inscribió');
      const reg = await base.prisma.eventRegistration.findFirstOrThrow({ where: { eventId: creado.data.eventId, personId: p.personId }, select: { id: true } });
      await registerAttendance(secretaria, { registrationId: reg.id, attended: true });
    }
  }

  async function crearUnidad(): Promise<{ publicId: string; id: string }> {
    const autor = await actorDeMigracion(base.prisma);
    const publicId = newPublicId();
    const u = await base.prisma.territorialUnit.create({
      data: {
        publicId,
        code: unico('SECC').toUpperCase(),
        name: unico('Sección'),
        type: 'SECTION',
        path: `/mx/${unico('u')}`,
        depth: 1,
        countryCode: 'MX',
        createdOn: new Date(),
        createdByActorId: autor,
        updatedByActorId: autor,
      },
      select: { id: true },
    });
    return { publicId, id: u.id };
  }

  function rango() {
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 365 * 24 * 3600 * 1000);
    const f = (d: Date): string => d.toISOString().slice(0, 10);
    return { desde: f(desde), hasta: f(hoy) };
  }

  it('LA GARANTÍA: una cuenta de personas por debajo del umbral se suprime; al alcanzarlo, se publica; el número de eventos se publica siempre', async () => {
    const baja = await crearUnidad();
    await eventoConAsistentes(baja.id, UMBRAL_DE_PRIVACIDAD - 2);
    const indBaja = await territorialIndicators(secretaria, { unitPublicId: baja.publicId, ...rango() });
    expect(indBaja.ok).toBe(true);
    if (!indBaja.ok) return;
    expect(indBaja.data.asistentes.publicable).toBe(false);
    expect(indBaja.data.celdasSuprimidas).toBeGreaterThanOrEqual(1);
    expect(indBaja.data.eventosRealizados).toBe(1); // el número de eventos no señala a nadie

    const alta = await crearUnidad();
    await eventoConAsistentes(alta.id, UMBRAL_DE_PRIVACIDAD);
    const indAlta = await territorialIndicators(secretaria, { unitPublicId: alta.publicId, ...rango() });
    expect(indAlta.ok).toBe(true);
    if (!indAlta.ok) return;
    expect(indAlta.data.asistentes.publicable).toBe(true);
    if (indAlta.data.asistentes.publicable) expect(indAlta.data.asistentes.valor).toBe(UMBRAL_DE_PRIVACIDAD);
  });

  it('quien no puede leer indicadores territoriales no los ve', async () => {
    const u = await crearUnidad();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'SinCargo' });
    const ctx = await contextoDe(base.prisma, p);
    const ind = await territorialIndicators(ctx, { unitPublicId: u.publicId, ...rango() });
    expect(ind.ok).toBe(false);
    if (!ind.ok) expect(ind.error.code).toBe('FORBIDDEN');
  });

  it('la transparencia pública publica hechos institucionales en crudo y suprime las cuentas de personas bajo el umbral', async () => {
    const t = await transparenciaPublica();
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    // Un hecho institucional —agremiados activos— se publica en crudo: es un número.
    expect(typeof t.data.agremiadosActivos).toBe('number');
    // La cuenta de participación de personas pasa por el umbral (bandera de publicable).
    expect(typeof t.data.personasFormadas.publicable).toBe('boolean');
    if (t.data.personasFormadas.publicable) expect(t.data.personasFormadas.valor).toBeGreaterThanOrEqual(UMBRAL_DE_PRIVACIDAD);
  });
});

describe('Criterio 4 · las exportaciones respetan permisos y quedan auditadas', () => {
  it('sin el permiso no se exporta; con él, la exportación queda registrada en la bitácora', async () => {
    // Sin permiso: no se exporta.
    const ajena = await crearPersonaConCuenta(base.prisma, { givenName: 'Ajena' });
    const ajenaCtx = await contextoDe(base.prisma, ajena);
    const negada = await exportRoster(ajenaCtx, { roster: 'UNION', reason: 'quiero ver el padrón sin tener la facultad de exportarlo' });
    expect(negada.ok).toBe(false);
    if (!negada.ok) expect(negada.error.code).toBe('FORBIDDEN');

    // Con permiso: exporta y deja asiento en la bitácora.
    const antes = await base.prisma.auditEvent.count({ where: { action: AUDIT_ACTIONS.ROSTER_EXPORTED } });
    const exportada = await exportRoster(secretaria, { roster: 'UNION', reason: 'exportar el padrón sindical para la prueba de criterios' });
    expect(exportada.ok, exportada.ok ? '' : exportada.error.message).toBe(true);
    if (!exportada.ok) return;
    expect(exportada.data.fileName.length).toBeGreaterThan(0);

    const despues = await base.prisma.auditEvent.count({ where: { action: AUDIT_ACTIONS.ROSTER_EXPORTED } });
    expect(despues).toBe(antes + 1);
    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.ROSTER_EXPORTED, objectKind: 'Membership', objectId: 'UNION' },
      orderBy: { occurredAt: 'desc' },
      select: { actorId: true, outcome: true, reason: true },
    });
    expect(asiento.outcome).toBe('SUCCESS');
    expect(asiento.actorId).toBe(secretaria.actorId);
    expect(asiento.reason).toContain('padrón sindical');
  });
});

describe('Criterio 5 · las constancias son verificables y revocables', () => {
  async function eventoConConstancia(): Promise<string> {
    const plantilla = await base.prisma.documentTemplate.findFirstOrThrow({ where: { code: 'CONSTANCIA_EVENTO', status: 'PUBLISHED' }, select: { id: true } });
    const inicio = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const creado = await createEvent(secretaria, {
      title: unico('Curso'),
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
    await publishEvent(secretaria, { eventId: creado.data.eventId });
    await openEventRegistration(secretaria, { eventId: creado.data.eventId });
    return creado.data.eventId;
  }

  it('LA GARANTÍA: se emite a quien asistió y verifica como válida; revocada, verifica como revocada, nunca como válida', async () => {
    const eventId = await eventoConConstancia();
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'Participa' });
    const ctx = await contextoDe(base.prisma, p);
    const r = await registerForEvent(ctx, { eventId });
    if (!r.ok) throw new Error('no se inscribió');
    const reg = await base.prisma.eventRegistration.findFirstOrThrow({ where: { eventId, personId: p.personId }, select: { id: true } });
    await registerAttendance(secretaria, { registrationId: reg.id, attended: true, evaluationScore: 88 });

    const emitida = await issueConstancy(secretaria, { registrationId: reg.id });
    expect(emitida.ok).toBe(true);
    if (!emitida.ok) return;

    const valida = await verifyConstancy(emitida.data.publicId);
    expect(valida.ok && valida.data.revoked).toBe(false);
    expect(valida.ok && valida.data.participantName).toContain('Participa');

    const revocada = await revokeConstancy(withReason(secretaria, 'Se emitió con datos equivocados.'), { registrationId: reg.id });
    expect(revocada.ok).toBe(true);

    const trasRevocar = await verifyConstancy(emitida.data.publicId);
    expect(trasRevocar.ok && trasRevocar.data.revoked).toBe(true);
    // El documento subyacente queda cancelado: una constancia revocada no es un documento vigente.
    const doc = await base.prisma.generatedDocument.findFirstOrThrow({ where: { publicId: emitida.data.publicId }, select: { status: true } });
    expect(doc.status).toBe('CANCELLED');
  });
});

describe('Criterio 6 · los paneles muestran decisiones accionables, no métricas decorativas', () => {
  it('cada tarea del tablero lleva una cuenta positiva y una acción con enlace; una cola vacía no aparece', async () => {
    // Se produce trabajo: un mensaje sin atender.
    const enviado = await submitRequest(
      {
        requestType: 'INDIVIDUAL_LABOR_DISPUTE',
        contactName: 'Quien Escribe',
        contactEmail: `escribe.${unico('c')}@ejemplo.mx`,
        preferredChannel: 'EMAIL',
        subject: 'Necesito orientación',
        narrative: 'Me despidieron tras pedir un ajuste razonable en el trabajo.',
        acceptedPrivacyNotice: true,
      },
      { correlationId: unico('tablero'), ipHash: unico('huella') },
    );
    if (!enviado.ok) throw new Error(enviado.error.message);

    const panel = await panelDeGestion(secretaria);
    expect(panel.ok).toBe(true);
    if (!panel.ok) return;

    // No hay métrica decorativa: cada tarea es una decisión —cuenta positiva y acción con enlace—.
    expect(panel.data.tareas.length).toBeGreaterThan(0);
    for (const tarea of panel.data.tareas) {
      expect(tarea.cantidad).toBeGreaterThan(0);
      expect(tarea.accion.href.length).toBeGreaterThan(0);
      expect(tarea.accion.etiqueta.length).toBeGreaterThan(0);
    }
    // El mensaje sin atender aparece como una de esas tareas.
    const mensajes = panel.data.tareas.find((t) => t.accion.href.includes('/gestion/mensajes'));
    expect(mensajes?.cantidad ?? 0).toBeGreaterThan(0);
  });

  it('quien no tiene facultad de gestión ve un tablero sin tareas', async () => {
    const p = await crearPersonaConCuenta(base.prisma, { givenName: 'SinGestion' });
    const ctx = await contextoDe(base.prisma, p);
    const panel = await panelDeGestion(ctx);
    expect(panel.ok).toBe(true);
    if (panel.ok) expect(panel.data.tareas.length).toBe(0);
  });
});
