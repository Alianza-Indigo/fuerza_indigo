import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar } from './helpers/fixtures';
import type { ActorContext } from '@/platform/kernel/actor-context';
import {
  draftNotificationTemplate,
  notificationTemplateList,
  publishNotificationTemplate,
  retireNotificationTemplate,
} from '@/modules/notifications';

/**
 * Plantillas versionadas de aviso (PRD §16.2, §24 Fase 9 criterio 2; bloque C).
 *
 * Se prueba contra la base real y con los permisos que la semilla reparte: que
 * redactar y publicar sean permisos distintos, que una versión publicada no se
 * edite —se publica otra—, que publicar retire la anterior, y que publicar
 * compruebe que las variables usadas y las declaradas coincidan.
 */

let base: TestDatabase;
let prensa: ActorContext; // COMMUNICATIONS: redacta, no publica
let secretaria: ActorContext; // EXECUTIVE_SECRETARY: publica, no redacta
let cualquiera: ActorContext; // sin facultades de comunicación

function unico(prefijo: string): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

beforeAll(async () => {
  base = await createTestDatabase('plantillas_aviso');
  await base.seed();
  const entidadId = await entidadPrincipal(base.prisma);
  const granter = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien' });

  const pPrensa = await crearPersonaConCuenta(base.prisma, { givenName: 'Prensa' });
  await nombrar(base.prisma, { userId: pPrensa.userId, roleCode: 'COMMUNICATIONS', grantedById: granter.userId, legalEntityId: entidadId });
  prensa = await contextoDe(base.prisma, pPrensa);

  const pSecre = await crearPersonaConCuenta(base.prisma, { givenName: 'Secre' });
  await nombrar(base.prisma, { userId: pSecre.userId, roleCode: 'EXECUTIVE_SECRETARY', grantedById: granter.userId, legalEntityId: entidadId });
  secretaria = await contextoDe(base.prisma, pSecre);

  const pOtra = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra' });
  cualquiera = await contextoDe(base.prisma, pOtra);
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

async function borrador(actor: ActorContext, overrides: Record<string, unknown> = {}) {
  return draftNotificationTemplate(actor, {
    code: unico('EVENTO'),
    channel: 'EMAIL',
    category: 'EVENT',
    locale: 'es-MX',
    subject: 'Te esperamos, {{givenName}}',
    bodyTemplate: 'Hola {{givenName}}, el taller es el {{fecha}}.',
    variables: ['givenName', 'fecha'],
    ...overrides,
  });
}

describe('redactar y publicar son permisos distintos', () => {
  it('quien no es de comunicación no redacta', async () => {
    const r = await borrador(cualquiera);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
  });

  it('Prensa redacta pero no publica', async () => {
    const r = await borrador(prensa);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const publicar = await publishNotificationTemplate(prensa, {
      templateId: r.data.templateId,
      reason: 'intento de publicar sin ser la revisión',
    });
    expect(publicar.ok).toBe(false);
    if (!publicar.ok) expect(publicar.error.code).toBe('FORBIDDEN');
  });
});

describe('una versión publicada no se edita: se publica otra', () => {
  it('el consecutivo sube por código, y publicar retira la anterior', async () => {
    const code = unico('CONSECUTIVO');
    const v1 = await borrador(prensa, { code });
    const v2 = await borrador(prensa, { code });
    expect(v1.ok && v1.data.version).toBe(1);
    expect(v2.ok && v2.data.version).toBe(2);
    if (!v1.ok || !v2.ok) return;

    const pub1 = await publishNotificationTemplate(secretaria, { templateId: v1.data.templateId, reason: 'publicar la primera versión del aviso' });
    expect(pub1.ok && pub1.data.retiredVersion).toBe(null);

    const pub2 = await publishNotificationTemplate(secretaria, { templateId: v2.data.templateId, reason: 'publicar la segunda versión del aviso' });
    expect(pub2.ok && pub2.data.retiredVersion).toBe(1);

    // No conviven dos publicadas del mismo código.
    const publicadas = await base.prisma.notificationTemplate.count({ where: { code, channel: 'EMAIL', locale: 'es-MX', status: 'PUBLISHED' } });
    expect(publicadas).toBe(1);
  });

  it('no se publica dos veces la misma versión', async () => {
    const r = await borrador(prensa);
    if (!r.ok) throw new Error('no se redactó');
    await publishNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'publicar el aviso de prueba' });
    const otra = await publishNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'publicar otra vez la misma versión' });
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.error.code).toBe('CONFLICT');
  });
});

describe('publicar comprueba que las variables coincidan', () => {
  it('una variable usada y no declarada impide publicar', async () => {
    const r = await borrador(prensa, { bodyTemplate: 'Hola {{givenName}}, tu folio es {{folio}}.', variables: ['givenName'] });
    if (!r.ok) throw new Error('no se redactó');
    const pub = await publishNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'publicar con una variable sin declarar' });
    expect(pub.ok).toBe(false);
    if (!pub.ok) expect(pub.error.code).toBe('VALIDATION');
  });

  it('una variable declarada y no usada impide publicar', async () => {
    const r = await borrador(prensa, { subject: 'Aviso', bodyTemplate: 'Hola {{givenName}}.', variables: ['givenName', 'fecha'] });
    if (!r.ok) throw new Error('no se redactó');
    const pub = await publishNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'publicar con una variable de más' });
    expect(pub.ok).toBe(false);
    if (!pub.ok) expect(pub.error.code).toBe('VALIDATION');
  });
});

describe('publicar y retirar exigen motivo, y quedan en la lista', () => {
  it('la lista incluye lo que Prensa redacta', async () => {
    const code = unico('LISTADA');
    await borrador(prensa, { code });
    const lista = await notificationTemplateList(prensa);
    expect(lista.ok && lista.data.some((p) => p.code === code)).toBe(true);
  });

  it('retirar una publicada exige motivo y la deja retirada', async () => {
    const r = await borrador(prensa);
    if (!r.ok) throw new Error('no se redactó');
    await publishNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'publicar antes de retirar' });
    const retiro = await retireNotificationTemplate(secretaria, { templateId: r.data.templateId, reason: 'retirar el aviso porque ya no aplica' });
    expect(retiro.ok).toBe(true);
    const fila = await base.prisma.notificationTemplate.findUnique({ where: { id: r.data.templateId }, select: { status: true } });
    expect(fila?.status).toBe('RETIRED');
  });
});
