import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest, requestDetail } from '@/modules/support';
import {
  addParticipant,
  attachDocument,
  caseDetail,
  openCase,
  proposeReferral,
  protocoloDeRiesgo,
  raiseEmergency,
  sendMessage,
} from '@/modules/cases';
import { RUTA_DEL_PROTOCOLO_DE_RIESGO, TIPOS_QUE_MUESTRAN_EL_PROTOCOLO } from '@/modules/cases/domain';
import { createPage, publishPage, reviewPage, submitForReview } from '@/modules/content';
import { authorizeDownload } from '@/platform/files';
import { AUDIT_ACTIONS } from '@/platform/audit/actions';

/**
 * Los seis criterios de la Fase 6 que el PRD §24 exige demostrar
 * (F6-QA-001 a F6-QA-006).
 *
 *  1. El usuario puede pedir apoyo sin saber qué área le corresponde.
 *  2. La propuesta automática de canalización no sustituye confirmación humana.
 *  3. No se comparten notas entre sindicato y A.C. sin consentimiento y
 *     necesidad.
 *  4. Toda lectura sensible queda auditada.
 *  5. El sistema prueba acceso denegado para territorios y expedientes ajenos.
 *  6. Los casos urgentes muestran rutas humanas y de emergencia configuradas.
 *
 * No se comprueban leyendo el código: se comprueban **ejecutándolo** y mirando
 * después lo que quedó en la base con las credenciales de la aplicación.
 */

let base: TestDatabase;
let fuerzaId: string;
let alianzaId: string;
let atiende: PersonaDePrueba;
let revisora: PersonaDePrueba;
let delegadaNayarit: PersonaDePrueba;
let atiendeEnAlianza: PersonaDePrueba;
let laPersona: PersonaDePrueba;
let jalisco: { id: string };
let nayarit: { id: string };

const RELATO =
  'No sé a quién le toca esto. Me despidieron tras pedir un ajuste, y además mi hija necesita acompañamiento en la escuela.';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);

let envios = 0;
function origen() {
  envios += 1;
  return { correlationId: `fase6-criterios-${envios}`, ipHash: `huella-fase6-${envios}` };
}

beforeAll(async () => {
  base = await createTestDatabase('fase6criterios');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const unidades = await base.prisma.territorialUnit.findMany({
    where: { depth: 1 },
    orderBy: { path: 'asc' },
    select: { id: true },
  });
  jalisco = unidades[0]!;
  nayarit = unidades[1]!;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  revisora = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Revisa' });
  delegadaNayarit = await crearPersonaConCuenta(base.prisma, { givenName: 'Delegada', familyName: 'De Nayarit' });
  laPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Pidió Ayuda' });

  for (const persona of [atiende, revisora]) {
    await nombrar(base.prisma, {
      userId: persona.userId,
      roleCode: 'EXECUTIVE_SECRETARY',
      grantedById: quienNombra.userId,
      legalEntityId: fuerzaId,
    });
  }
  await nombrar(base.prisma, {
    userId: delegadaNayarit.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
    territorialUnitIds: [nayarit.id],
    includesDescendants: true,
  });
  // Un mensaje de violencia o urgencia lo clasifica la entrada pública hacia
  // la asociación civil, que es la que acompaña: la marca de riesgo la levanta
  // quien está nombrada allí, no quien lo está en el sindicato.
  atiendeEnAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Atiende', familyName: 'En Alianza' });
  await nombrar(base.prisma, {
    userId: atiendeEnAlianza.userId,
    roleCode: 'SOCIAL_STAFF',
    grantedById: quienNombra.userId,
    legalEntityId: alianzaId,
  });

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

  // El protocolo de riesgo, administrado en el gestor de contenidos.
  const autora = await contextoDe(base.prisma, atiende);
  const quienRevisa = await contextoDe(base.prisma, revisora);
  const creada = await createPage(autora, {
    slug: RUTA_DEL_PROTOCOLO_DE_RIESGO,
    kind: 'PROTOCOL',
    title: 'Qué hacer ante un riesgo inmediato',
    summary: 'A dónde acudir si hay peligro ahora mismo, y qué hace la organización.',
    bodyMarkdown: 'Llama al 911. Guardia de acompañamiento de Fuerza Índigo: 33 0000 0000, todos los días.',
    legalEntityId: fuerzaId,
    accessLevel: 'PUBLIC',
  });
  if (!creada.ok) throw creada.error;
  await submitForReview(autora, creada.data.pageId);
  await reviewPage(quienRevisa, { pageId: creada.data.pageId, decision: 'APROBAR' });
  await publishPage(quienRevisa, { pageId: creada.data.pageId });
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
    'referral_shared_file',
    'referral',
    'emergency_flag',
    'case_document',
    'case_message',
    'case_event',
    'case_task',
    'case_assignment',
    'case_participant',
    'case_file',
    'support_request',
  ]) {
    await base.sql.query(`DELETE FROM "${tabla}"`);
  }
});

/** Envía un mensaje por la entrada pública, sin decir a qué área va. */
async function pedirApoyo(tipo: 'INDIVIDUAL_LABOR_DISPUTE' | 'VIOLENCE_OR_URGENCY' = 'INDIVIDUAL_LABOR_DISPUTE') {
  const enviado = await submitRequest(
    {
      requestType: tipo,
      contactName: 'Quien Escribe',
      contactEmail: 'quien.escribe@ejemplo.mx',
      preferredChannel: 'EMAIL',
      subject: 'No sé a quién le toca esto',
      narrative: RELATO,
      acceptedPrivacyNotice: true,
    },
    origen(),
  );
  if (!enviado.ok) throw new Error(enviado.error.message);
  const fila = await base.prisma.supportRequest.findFirstOrThrow({
    where: { folio: enviado.data.folio },
    select: { id: true, folio: true },
  });
  return fila;
}

describe('F6-QA-001 · se puede pedir apoyo sin saber qué área corresponde', () => {
  it('el formulario no pregunta el área, y el sistema propone una', async () => {
    const solicitud = await pedirApoyo();

    const fila = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: solicitud.id },
      select: { suggestedRouting: true, confirmedRoutingLegalEntityId: true, status: true },
    });

    // Hay propuesta, con su motivo: la persona no tuvo que acertar nada.
    const propuesta = fila.suggestedRouting as { entidad: string; motivo: string } | null;
    expect(propuesta).not.toBeNull();
    expect(propuesta?.motivo.length ?? 0).toBeGreaterThan(0);

    // Y la propuesta **no ejecutó nada**: sigue sin canalizar.
    expect(fila.confirmedRoutingLegalEntityId).toBeNull();
    expect(fila.status).toBe('RECEIVED');
  });
});

describe('F6-QA-002 · la propuesta no sustituye la confirmación humana', () => {
  it('sin confirmar no hay expediente, y confirmar es de una persona con nombre', async () => {
    const solicitud = await pedirApoyo();

    const sinConfirmar = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      reason: 'Intento de abrir un expediente sobre una propuesta que nadie confirmó.',
    });
    expect(sinConfirmar.ok).toBe(false);
    expect(await base.prisma.case.count()).toBe(0);

    const confirmada = await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: jalisco.id,
      note: 'Es un despido con plazo: lo lleva la asesoría laboral, y lo de la niña se canaliza aparte.',
    });
    expect(confirmada.ok, confirmada.ok ? '' : confirmada.error.message).toBe(true);

    const despues = await base.prisma.supportRequest.findUniqueOrThrow({
      where: { id: solicitud.id },
      select: { confirmedById: true, confirmedAt: true, status: true },
    });
    expect(despues.confirmedById).toBe(atiende.userId);
    expect(despues.confirmedAt).not.toBeNull();
    expect(despues.status).toBe('TRIAGE');
  });
});

describe('F6-QA-003 · no se comparten notas entre entidades sin consentimiento y necesidad', () => {
  it('una nota reservada no se puede ni elegir para transferir, y sin consentimiento nada viaja', async () => {
    const solicitud = await pedirApoyo();
    await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: jalisco.id,
      note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral.',
    });
    const abierto = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      reason: 'Hay plazo para impugnar el despido y hace falta expediente.',
    });
    expect(abierto.ok, abierto.ok ? '' : abierto.error.message).toBe(true);
    if (!abierto.ok) return;

    await addParticipant(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      personId: laPersona.personId,
      role: 'APPLICANT',
      reason: 'Es quien escribió pidiendo ayuda, ya identificada en el padrón.',
    });

    const reservada = await sendMessage(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      audience: 'SUPERVISION_ONLY',
      body: 'Duda sobre cómo se llevó la primera entrevista. Lo reviso con la coordinación.',
    });
    expect(reservada.ok).toBe(true);

    // Lo reservado no está entre lo transferible: no se esconde al enviar, es
    // que no se puede elegir.
    const conNotas = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'El acompañamiento de la niña le toca a la asociación civil.',
      explanationShownToPerson:
        'Vamos a pasarle a la asociación civil lo que nos contaste y cómo localizarte, para el acompañamiento de tu hija.',
      sharedFields: ['folio', 'notas_reservadas'] as never,
      sharedFileIds: [],
    });
    expect(conNotas.ok).toBe(false);

    // Y una canalización legítima se queda esperando el consentimiento.
    const propuesta = await proposeReferral(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      toModule: 'SOCIAL_ATTENTION',
      toLegalEntityId: alianzaId,
      reason: 'El acompañamiento de la niña le toca a la asociación civil.',
      explanationShownToPerson:
        'Vamos a pasarle a la asociación civil lo que nos contaste y cómo localizarte, para el acompañamiento de tu hija.',
      sharedFields: ['folio', 'resumen', 'contacto'],
      sharedFileIds: [],
    });
    expect(propuesta.ok, propuesta.ok ? '' : propuesta.error.message).toBe(true);
    if (!propuesta.ok) return;

    const fila = await base.prisma.referral.findUniqueOrThrow({
      where: { id: propuesta.data.referralId },
      select: { status: true, consentId: true, sentAt: true, sharedFields: true },
    });
    expect(fila.status).toBe('PROPOSED');
    expect(fila.consentId).toBeNull();
    expect(fila.sentAt).toBeNull();
    expect(fila.sharedFields).not.toContain('notas_reservadas');
  });
});

describe('F6-QA-004 · toda lectura sensible queda auditada', () => {
  it('abrir un expediente, leer un mensaje recibido y descargar un documento dejan rastro', async () => {
    const solicitud = await pedirApoyo();

    // 1. Leer un mensaje de la entrada pública.
    const leido = await requestDetail(await contextoDe(base.prisma, atiende), solicitud.id);
    expect(leido.ok, leido.ok ? '' : leido.error.message).toBe(true);

    await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'PRIORITY',
      territorialUnitId: jalisco.id,
      note: 'Es un despido con plazo para impugnar: lo lleva la asesoría laboral.',
    });
    const abierto = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      reason: 'Hay plazo para impugnar el despido y hace falta expediente.',
    });
    if (!abierto.ok) throw new Error(abierto.error.message);

    // 2. Abrir el expediente.
    const detalle = await caseDetail(await contextoDe(base.prisma, atiende), abierto.data.publicId);
    expect(detalle.ok, detalle.ok ? '' : detalle.error.message).toBe(true);

    // 3. Descargar un documento del expediente.
    const documento = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId: abierto.data.caseId,
      kind: 'EVIDENCE',
      description: 'Aviso de baja que entregó la empresa',
      originalFileName: 'baja.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      classification: 'RESTRICTED',
    });
    expect(documento.ok, documento.ok ? '' : documento.error.message).toBe(true);
    if (!documento.ok) return;
    const archivo = await base.prisma.caseDocument.findUniqueOrThrow({
      where: { id: documento.data.documentId },
      select: { fileObjectId: true },
    });
    const pase = await authorizeDownload(await contextoDe(base.prisma, atiende), archivo.fileObjectId);
    expect(pase.ok, pase.ok ? '' : pase.error.message).toBe(true);

    // Las tres lecturas constan, con quién y cuándo.
    const asientos = await base.prisma.auditEvent.findMany({
      where: {
        action: {
          in: [
            AUDIT_ACTIONS.SUPPORT_REQUEST_READ,
            AUDIT_ACTIONS.CASE_READ,
            AUDIT_ACTIONS.FILE_DOWNLOAD_AUTHORIZED,
          ],
        },
      },
      select: { action: true, actorId: true, occurredAt: true },
    });

    const acciones = new Set(asientos.map((asiento) => asiento.action));
    expect(acciones).toContain(AUDIT_ACTIONS.CASE_READ);
    expect(acciones).toContain(AUDIT_ACTIONS.FILE_DOWNLOAD_AUTHORIZED);
    expect(acciones).toContain(AUDIT_ACTIONS.SUPPORT_REQUEST_READ);
    for (const asiento of asientos) {
      expect(asiento.actorId).toBe(atiende.actorId);
      expect(asiento.occurredAt).not.toBeNull();
    }
  });
});

describe('F6-QA-005 · se deniega el acceso a territorios y expedientes ajenos', () => {
  it('un expediente de otro territorio no se abre ni aunque exista la asignación', async () => {
    const solicitud = await pedirApoyo();
    await confirmRouting(await contextoDe(base.prisma, atiende), {
      requestId: solicitud.id,
      legalEntity: 'FUERZA_INDIGO',
      urgency: 'ROUTINE',
      territorialUnitId: jalisco.id,
      note: 'Ocurre en Jalisco y lo lleva la delegación de allí.',
    });
    const abierto = await openCase(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      legalEntityId: fuerzaId,
      domain: 'UNION_DEFENSE',
      caseType: 'INDIVIDUAL_LABOR_DISPUTE',
      reason: 'Se abre el expediente del despido ocurrido en Jalisco.',
    });
    if (!abierto.ok) throw new Error(abierto.error.message);

    // Se fuerza la asignación en la base: es lo que quedaría si el alcance del
    // nombramiento se recortara **después** de asignar.
    await base.prisma.caseAssignment.create({
      data: {
        caseId: abierto.data.caseId,
        userId: delegadaNayarit.userId,
        assignmentRole: 'SUPPORT',
        assignedById: atiende.userId,
        createdByActorId: atiende.actorId,
        updatedByActorId: atiende.actorId,
      },
    });

    const ajeno = await caseDetail(await contextoDe(base.prisma, delegadaNayarit), abierto.data.publicId);
    expect(ajeno.ok).toBe(false);

    // Y quien no lleva el expediente ni es parte tampoco lo abre.
    const sinNada = await crearPersonaConCuenta(base.prisma, { givenName: 'Sin', familyName: 'Relación' });
    const nadie = await caseDetail(await contextoDe(base.prisma, sinNada), abierto.data.publicId);
    expect(nadie.ok).toBe(false);
  });
});

describe('F6-QA-006 · los casos urgentes muestran rutas humanas y de emergencia configuradas', () => {
  it('el protocolo sale del gestor de contenidos y se enseña en los tipos de riesgo', () => {
    // La lista de tipos que muestran el protocolo es un dato del dominio, y la
    // pantalla pública la consulta: no es una condición escrita en el JSX.
    expect(TIPOS_QUE_MUESTRAN_EL_PROTOCOLO).toContain('VIOLENCE_OR_URGENCY');
    expect(TIPOS_QUE_MUESTRAN_EL_PROTOCOLO).toContain('PSYCHOSOCIAL_RISK');
  });

  it('la marca de riesgo devuelve el protocolo configurado y guarda cuál se enseñó', async () => {
    const protocolo = await protocoloDeRiesgo();
    expect(protocolo).not.toBeNull();
    // Rutas humanas configuradas, no escritas en el código.
    expect(protocolo?.cuerpo).toContain('Guardia de acompañamiento');

    const solicitud = await pedirApoyo('VIOLENCE_OR_URGENCY');

    // Quien está nombrada en el sindicato no marca un mensaje dirigido a la
    // asociación civil: son dos personas morales, y eso no cambia porque el
    // asunto sea urgente.
    const desdeLaOtraEntidad = await raiseEmergency(await contextoDe(base.prisma, atiende), {
      supportRequestId: solicitud.id,
      riskKind: 'VIOLENCE',
      note: 'Intento de marcar riesgo en un mensaje dirigido a la otra entidad.',
    });
    expect(desdeLaOtraEntidad.ok).toBe(false);

    const marcada = await raiseEmergency(await contextoDe(base.prisma, atiendeEnAlianza), {
      supportRequestId: solicitud.id,
      riskKind: 'VIOLENCE',
      note: 'Dice que la amenazaron esta mañana y no tiene a dónde ir esta noche.',
    });
    expect(marcada.ok, marcada.ok ? '' : marcada.error.message).toBe(true);
    if (!marcada.ok) return;

    expect(marcada.data.protocolo.cuerpo).toContain('911');

    const fila = await base.prisma.emergencyFlag.findUniqueOrThrow({
      where: { id: marcada.data.flagId },
      select: { protocolShown: { select: { slug: true } }, supportRequestId: true },
    });
    expect(fila.protocolShown.slug).toBe(RUTA_DEL_PROTOCOLO_DE_RIESGO);
    expect(fila.supportRequestId).toBe(solicitud.id);
  });
});
