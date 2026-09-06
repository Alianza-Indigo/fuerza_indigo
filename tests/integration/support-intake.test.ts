import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  confirmRouting,
  INTAKE_RATE_LIMIT,
  PUBLIC_INTAKE_NOTICE_CODE,
  requestDetail,
  requestList,
  resolveRequest,
  submitRequest,
} from '@/modules/support';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';

/**
 * Entrada pública: contacto y solicitud inicial (PRD §10.1, Fase 2).
 *
 * Lo que se comprueba aquí no es que el formulario guarde una fila —eso lo hace
 * cualquier cosa—, sino las cuatro promesas que hace la pantalla a quien
 * escribe: que no se recaban datos sin aviso de privacidad publicado, que el
 * relato original no se puede alterar ni con acceso a la base, que solo lo lee
 * la entidad a la que se dirigió, y que consta quién lo leyó.
 */

let base: TestDatabase;
let atiende: PersonaDePrueba;
let ajenaAlaEntidad: PersonaDePrueba;
let comunicacion: PersonaDePrueba;
let sinFacultades: PersonaDePrueba;
let fuerzaId: string;
let alianzaId: string;

const MENSAJE = 'Me despidieron por pedir un ajuste razonable y no sé qué hacer. Llevo tres años en la empresa.';

function envio(overrides: Record<string, unknown> = {}) {
  return {
    requestType: 'INDIVIDUAL_LABOR_DISPUTE' as const,
    legalEntity: 'FUERZA_INDIGO' as const,
    contactName: 'Quien Escribe',
    contactEmail: 'quien.escribe@ejemplo.mx',
    preferredChannel: 'EMAIL' as const,
    subject: 'Me despidieron tras pedir un ajuste',
    narrative: MENSAJE,
    acceptedPrivacyNotice: true as const,
    ...overrides,
  };
}

const CONTEXTO = { correlationId: 'prueba-entrada', ipHash: 'huella-de-origen-1' };

/** Publica el aviso de privacidad de una entidad, que es acto de la organización. */
async function publicarAviso(legalEntityId: string): Promise<void> {
  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE, legalEntityId },
    data: { status: 'PUBLISHED' },
  });
}

beforeAll(async () => {
  base = await createTestDatabase('support');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaría', familyName: 'De Fuerza' });
  ajenaAlaEntidad = await crearPersonaConCuenta(base.prisma, { givenName: 'Secretaría', familyName: 'De Alianza' });
  comunicacion = await crearPersonaConCuenta(base.prisma, { givenName: 'De', familyName: 'Comunicación' });
  sinFacultades = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Facultades' });

  await nombrar(base.prisma, {
    userId: atiende.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: ajenaAlaEntidad.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
  // Comunicación administra contenidos, no solicitudes de apoyo. Que no alcance
  // la bandeja es la contratación de `docs/PERMISSIONS.md` §4, no un descuido:
  // un conflicto laboral que alguien contó no es material editorial.
  await nombrar(base.prisma, {
    userId: comunicacion.userId,
    roleCode: 'COMMUNICATIONS',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
}, 180_000);

afterAll(async () => {
  await base.destroy();
});

beforeEach(async () => {
  await base.prisma.supportRequest.deleteMany({});
  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'DRAFT' },
  });
});

describe('sin aviso de privacidad publicado', () => {
  it('no recaba ningún dato', async () => {
    const resultado = await submitRequest(envio(), CONTEXTO);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('RULE_VIOLATION');
    expect(await base.prisma.supportRequest.count()).toBe(0);
  });

  it('el aviso llega en borrador desde la semilla, no publicado', async () => {
    const avisos = await base.prisma.consentVersion.findMany({
      where: { code: PUBLIC_INTAKE_NOTICE_CODE },
      select: { status: true, legalEntityId: true },
    });

    expect(avisos).toHaveLength(2);
    expect(avisos.every((aviso) => aviso.status === 'DRAFT')).toBe(true);
  });
});

describe('con aviso publicado', () => {
  beforeEach(async () => {
    await publicarAviso(fuerzaId);
    await publicarAviso(alianzaId);
  });

  it('guarda el mensaje, devuelve folio y encola el acuse', async () => {
    const resultado = await submitRequest(envio(), CONTEXTO);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const guardado = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: resultado.data.folio },
      select: { narrative: true, status: true, privacyNoticeVersionId: true, originFingerprint: true, contactEmail: true },
    });

    expect(guardado.narrative).toBe(MENSAJE);
    expect(guardado.status).toBe('RECEIVED');
    expect(guardado.privacyNoticeVersionId).not.toBe('');
    // La huella no es la entrada: no se puede volver de una a otra.
    expect(guardado.originFingerprint).not.toBe(CONTEXTO.ipHash);

    const acuse = await base.prisma.backgroundJob.findFirstOrThrow({
      where: { jobType: 'support-request-acknowledge', businessKey: resultado.data.folio },
      select: { payload: true },
    });
    expect(JSON.stringify(acuse.payload)).toContain(guardado.contactEmail ?? '');
  });

  it('el folio no es correlativo: dos envíos seguidos no dejan adivinar el volumen', async () => {
    const primero = await submitRequest(envio(), CONTEXTO);
    const segundo = await submitRequest(envio({ subject: 'Otro asunto distinto' }), CONTEXTO);

    expect(primero.ok && segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;
    expect(primero.data.folio).not.toBe(segundo.data.folio);
  });

  it('exige un medio de contacto coherente con el que se pidió', async () => {
    const sinCorreo = await submitRequest(
      envio({ contactEmail: '', contactPhone: '', preferredChannel: 'EMAIL' }),
      CONTEXTO,
    );
    expect(sinCorreo.ok).toBe(false);

    const pideTelefonoSinDarlo = await submitRequest(envio({ preferredChannel: 'PHONE', contactPhone: '' }), CONTEXTO);
    expect(pideTelefonoSinDarlo.ok).toBe(false);
    if (!pideTelefonoSinDarlo.ok) {
      expect(pideTelefonoSinDarlo.error.details?.['contactPhone']).toBeDefined();
    }
  });

  it('no acepta sin haber aceptado el aviso', async () => {
    const resultado = await submitRequest(envio({ acceptedPrivacyNotice: false }), CONTEXTO);
    expect(resultado.ok).toBe(false);
    expect(await base.prisma.supportRequest.count()).toBe(0);
  });

  it('corta el envío en serie desde un mismo origen', async () => {
    for (let i = 0; i < INTAKE_RATE_LIMIT.maxSubmissions; i += 1) {
      const permitido = await submitRequest(envio({ subject: `Asunto número ${i + 1}` }), CONTEXTO);
      expect(permitido.ok).toBe(true);
    }

    const cortado = await submitRequest(envio({ subject: 'Uno de más' }), CONTEXTO);
    expect(cortado.ok).toBe(false);
    if (!cortado.ok) expect(cortado.error.code).toBe('RATE_LIMITED');

    // Otro origen no paga el cupo del primero.
    const otroOrigen = await submitRequest(envio(), { ...CONTEXTO, ipHash: 'huella-de-origen-2' });
    expect(otroOrigen.ok).toBe(true);
  });

  it('el relato original no se puede alterar ni desde la aplicación', async () => {
    const enviado = await submitRequest(envio(), CONTEXTO);
    expect(enviado.ok).toBe(true);
    if (!enviado.ok) return;

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });

    await expect(
      base.prisma.supportRequest.update({
        where: { id: fila.id },
        data: { narrative: 'texto sustituido' },
      }),
    ).rejects.toThrow(/permission denied|permiso/i);

    const despues = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: fila.id },
      select: { narrative: true },
    });
    expect(despues.narrative).toBe(MENSAJE);
  });
});

describe('bandeja', () => {
  beforeEach(async () => {
    await publicarAviso(fuerzaId);
    await publicarAviso(alianzaId);
  });

  it('un mensaje dirigido a una entidad no se lee desde la otra', async () => {
    const enviado = await submitRequest(envio({ legalEntity: 'FUERZA_INDIGO' }), CONTEXTO);
    expect(enviado.ok).toBe(true);
    if (!enviado.ok) return;

    const propia = await requestList(await contextoDe(base.prisma, atiende));
    expect(propia.ok).toBe(true);
    if (propia.ok) expect(propia.data.map((fila) => fila.folio)).toContain(enviado.data.folio);

    const ajena = await requestList(await contextoDe(base.prisma, ajenaAlaEntidad));
    expect(ajena.ok).toBe(true);
    if (ajena.ok) expect(ajena.data.map((fila) => fila.folio)).not.toContain(enviado.data.folio);
  });

  it('abrirlo desde otra entidad responde igual que si no existiera', async () => {
    const enviado = await submitRequest(envio(), CONTEXTO);
    expect(enviado.ok).toBe(true);
    if (!enviado.ok) return;

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });

    const resultado = await requestDetail(await contextoDe(base.prisma, ajenaAlaEntidad), fila.id);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('NOT_FOUND');
  });

  it('sin facultades no se ve nada', async () => {
    const resultado = await requestList(await contextoDe(base.prisma, sinFacultades));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('el rol de contenidos no alcanza la bandeja de solicitudes', async () => {
    const resultado = await requestList(await contextoDe(base.prisma, comunicacion));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });

  it('abrir un mensaje queda registrado en la bitácora', async () => {
    const enviado = await submitRequest(envio(), CONTEXTO);
    if (!enviado.ok) throw new Error('el envío debía funcionar');

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });

    const antes = await base.prisma.auditEvent.count({ where: { action: 'support.request.read' } });
    const abierto = await requestDetail(await contextoDe(base.prisma, atiende), fila.id);
    expect(abierto.ok).toBe(true);

    const despues = await base.prisma.auditEvent.count({ where: { action: 'support.request.read' } });
    expect(despues).toBe(antes + 1);
  });

  it('atender exige nota y deja constancia; quien llega segunda se entera', async () => {
    const enviado = await submitRequest(envio(), CONTEXTO);
    if (!enviado.ok) throw new Error('el envío debía funcionar');

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });
    const actor = await contextoDe(base.prisma, atiende);

    const sinNota = await resolveRequest(actor, { requestId: fila.id, decision: 'ATENDER', note: '' });
    expect(sinNota.ok).toBe(false);

    const primera = await resolveRequest(actor, {
      requestId: fila.id,
      decision: 'ATENDER',
      note: 'Le llamé, quedamos en vernos el jueves con la delegación.',
    });
    expect(primera.ok).toBe(true);

    const segunda = await resolveRequest(actor, {
      requestId: fila.id,
      decision: 'ATENDER',
      note: 'Yo también lo atendí.',
    });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.code).toBe('CONFLICT');

    const auditadas = await base.prisma.auditEvent.count({ where: { action: 'support.request.handled' } });
    expect(auditadas).toBe(1);
  });

  it('sin facultad de hacerse cargo no se puede cerrar', async () => {
    const enviado = await submitRequest(envio(), CONTEXTO);
    if (!enviado.ok) throw new Error('el envío debía funcionar');

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });

    const resultado = await resolveRequest(await contextoDe(base.prisma, sinFacultades), {
      requestId: fila.id,
      decision: 'ATENDER',
      note: 'Me lo llevo yo.',
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe('FORBIDDEN');
  });
});

/**
 * Clasificación informativa, propuesta y confirmación humana (Fase 6).
 *
 * El criterio del PRD §24 es doble: que la persona pueda pedir apoyo **sin
 * saber qué área le corresponde**, y que la propuesta automática **no sustituya
 * la confirmación humana**. Las dos cosas se comprueban ejecutando, y la
 * segunda mirando lo que quedó en la base: mientras nadie confirma, no hay
 * confirmación escrita en ningún sitio.
 */
describe('la persona pide apoyo sin saber a qué área le toca', () => {
  beforeEach(async () => {
    await publicarAviso(fuerzaId);
    await publicarAviso(alianzaId);
  });

  it('sin decir a quién le escribe, el mensaje llega igual y con propuesta', async () => {
    const { legalEntity: _sinDecirlo, ...sinEntidad } = envio({
      requestType: 'EDUCATION_ACCESS',
      subject: 'A mi hija le niegan el apoyo en la escuela',
      narrative:
        'A mi hija le niegan los apoyos que necesita en la escuela y no sé a quién acudir. Llevamos dos meses así.',
    });

    const enviado = await submitRequest(sinEntidad, CONTEXTO);
    expect(enviado.ok, enviado.ok ? '' : enviado.error.message).toBe(true);
    if (!enviado.ok) return;

    const fila = await base.prisma.supportRequest.findFirstOrThrow({
      where: { folio: enviado.data.folio },
      select: {
        legalEntityId: true,
        suggestedRouting: true,
        confirmedRoutingLegalEntityId: true,
        confirmedById: true,
        confirmedAt: true,
        status: true,
        urgency: true,
      },
    });

    // Entró a la bandeja de la asociación civil, que es de quien es la materia.
    expect(fila.legalEntityId).toBe(alianzaId);

    // Se lee la fila en crudo a propósito: lo que importa es qué quedó
    // guardado, no cómo lo presenta después un caso de uso.
    const propuesta = fila.suggestedRouting as Record<string, unknown>;
    expect(propuesta['entidad']).toBe('ALIANZA_INDIGO');
    expect(String(propuesta['motivo']).length).toBeGreaterThan(40);

    // Y la propuesta **no decidió nada más**: ni confirmó, ni valoró la
    // prioridad, ni movió el estado.
    expect(fila.confirmedRoutingLegalEntityId).toBeNull();
    expect(fila.confirmedById).toBeNull();
    expect(fila.confirmedAt).toBeNull();
    expect(fila.status).toBe('RECEIVED');
    expect(fila.urgency).toBe('ROUTINE');
  });

  it('si sí lo dice, ahí queda, aunque la materia fuera de la otra', async () => {
    const enviado = await submitRequest(
      envio({ requestType: 'EDUCATION_ACCESS', legalEntity: 'FUERZA_INDIGO' }),
      CONTEXTO,
    );
    expect(enviado.ok, enviado.ok ? '' : enviado.error.message).toBe(true);
    if (!enviado.ok) return;

    const fila = await base.prisma.supportRequest.findFirstOrThrow({
      where: { folio: enviado.data.folio },
      select: { legalEntityId: true, suggestedRouting: true },
    });
    expect(fila.legalEntityId).toBe(fuerzaId);
    // La alternativa deja dicho que por materia habría ido a la otra.
    const propuesta = fila.suggestedRouting as Record<string, unknown>;
    expect(propuesta['alternativa']).toBe('ALIANZA_INDIGO');
  });
});

describe('la propuesta no sustituye la confirmación humana', () => {
  beforeEach(async () => {
    await publicarAviso(fuerzaId);
    await publicarAviso(alianzaId);
  });

  async function recibirSolicitud(): Promise<string> {
    const enviado = await submitRequest(envio(), CONTEXTO);
    if (!enviado.ok) throw new Error(enviado.error.message);
    const fila = await base.prisma.supportRequest.findFirstOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });
    return fila.id;
  }

  it('quien no tiene facultades no confirma nada', async () => {
    const requestId = await recibirSolicitud();
    const resultado = await confirmRouting(await contextoDe(base.prisma, sinFacultades), {
      requestId,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      note: 'Intento de confirmar sin facultades para comprobar que no se admite.',
    });
    expect(resultado.ok).toBe(false);

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { confirmedById: true, status: true },
    });
    expect(fila.confirmedById).toBeNull();
    expect(fila.status).toBe('RECEIVED');
  });

  it('confirmar deja quién, cuándo y con qué prioridad, y un asiento en la bitácora', async () => {
    const requestId = await recibirSolicitud();
    const resultado = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral de la sección.',
    });
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data.coincideConLaPropuesta).toBe(true);

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        status: true,
        urgency: true,
        confirmedRoutingLegalEntityId: true,
        confirmedById: true,
        confirmedAt: true,
      },
    });
    expect(fila.status).toBe('TRIAGE');
    expect(fila.urgency).toBe('PRIORITY');
    expect(fila.confirmedRoutingLegalEntityId).toBe(fuerzaId);
    expect(fila.confirmedById).toBe(atiende.userId);
    expect(fila.confirmedAt).not.toBeNull();

    const asiento = await base.prisma.auditEvent.findFirst({
      where: { objectKind: 'SupportRequest', objectId: requestId, action: 'support.routing.confirmed' },
      select: { metadata: true },
    });
    expect(asiento).not.toBeNull();
  });

  it('quien confirma puede apartarse de la propuesta, y queda escrito que lo hizo', async () => {
    // Confirmar no es decir que sí: si solo se pudiera aceptar, no sería una
    // confirmación sino un trámite.
    const requestId = await recibirSolicitud();
    const resultado = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId,
      legalEntity: 'ALIANZA_INDIGO',
      urgency: 'ROUTINE',
      note: 'Al leerlo, lo que pide es acompañamiento social y no defensa laboral. Va a la asociación civil.',
    });
    expect(resultado.ok, resultado.ok ? '' : resultado.error.message).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data.coincideConLaPropuesta).toBe(false);

    const asiento = await base.prisma.auditEvent.findFirstOrThrow({
      where: { objectKind: 'SupportRequest', objectId: requestId, action: 'support.routing.confirmed' },
      select: { metadata: true },
    });
    const metadatos = asiento.metadata as Record<string, unknown>;
    // Si esto ocurre a menudo, la tabla de clasificación está mal y hay que
    // corregirla. Un asiento que solo dijera «confirmado» no lo diría.
    expect(metadatos['seApartoDeLaPropuesta']).toBe(true);
  });

  it('no se confirma dos veces', async () => {
    const requestId = await recibirSolicitud();
    const primera = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      note: 'Primera confirmación, la que vale.',
    });
    expect(primera.ok, primera.ok ? '' : primera.error.message).toBe(true);

    const segunda = await confirmRouting(await contextoDe(base.prisma, ajenaAlaEntidad), {
      requestId,
      legalEntity: 'ALIANZA_INDIGO',
      urgency: 'ROUTINE',
      note: 'Segunda confirmación, que no debe admitirse.',
    });
    expect(segunda.ok).toBe(false);
  });

  it('sin motivo escrito no se confirma', async () => {
    const requestId = await recibirSolicitud();
    const resultado = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      note: 'ok',
    });
    expect(resultado.ok).toBe(false);
  });
});
