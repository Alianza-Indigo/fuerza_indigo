import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import {
  contextoDe,
  crearMembresia,
  crearPersonaConCuenta,
  entidadPrincipal,
  nombrar,
} from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import {
  draftNotificationTemplate,
  publishNotificationTemplate,
  sendCampaign,
  setNotificationPreferences,
} from '@/modules/notifications';
import { runJob } from '@/platform/jobs/handlers';
import { setMailerForTests } from '@/platform/mail/mailer';

/**
 * Campañas operativas autorizadas (PRD §16.2, §24 Fase 9 criterio 1; bloque C·2).
 *
 * Se prueba contra la base real: que una campaña no envíe un aviso obligatorio,
 * que respete la preferencia de cada persona —a quien silenció esa clase por
 * correo le queda un intento `SUPPRESSED`, no un envío—, y que el envío encolado
 * registre su entrega cuando el trabajo corre.
 */

let base: TestDatabase;
let entidadId: string;
let prensa: ActorContext; // COMMUNICATIONS: envía campañas
let secretaria: ActorContext; // publica plantillas

const enviados: string[] = [];

beforeAll(async () => {
  base = await createTestDatabase('campanas');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);
  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien' });

  const pPrensa = await crearPersonaConCuenta(base.prisma, { givenName: 'Prensa' });
  await nombrar(base.prisma, { userId: pPrensa.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: entidadId });
  prensa = await contextoDe(base.prisma, pPrensa);

  const pSecre = await crearPersonaConCuenta(base.prisma, { givenName: 'Secre' });
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  secretaria = await contextoDe(base.prisma, pSecre);

  // Un adaptador de correo que solo anota a quién se le envió, sin salir.
  setMailerForTests({
    name: 'prueba',
    capability: 'DELIVERS',
    capabilityDetail: 'adaptador de prueba',
    send: ({ to }) => {
      enviados.push(to);
      return Promise.resolve({ providerMessageId: `msg-${enviados.length}` });
    },
  });
});

afterAll(async () => {
  setMailerForTests(null);
  await base.destroy();
});

async function plantillaPublicada(category: 'EVENT' | 'GOVERNANCE_MANDATORY'): Promise<string> {
  const code = `CAMPANA_${category}_${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const borrador = await draftNotificationTemplate(prensa, {
    code,
    channel: 'EMAIL',
    category,
    locale: 'es-MX',
    subject: 'Hola {{givenName}}',
    bodyTemplate: 'Hola {{givenName}}, te escribimos de la organización.',
    variables: ['givenName'],
  });
  if (!borrador.ok) throw new Error('no se redactó la plantilla');
  const pub = await publishNotificationTemplate(secretaria, { templateId: borrador.data.templateId, reason: 'publicar la plantilla para la prueba de campaña' });
  if (!pub.ok) throw new Error('no se publicó la plantilla');
  return code;
}

async function miembroActivo(nombre: string) {
  const persona = await crearPersonaConCuenta(base.prisma, { givenName: nombre });
  await crearMembresia(base.prisma, { personId: persona.personId, legalEntityId: entidadId, typeCode: 'AGREMIADO', status: 'ACTIVE' });
  return persona;
}

describe('una campaña respeta lo obligatorio y las preferencias', () => {
  it('no envía una plantilla de clase obligatoria', async () => {
    const code = await plantillaPublicada('GOVERNANCE_MANDATORY');
    const r = await sendCampaign(prensa, { templateCode: code, legalEntityId: entidadId, reason: 'intentar enviar un aviso obligatorio como campaña' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('RULE_VIOLATION');
  });

  it('a quien silenció la clase por correo no se le envía: queda SUPPRESSED', async () => {
    const code = await plantillaPublicada('EVENT');
    const ana = await miembroActivo('Ana');
    const beto = await miembroActivo('Beto');

    // Beto silencia los eventos por correo.
    const betoCtx = await contextoDe(base.prisma, beto);
    await setNotificationPreferences(betoCtx, { channel: 'EMAIL', entries: [{ category: 'EVENT', suppressed: true }] });

    const r = await sendCampaign(prensa, { templateCode: code, legalEntityId: entidadId, reason: 'enviar la campaña de eventos a la entidad' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.audience).toBeGreaterThanOrEqual(2);
    expect(r.data.suppressed).toBe(1);
    expect(r.data.queued).toBe(r.data.audience - 1);

    // Beto tiene una notificación con un intento SUPPRESSED y sin trabajo de correo.
    const notiBeto = await base.prisma.notification.findFirst({ where: { personId: beto.personId }, select: { id: true, channels: true } });
    expect(notiBeto).not.toBeNull();
    const intentoBeto = await base.prisma.deliveryAttempt.findFirst({ where: { notificationId: notiBeto!.id }, select: { status: true } });
    expect(intentoBeto?.status).toBe('SUPPRESSED');

    // Ana sí tiene un trabajo de correo encolado.
    const notiAna = await base.prisma.notification.findFirst({ where: { personId: ana.personId }, select: { id: true } });
    const trabajoAna = await base.prisma.backgroundJob.findFirst({ where: { jobType: 'notification-email', businessKey: `campaign:${notiAna!.id}` }, select: { id: true, payload: true, correlationId: true } });
    expect(trabajoAna).not.toBeNull();
  });
});

describe('el envío encolado registra su entrega cuando corre', () => {
  it('el trabajo de correo entrega y deja un intento SENT', async () => {
    const code = await plantillaPublicada('EVENT');
    const ce = await miembroActivo('Cecilia');
    await sendCampaign(prensa, { templateCode: code, legalEntityId: entidadId, reason: 'enviar para probar la entrega del trabajo' });

    const noti = await base.prisma.notification.findFirst({ where: { personId: ce.personId }, select: { id: true } });
    const trabajo = await base.prisma.backgroundJob.findFirstOrThrow({
      where: { jobType: 'notification-email', businessKey: `campaign:${noti!.id}` },
      select: { id: true, jobType: true, businessKey: true, payload: true, attempts: true, maxAttempts: true, correlationId: true },
    });

    const antes = enviados.length;
    await runJob({
      id: trabajo.id,
      jobType: trabajo.jobType,
      businessKey: trabajo.businessKey,
      payload: trabajo.payload as Record<string, unknown>,
      attempts: trabajo.attempts,
      maxAttempts: trabajo.maxAttempts,
      correlationId: trabajo.correlationId,
    });
    expect(enviados.length).toBe(antes + 1);

    const intento = await base.prisma.deliveryAttempt.findFirst({ where: { notificationId: noti!.id, channel: 'EMAIL' }, select: { status: true } });
    expect(intento?.status).toBe('SENT');
  });
});
