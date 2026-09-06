import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import {
  acceptReferral,
  addParticipant,
  attachDocument,
  caseDetail,
  closeReferral,
  openCase,
  proposeReferral,
  requestReferralConsent,
  returnReferral,
  sendMessage,
  sendReferral,
} from '@/modules/cases';

/**
 * Canalización entre entidades, con los seis requisitos del PRD §10.4
 * (F6-CAS-010).
 *
 * Los seis, comprobados ejecutando:
 *
 *  1. **Explicación previa**: se escribe al proponer y consta que se le enseñó
 *     antes de pedirle el sí.
 *  2. **Consentimiento específico**: tiene que nombrar esta canalización y
 *     cubrir exactamente lo que se listó. Uno general no sirve.
 *  3. **Selección explícita**: solo viaja lo elegido, de una lista cerrada que
 *     no incluye las notas reservadas.
 *  4. **Aceptación del área receptora**: la acepta quien recibe, no quien envía.
 *  5. **Seguimiento sin exponer lo reservado**: se ve el estado, no lo de dentro.
 *  6. **Cierre o devolución con motivo**: nada se descarta en silencio.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let atiende: PersonaDePrueba;
let recibeEnAlianza: PersonaDePrueba;
let laPersona: PersonaDePrueba;
let otraPersona: PersonaDePrueba;
let recibeSoloEnNayarit: PersonaDePrueba;
let jalisco: { id: string };
let versionDeConsentimiento: string;

const CONTEXTO = { correlationId: 'prueba-canalizacion', ipHash: 'huella-de-canalizacion' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y necesito además acompañamiento para mi hija.';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);

const EXPLICACION =
  'Vamos a pasarle tu caso al área de acompañamiento social. Les contaremos lo que nos dijiste, de qué trata y cómo localizarte. No les pasamos las notas internas del equipo.';

beforeAll(async () => {
  base = await createTestDatabase('canalizacion');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  recibeEnAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Recibe' });
  laPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Pidió Ayuda' });
  otraPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Otra', familyName: 'Cualquiera' });

  await nombrar(base.prisma, {
    userId: atiende.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: recibeEnAlianza.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });
  await nombrar(base.prisma, {
    userId: laPersona.userId,
    roleCode: 'UNION_MEMBER',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });

  // Quien responde por el área receptora, pero solo en otro territorio.
  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true },
  });
  jalisco = unidades[0]!;
  const nayarit = unidades[1]!;

  recibeSoloEnNayarit = await crearPersonaConCuenta(base.prisma, { givenName: 'Recibe', familyName: 'En Nayarit' });
  await nombrar(base.prisma, {
    userId: recibeSoloEnNayarit.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
    territorialUnitIds: [nayarit.id],
    includesDescendants: true,
  });

  await base.prisma.consentVersion.updateMany({
    where: { code: PUBLIC_INTAKE_NOTICE_CODE },
    data: { status: 'PUBLISHED' },
  });

  // Cualquier texto publicado sirve como soporte del consentimiento: lo que la
  // prueba comprueba es el alcance, no la redacción.
  versionDeConsentimiento = (
    await base.prisma.consentVersion.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
      select: { id: true },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
    'referral_shared_file',
    'referral',
    'case_event',
    'case_document',
    'case_message',
    'case_task',
    'case_assignment',
    'case_participant',
    'case_file',
    'support_request',
  ]) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
  await base.sql.query(`DELETE FROM "consent"`);
});

/** Abre un expediente sindical con la persona identificada como solicitante. */
async function abrir(territorialUnitId: string | null = null): Promise<{ caseId: string; publicId: string }> {
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
    territorialUnitId,
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

  const participa = await addParticipant(await contextoDe(base.prisma, atiende), {
    caseId: abierto.data.caseId,
    personId: laPersona.personId,
    role: 'APPLICANT',
    reason: 'Es quien escribió pidiendo ayuda, ya identificada en el padrón.',
  });
  if (!participa.ok) throw new Error(participa.error.message);

  return { caseId: abierto.data.caseId, publicId: abierto.data.publicId };
}

/** Propone una canalización a la asociación civil. */
async function proponer(
  caseId: string,
  campos: readonly string[] = ['folio', 'resumen', 'contacto'],
  archivos: readonly string[] = [],
): Promise<string> {
  const propuesta = await proposeReferral(await contextoDe(base.prisma, atiende), {
    caseId,
    toModule: 'SOCIAL_ATTENTION',
    toLegalEntityId: alianzaId,
    reason: 'El asunto laboral sigue aquí, y el acompañamiento de la familia le toca a la asociación civil.',
    explanationShownToPerson: EXPLICACION,
    sharedFields: campos as never,
    sharedFileIds: [...archivos],
  });
  if (!propuesta.ok) throw new Error(propuesta.error.message);
  return propuesta.data.referralId;
}

/** Registra el sí de la persona sobre una canalización concreta. */
async function consentir(
  referralId: string,
  opciones: { personId?: string; fields?: readonly string[]; files?: readonly string[]; purpose?: 'INTER_ENTITY_REFERRAL' | 'MEMBERSHIP' } = {},
): Promise<string> {
  const consentimiento = await base.prisma.consent.create({
    data: {
      personId: opciones.personId ?? laPersona.personId,
      consentVersionId: versionDeConsentimiento,
      purpose: opciones.purpose ?? 'INTER_ENTITY_REFERRAL',
      scope: {
        referralId,
        fields: [...(opciones.fields ?? ['folio', 'resumen', 'contacto'])],
        files: [...(opciones.files ?? [])],
      },
      grantedById: opciones.personId ?? laPersona.personId,
      evidence: { medio: 'SCREEN', texto: EXPLICACION },
    },
    select: { id: true },
  });
  return consentimiento.id;
}

describe('1 y 2 · explicación antes del sí, y un sí que nombra esta canalización', () => {
  it('la explicación se guarda al proponer y consta que se le enseñó antes de pedirle nada', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId);

    const propuesta = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true, explanationShownToPerson: true, consentId: true },
    });
    expect(propuesta.status).toBe('PROPOSED');
    expect(propuesta.explanationShownToPerson).toBe(EXPLICACION);
    expect(propuesta.consentId).toBeNull();

    const pedido = await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });
    expect(pedido.ok, pedido.ok ? '' : pedido.error.message).toBe(true);
    if (pedido.ok) expect(pedido.data.explicacion).toBe(EXPLICACION);

    const despues = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true },
    });
    expect(despues.status).toBe('AWAITING_CONSENT');
  });

  it('sin pedirle el consentimiento no se envía, aunque exista uno', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId);
    const consentId = await consentir(referralId);

    const intento = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('explicarle a la persona');
  });

  it('un consentimiento que no nombra esta canalización no la ampara', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });

    // El sí se dio para otra canalización: es genérico respecto de esta.
    const otroConsentimiento = await consentir('00000000-0000-4000-8000-000000000000');

    const intento = await sendReferral(await contextoDe(base.prisma, atiende), {
      referralId,
      consentId: otroConsentimiento,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no nombra esta canalización');
  });

  it('un consentimiento de otro propósito tampoco', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });
    const consentId = await consentir(referralId, { purpose: 'MEMBERSHIP' });

    const intento = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('genérico');
  });

  it('el sí de otra persona no vale, y uno revocado tampoco', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });

    const ajeno = await consentir(referralId, { personId: otraPersona.personId });
    const conAjeno = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId: ajeno });
    expect(conAjeno.ok).toBe(false);
    if (!conAjeno.ok) expect(conAjeno.error.message).toContain('no es de la persona');

    const propio = await consentir(referralId);
    await base.prisma.consent.update({
      where: { id: propio },
      data: { revokedAt: new Date(), revokeReason: 'Lo pensó mejor y retiró el consentimiento.' },
    });
    const conRevocado = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId: propio });
    expect(conRevocado.ok).toBe(false);
    if (!conRevocado.ok) expect(conRevocado.error.message).toContain('vigente');
  });
});

describe('3 · solo viaja lo que se eligió, y las notas no están entre lo elegible', () => {
  it('un consentimiento que cubre menos de lo que se transfiere no la ampara', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId, ['folio', 'resumen', 'contacto']);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });

    const parcial = await consentir(referralId, { fields: ['folio'] });
    const intento = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId: parcial });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no coincide');
  });

  it('uno que cubre de más tampoco: serviría para transferencias que no se han visto', async () => {
    const { caseId } = await abrir();
    const referralId = await proponer(caseId, ['folio']);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });

    const amplio = await consentir(referralId, { fields: ['folio', 'resumen', 'valoracion'] });
    const intento = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId: amplio });
    expect(intento.ok).toBe(false);
  });

  it('una nota reservada no se puede ni elegir para transferir', async () => {
    const { caseId } = await abrir();

    const reservada = await sendMessage(await contextoDe(base.prisma, atiende), {
      caseId,
      audience: 'SUPERVISION_ONLY',
      body: 'Hay una duda sobre cómo se llevó la primera entrevista. Lo reviso con la coordinación.',
    });
    expect(reservada.ok).toBe(true);

    // No es que se escondan al enviar: no están en la lista blanca.
    const intento = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'Intento de transferir también lo reservado del expediente.',
      explanationShownToPerson: EXPLICACION,
      sharedFields: ['folio', 'notas_reservadas'] as never,
      sharedFileIds: [],
    });
    expect(intento.ok).toBe(false);
  });

  it('un archivo de otro expediente no viaja adjunto a esta canalización', async () => {
    const primero = await abrir();
    const segundo = await abrir();

    const ajeno = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId: segundo.caseId,
      kind: 'EVIDENCE',
      description: 'Documento que pertenece a otro expediente',
      originalFileName: 'ajeno.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      classification: 'RESTRICTED',
    });
    expect(ajeno.ok, ajeno.ok ? '' : ajeno.error.message).toBe(true);
    if (!ajeno.ok) return;

    const fila = await base.prisma.caseDocument.findUniqueOrThrow({
      where: { id: ajeno.data.documentId },
      select: { fileObjectId: true },
    });

    const intento = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId: primero.caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'Intento de adjuntar el documento de un expediente distinto.',
      explanationShownToPerson: EXPLICACION,
      sharedFields: ['folio'],
      sharedFileIds: [fila.fileObjectId],
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no figura en este expediente');
  });

  it('cada archivo que viaja lleva su propio consentimiento', async () => {
    const { caseId } = await abrir();

    const documento = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId,
      kind: 'EVIDENCE',
      description: 'Aviso de baja que entregó la empresa',
      originalFileName: 'baja.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      classification: 'RESTRICTED',
    });
    expect(documento.ok, documento.ok ? '' : documento.error.message).toBe(true);
    if (!documento.ok) return;
    const fila = await base.prisma.caseDocument.findUniqueOrThrow({
      where: { id: documento.data.documentId },
      select: { fileObjectId: true },
    });

    const referralId = await proponer(caseId, ['folio', 'resumen', 'contacto'], [fila.fileObjectId]);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });
    const consentId = await consentir(referralId, { files: [fila.fileObjectId] });

    const enviada = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId });
    expect(enviada.ok, enviada.ok ? '' : enviada.error.message).toBe(true);

    const compartidos = await base.prisma.referralSharedFile.findMany({
      where: { referralId },
      select: { fileObjectId: true, consentId: true },
    });
    expect(compartidos).toHaveLength(1);
    expect(compartidos[0]?.consentId).toBe(consentId);
  });
});

describe('4 y 6 · la acepta quien recibe, y nada se descarta en silencio', () => {
  /** Deja una canalización enviada y lista para que la reciba la otra entidad. */
  async function enviada(caseId: string): Promise<string> {
    const referralId = await proponer(caseId);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });
    const consentId = await consentir(referralId);
    const envio = await sendReferral(await contextoDe(base.prisma, atiende), { referralId, consentId });
    if (!envio.ok) throw new Error(envio.error.message);
    return referralId;
  }

  it('quien la envió no puede aceptarse su propia canalización', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);

    const intento = await acceptReferral(await contextoDe(base.prisma, atiende), {
      referralId,
      note: 'Intento de aceptarme a mí misma la canalización que acabo de enviar.',
    });
    expect(intento.ok).toBe(false);

    const fila = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true },
    });
    expect(fila.status).toBe('SENT');
  });

  it('el asunto sigue ocurriendo donde ocurría: no la acepta quien no alcanza ese territorio', async () => {
    const { caseId } = await abrir(jalisco.id);
    const referralId = await enviada(caseId);

    // Tiene la facultad, está en la entidad receptora y le corresponde el
    // compartimento. Lo único que le falta es alcanzar el territorio del
    // expediente, y eso basta para no poder hacerse cargo.
    const intento = await acceptReferral(await contextoDe(base.prisma, recibeSoloEnNayarit), {
      referralId,
      note: 'Intento de tomar un asunto que ocurre fuera del alcance de mi nombramiento.',
    });
    expect(intento.ok).toBe(false);

    // Y quien sí lo alcanza —sin acotación territorial— la acepta sin más.
    const aceptada = await acceptReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      note: 'El acompañamiento de la familia es de esta área y hay capacidad para tomarlo.',
    });
    expect(aceptada.ok, aceptada.ok ? '' : aceptada.error.message).toBe(true);
  });

  it('la acepta el área receptora, y consta quién y cuándo', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);

    const aceptada = await acceptReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      note: 'El acompañamiento de la familia es de esta área y hay capacidad para tomarlo.',
    });
    expect(aceptada.ok, aceptada.ok ? '' : aceptada.error.message).toBe(true);

    const fila = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true, acceptedById: true, acceptedAt: true },
    });
    expect(fila.status).toBe('ACCEPTED');
    expect(fila.acceptedById).toBe(recibeEnAlianza.userId);
    expect(fila.acceptedAt).not.toBeNull();
  });

  it('rechazarla exige motivo, y queda escrito', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);

    const rechazada = await returnReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      reason: 'El asunto es laboral de principio a fin: no hay nada que acompañar desde el área social.',
    });
    expect(rechazada.ok, rechazada.ok ? '' : rechazada.error.message).toBe(true);
    if (rechazada.ok) expect(rechazada.data.status).toBe('REJECTED');

    const fila = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true, returnReason: true },
    });
    expect(fila.status).toBe('REJECTED');
    expect(fila.returnReason).toContain('laboral de principio a fin');
  });

  it('devolverla después de aceptarla también exige motivo, y se distingue del rechazo', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);
    await acceptReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      note: 'Se toma para valorar qué acompañamiento hace falta.',
    });

    const devuelta = await returnReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      reason: 'Al hablar con la persona resultó que lo que necesita ya lo está recibiendo por otra vía.',
    });
    expect(devuelta.ok, devuelta.ok ? '' : devuelta.error.message).toBe(true);
    if (devuelta.ok) expect(devuelta.data.status).toBe('RETURNED');
  });

  it('la base no admite una devolución sin motivo, aunque el código lo intente', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);

    await expect(
      base.prisma.referral.update({ where: { id: referralId }, data: { status: 'REJECTED' } }),
    ).rejects.toThrow(/canalizacion_devuelta_con_motivo/);
  });

  it('cerrarla es del área que la envió, y solo tras aceptarla', async () => {
    const { caseId } = await abrir();
    const referralId = await enviada(caseId);

    const prematuro = await closeReferral(await contextoDe(base.prisma, atiende), { referralId });
    expect(prematuro.ok).toBe(false);

    await acceptReferral(await contextoDe(base.prisma, recibeEnAlianza), {
      referralId,
      note: 'Se toma el acompañamiento de la familia desde esta área.',
    });
    const cerrada = await closeReferral(await contextoDe(base.prisma, atiende), { referralId });
    expect(cerrada.ok, cerrada.ok ? '' : cerrada.error.message).toBe(true);

    const fila = await base.prisma.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true, closedAt: true },
    });
    expect(fila.status).toBe('CLOSED');
    expect(fila.closedAt).not.toBeNull();
  });
});

describe('5 · el seguimiento enseña el estado, no lo de dentro', () => {
  it('quien lleva el expediente ve en qué va cada canalización', async () => {
    const { caseId, publicId } = await abrir();
    const referralId = await proponer(caseId);
    await requestReferralConsent(await contextoDe(base.prisma, atiende), { referralId });

    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(detalle.ok, detalle.ok ? '' : detalle.error.message).toBe(true);
    if (!detalle.ok) return;

    expect(detalle.data.canalizaciones).toHaveLength(1);
    expect(detalle.data.canalizaciones[0]?.estado).toBe('AWAITING_CONSENT');
    expect(detalle.data.canalizaciones[0]?.camposCompartidos).toContain('resumen');
  });

  it('sin persona identificada no hay a quién pedirle el consentimiento, y no se canaliza', async () => {
    // Un expediente abierto por la entrada pública anónima: nadie del padrón
    // figura en él todavía.
    const enviado = await submitRequest(
      {
        requestType: 'INDIVIDUAL_LABOR_DISPUTE',
        contactName: 'Quien Escribe',
        contactEmail: 'anonima@ejemplo.mx',
        preferredChannel: 'EMAIL',
        subject: 'Necesito ayuda',
        narrative: RELATO,
        acceptedPrivacyNotice: true,
      },
      CONTEXTO,
    );
    expect(enviado.ok).toBe(true);
    if (!enviado.ok) return;
    const solicitud = await base.prisma.supportRequest.findFirstOrThrow({
      where: { folio: enviado.data.folio },
      select: { id: true },
    });
    await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'ROUTINE',
      note: 'Entra por la vía ordinaria de asesoría laboral.',
    });
    const abierto = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      reason: 'Se abre el expediente aunque todavía no se identifique a la persona.',
    });
    expect(abierto.ok, abierto.ok ? '' : abierto.error.message).toBe(true);
    if (!abierto.ok) return;

    const intento = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'Intento de canalizar un expediente sin nadie a quien preguntarle.',
      explanationShownToPerson: EXPLICACION,
      sharedFields: ['folio', 'resumen'],
      sharedFileIds: [],
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('consentimiento');
  });
});
