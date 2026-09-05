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
import { personalAgenda } from '@/modules/membership';
import {
  grantConsent,
  personConsents,
  publishConsentVersion,
  publishedConsentTexts,
  revokeConsent,
} from '@/platform/consent';
import type { ActorContext } from '@/platform/kernel/actor-context';

/**
 * Panel personal y consentimientos propios (PRD §5.5, §6.2, §7.3; F4-UI-001).
 *
 * Dos promesas:
 *
 * 1. **El panel abre con decisiones accionables, no con métricas.** Cada fila
 *    que devuelve la agenda es algo que se puede hacer, con dónde hacerlo.
 * 2. **Cada quien decide sobre lo suyo, y solo sobre lo suyo.** La pantalla que
 *    a `D-F4-009` le faltaba existe, y leer los consentimientos de otra persona
 *    no es leer los propios (`D-F4-019`).
 */

let base: TestDatabase;
let entidadId: string;
let secretaria: ActorContext;
let secretariaPersona: PersonaDePrueba;
let versionId: string;

beforeAll(async () => {
  base = await createTestDatabase('panel');
  await base.seed();
  entidadId = await entidadPrincipal(base.prisma);

  secretariaPersona = await crearPersonaConCuenta(base.prisma, {
    givenName: 'Secretaria',
    familyName: 'Del Panel',
  });
  await nombrar(base.prisma, {
    userId: secretariaPersona.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  secretaria = await contextoDe(base.prisma, secretariaPersona);

  const version = await base.prisma.consentVersion.findFirstOrThrow({
    where: { code: 'PRIVACY_NOTICE_PUBLIC_INTAKE' },
    select: { id: true },
  });
  versionId = version.id;
  const publicada = await publishConsentVersion(secretaria, {
    consentVersionId: versionId,
    effectiveFrom: '2026-01-01',
  });
  if (!publicada.ok && publicada.error.code !== 'CONFLICT') throw publicada.error;
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

let contador = 0;

async function agremiada(nombre: string, opciones: { expiresAt?: Date } = {}) {
  contador += 1;
  const persona = await crearPersonaConCuenta(base.prisma, {
    givenName: `${nombre}${contador}`,
    familyName: 'Del Panel',
  });
  await nombrar(base.prisma, {
    userId: persona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: secretariaPersona.userId,
    legalEntityId: entidadId,
  });
  const membresia = await crearMembresia(base.prisma, {
    personId: persona.personId,
    legalEntityId: entidadId,
    typeCode: 'AGREMIADO',
    ...(opciones.expiresAt === undefined
      ? {}
      : {
          expiresAt: opciones.expiresAt,
          startedAt: new Date(opciones.expiresAt.getTime() - 365 * 24 * 60 * 60 * 1000),
        }),
  });
  return { persona, suyo: await contextoDe(base.prisma, persona), membresia };
}

/* -------------------------------------------------------------------------- */

describe('cada quien decide sobre lo suyo (defecto D-F4-019)', () => {
  it('una agremiada no lee los consentimientos de otra persona', async () => {
    // Antes sí: `consent.read` la tenían tanto la Secretaría como cualquier
    // persona agremiada, y la consulta recibe el identificador por parámetro.
    // Bastaba con pedirlo para saber para qué autorizó otra persona el
    // tratamiento de sus datos, cuándo lo retiró y con qué texto.
    const titular = await agremiada('Titular');
    const otorgado = await grantConsent(secretaria, {
      personId: titular.persona.personId,
      purpose: 'MEMBERSHIP',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    if (!otorgado.ok) throw otorgado.error;

    const curiosa = await agremiada('Curiosa');
    const intento = await personConsents(curiosa.suyo, { personId: titular.persona.personId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.code).toBe('FORBIDDEN');
  });

  it('pero sí lee los propios', async () => {
    const persona = await agremiada('Propia');
    const otorgado = await grantConsent(persona.suyo, {
      personId: persona.persona.personId,
      purpose: 'MEMBERSHIP',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    if (!otorgado.ok) throw otorgado.error;

    const suyos = await personConsents(persona.suyo, { personId: persona.persona.personId });
    expect(suyos.ok, suyos.ok ? '' : JSON.stringify(suyos.error)).toBe(true);
    if (suyos.ok) expect(suyos.data).toHaveLength(1);
  });

  it('la Secretaría sí lee los de cualquiera: esa facultad no se tocó', async () => {
    const persona = await agremiada('Institucional');
    const otorgado = await grantConsent(secretaria, {
      personId: persona.persona.personId,
      purpose: 'MEMBERSHIP',
      consentVersionId: versionId,
      medium: 'SIGNED_PAPER',
    });
    if (!otorgado.ok) throw otorgado.error;

    const leidos = await personConsents(secretaria, { personId: persona.persona.personId });
    expect(leidos.ok, leidos.ok ? '' : JSON.stringify(leidos.error)).toBe(true);
    if (leidos.ok) expect(leidos.data.length).toBeGreaterThan(0);
  });
});

describe('la pantalla que a D-F4-009 le faltaba', () => {
  it('la persona ve los textos publicados con su contenido, y solo los publicados', async () => {
    const persona = await agremiada('Lee');
    const textos = await publishedConsentTexts(persona.suyo);
    expect(textos.ok, textos.ok ? '' : JSON.stringify(textos.error)).toBe(true);
    if (!textos.ok) return;

    expect(textos.data.length).toBeGreaterThan(0);
    // El texto entero, no un título con un enlace: lo que se acepta tiene que
    // poder leerse antes de aceptarlo.
    expect(textos.data[0]?.bodyMarkdown.length).toBeGreaterThan(20);

    // Un borrador no aparece: no se puede aceptar lo que no está publicado.
    const borradores = await base.prisma.consentVersion.count({ where: { status: 'DRAFT' } });
    expect(borradores).toBeGreaterThan(0);
    const ids = new Set(textos.data.map((uno) => uno.consentVersionId));
    const enBorrador = await base.prisma.consentVersion.findMany({
      where: { status: 'DRAFT' },
      select: { id: true },
    });
    for (const uno of enBorrador) expect(ids.has(uno.id)).toBe(false);
  });

  it('otorga sobre lo propio y lo retira, y lo retirado queda escrito', async () => {
    const persona = await agremiada('Decide');

    const otorgado = await grantConsent(persona.suyo, {
      personId: persona.persona.personId,
      purpose: 'MARKETING_COMMUNICATIONS',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    expect(otorgado.ok, otorgado.ok ? '' : JSON.stringify(otorgado.error)).toBe(true);
    if (!otorgado.ok) return;

    const retirado = await revokeConsent(persona.suyo, {
      consentId: otorgado.data.consentId,
      reason: 'Ya no quiero recibir comunicaciones que no son esenciales.',
    });
    expect(retirado.ok, retirado.ok ? '' : JSON.stringify(retirado.error)).toBe(true);

    const suyos = await personConsents(persona.suyo, { personId: persona.persona.personId });
    if (!suyos.ok) throw suyos.error;
    const fila = suyos.data.find((uno) => uno.purpose === 'MARKETING_COMMUNICATIONS');
    // Retirar no borra la evidencia: la fila sigue, con su fecha y su motivo.
    expect(fila).toBeDefined();
    expect(fila?.live).toBe(false);
    expect(fila?.revokeReason).toContain('comunicaciones');
  });
});

describe('el panel abre con decisiones, no con métricas (F4-UI-001)', () => {
  it('sin nada pendiente, la agenda viene vacía en vez de inventar tarjetas', async () => {
    const persona = await agremiada('Tranquila');
    // Con un consentimiento otorgado no queda ni el aviso de revisarlos.
    const otorgado = await grantConsent(persona.suyo, {
      personId: persona.persona.personId,
      purpose: 'MEMBERSHIP',
      consentVersionId: versionId,
      medium: 'SCREEN',
    });
    if (!otorgado.ok) throw otorgado.error;

    const agenda = await personalAgenda(persona.suyo);
    expect(agenda.ok, agenda.ok ? '' : JSON.stringify(agenda.error)).toBe(true);
    if (!agenda.ok) return;
    expect(agenda.data.pendientes).toEqual([]);
    // Pero sí sabe lo que la persona es.
    expect(agenda.data.calidades).toHaveLength(1);
  });

  it('cada pendiente lleva a donde se resuelve: ninguno es un dato suelto', async () => {
    const persona = await agremiada('Pendiente');
    const agenda = await personalAgenda(persona.suyo);
    if (!agenda.ok) throw agenda.error;

    expect(agenda.data.pendientes.length).toBeGreaterThan(0);
    for (const pendiente of agenda.data.pendientes) {
      expect(pendiente.accion.href, pendiente.titulo).toMatch(/^\//);
      expect(pendiente.accion.etiqueta.length, pendiente.titulo).toBeGreaterThan(2);
      // Y explica qué pasa si no se atiende. Un título solo es una métrica.
      expect(pendiente.detalle.length, pendiente.titulo).toBeGreaterThan(20);
    }
  });

  it('una membresía por vencer aparece, y una lejana no', async () => {
    const enDiezDias = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const pronto = await agremiada('Vence', { expiresAt: enDiezDias });
    const agendaPronto = await personalAgenda(pronto.suyo);
    if (!agendaPronto.ok) throw agendaPronto.error;
    expect(agendaPronto.data.pendientes.some((uno) => uno.id.startsWith('vigencia:'))).toBe(true);

    const enUnAno = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
    const lejos = await agremiada('Lejana', { expiresAt: enUnAno });
    const agendaLejos = await personalAgenda(lejos.suyo);
    if (!agendaLejos.ok) throw agendaLejos.error;
    // Avisar con diez meses de antelación es ruido, y el ruido enseña a no mirar.
    expect(agendaLejos.data.pendientes.some((uno) => uno.id.startsWith('vigencia:'))).toBe(false);
  });

  it('lo que tiene plazo va antes que lo que solo conviene revisar', async () => {
    // El orden lo decide el daño de no atenderlo, no la fecha ni el módulo.
    const persona = await agremiada('Ordena', {
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const agenda = await personalAgenda(persona.suyo);
    if (!agenda.ok) throw agenda.error;

    const urgencias = agenda.data.pendientes.map((uno) => uno.urgencia);
    const peso = { PLAZO: 0, BLOQUEA: 1, CADUCA: 2, REVISAR: 3 } as const;
    const pesos = urgencias.map((una) => peso[una]);
    expect([...pesos].sort((a, b) => a - b)).toEqual(pesos);
  });

  it('una membresía suspendida se anuncia arriba, con su motivo', async () => {
    // Enterarse por una etiqueta gris en una tarjeta de abajo no es enterarse.
    // El PRD §5.5 llama a esto «casos que requieren atención».
    const persona = await agremiada('Suspendida');
    const { suspendMembership } = await import('@/modules/membership');
    const suspendida = await suspendMembership(secretaria, {
      membershipId: persona.membresia.id,
      reason: 'Cuotas atrasadas de más de seis meses, notificadas por escrito en dos ocasiones.',
    });
    if (!suspendida.ok) throw suspendida.error;

    const agenda = await personalAgenda(persona.suyo);
    if (!agenda.ok) throw agenda.error;

    const aviso = agenda.data.pendientes.find((uno) => uno.id.startsWith('suspension:'));
    expect(aviso).toBeDefined();
    expect(aviso?.titulo).toContain('suspendida');
    // Con el motivo que se registró, no con una frase genérica.
    expect(aviso?.detalle).toContain('Cuotas atrasadas');
    // Y diciendo lo que una suspensión es: una pausa, no una baja.
    expect(aviso?.detalle).toContain('no una baja');
  });

  it('quien no tiene persona asociada recibe una agenda vacía, no un error', async () => {
    // El actor del sistema y el Superadmin raíz entran por aquí. Un panel que
    // reventara con ellos sería un panel que nadie puede abrir para depurar.
    const sinPersona = { ...secretaria, personId: null };
    const agenda = await personalAgenda(sinPersona);
    expect(agenda.ok).toBe(true);
    if (agenda.ok) expect(agenda.data.pendientes).toEqual([]);
  });
});
