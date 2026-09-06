import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './helpers/database';
import { contextoDe, crearPersonaConCuenta, entidadPrincipal, nombrar, type PersonaDePrueba } from './helpers/fixtures';
import { confirmRouting, PUBLIC_INTAKE_NOTICE_CODE, submitRequest } from '@/modules/support';
import { addParticipant, assignCase, attachDocument, caseDetail, openCase, removeDocument } from '@/modules/cases';
import { authorizeDownload } from '@/platform/files';
import { withReason } from '@/platform/kernel/actor-context';

/**
 * Documentos con clasificación de sensibilidad y descarga autorizada
 * (PRD §10.2, §10.3; F6-CAS-009).
 *
 * Cinco promesas que se comprueban ejecutando:
 *
 *  · La clasificación **la fija la clase** cuando la clase la determina: una
 *    identificación es dato personal sensible, siempre.
 *  · El compartimento del archivo sale del **expediente**, no de una constante:
 *    un documento de defensa sindical no es del personal de atención social.
 *  · **Estar a cargo abre; el área, no.** La puerta de descarga recibe la sonda
 *    de asignación del expediente.
 *  · Los **datos clínicos** exigen la autorización expresa del PRD §10.3, y esa
 *    autorización exige motivo escrito.
 *  · Quien es parte **ve lo suyo**, no el trabajo interno del equipo.
 */

let base: TestDatabase;
let fuerzaId: string;
let atiende: PersonaDePrueba;
let delegada: PersonaDePrueba;
let socialDeAlianza: PersonaDePrueba;
let laPersona: PersonaDePrueba;

const CONTEXTO = { correlationId: 'prueba-documentos', ipHash: 'huella-de-documentos' };

const RELATO =
  'Me despidieron el lunes después de pedir por escrito un ajuste razonable por mi condición. Llevo cuatro años en la empresa y nunca tuve una amonestación.';

/** Un PDF mínimo, con su firma real: el servicio comprueba que el contenido corresponda al tipo. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);

beforeAll(async () => {
  base = await createTestDatabase('documentos');
  await base.seed();
  fuerzaId = await entidadPrincipal(base.prisma);
  const alianzaId = (
    await base.prisma.legalEntity.findFirstOrThrow({ where: { code: 'ALIANZA_INDIGO' }, select: { id: true } })
  ).id;

  const quienNombra = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Nombra' });
  atiende = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Atiende' });
  // La delegación lleva expedientes y **no** tiene la facultad clínica.
  delegada = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Apoya' });
  socialDeAlianza = await crearPersonaConCuenta(base.prisma, { givenName: 'Personal', familyName: 'Social' });
  laPersona = await crearPersonaConCuenta(base.prisma, { givenName: 'Quien', familyName: 'Pidió Ayuda' });

  await nombrar(base.prisma, {
    userId: atiende.userId,
    roleCode: 'EXECUTIVE_SECRETARY',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: delegada.userId,
    roleCode: 'TERRITORIAL_DELEGATE',
    grantedById: quienNombra.userId,
    legalEntityId: fuerzaId,
  });
  await nombrar(base.prisma, {
    userId: socialDeAlianza.userId,
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
}, 180_000);

afterAll(async () => {
  await base?.destroy();
});

beforeEach(async () => {
  for (const tabla of [
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
});

/** Abre un expediente sindical con equipo y con la persona como participante. */
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
    userId: delegada.userId,
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

/** Agrega un documento y devuelve su fila y el archivo que lo respalda. */
async function agregar(
  caseId: string,
  kind: 'EVIDENCE' | 'IDENTIFICATION' | 'MEDICAL_OR_CLINICAL' | 'INTERNAL_WORKING',
  opciones: { visibleToPerson?: boolean; classification?: 'INTERNAL' | 'RESTRICTED' } = {},
): Promise<{ documentId: string; fileObjectId: string }> {
  const agregado = await attachDocument(await contextoDe(base.prisma, atiende), {
    caseId,
    kind,
    description: `Documento de prueba de clase ${kind}`,
    originalFileName: 'documento.pdf',
    mimeType: 'application/pdf',
    content: PDF,
    ...(opciones.classification === undefined ? {} : { classification: opciones.classification }),
    ...(opciones.visibleToPerson === undefined ? {} : { visibleToPerson: opciones.visibleToPerson }),
  });
  if (!agregado.ok) throw new Error(agregado.error.message);

  const fila = await base.prisma.caseDocument.findUniqueOrThrow({
    where: { id: agregado.data.documentId },
    select: { fileObjectId: true },
  });
  return { documentId: agregado.data.documentId, fileObjectId: fila.fileObjectId };
}

describe('la clasificación la fija la clase, no quien sube', () => {
  it('una identificación se guarda como dato personal sensible aunque se pida otra cosa', async () => {
    const { caseId } = await abrir();

    const agregado = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId,
      kind: 'IDENTIFICATION',
      description: 'Credencial de elector de quien pidió la ayuda',
      originalFileName: 'ine.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      // Se pide «interno» a propósito: la clase manda.
      classification: 'INTERNAL',
    });
    expect(agregado.ok, agregado.ok ? '' : agregado.error.message).toBe(true);
    if (!agregado.ok) return;

    const fila = await base.prisma.caseDocument.findUniqueOrThrow({
      where: { id: agregado.data.documentId },
      select: { fileObject: { select: { classification: true, contextKind: true, contextId: true } } },
    });
    expect(fila.fileObject.classification).toBe('SENSITIVE_PERSONAL');
    // Y se guardó como archivo **de este expediente**: sin eso, la puerta de
    // descarga no sabría de qué caso es.
    expect(fila.fileObject.contextKind).toBe('CASE');
    expect(fila.fileObject.contextId).toBe(caseId);
  });

  it('una clase que no la fija exige elegirla, y no admite pública', async () => {
    const { caseId } = await abrir();

    const sinElegir = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId,
      kind: 'EVIDENCE',
      description: 'Fotografía del aviso de baja pegado en el tablero',
      originalFileName: 'prueba.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      classification: null,
    });
    expect(sinElegir.ok).toBe(false);

    const publica = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId,
      kind: 'EVIDENCE',
      description: 'Fotografía del aviso de baja pegado en el tablero',
      originalFileName: 'prueba.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      classification: 'PUBLIC' as never,
    });
    expect(publica.ok).toBe(false);
  });

  it('el trabajo interno del equipo no se le enseña a la persona', async () => {
    const { caseId } = await abrir();

    const intento = await attachDocument(await contextoDe(base.prisma, atiende), {
      caseId,
      kind: 'INTERNAL_WORKING',
      description: 'Borrador de la estrategia y notas de la reunión del equipo',
      originalFileName: 'notas.pdf',
      mimeType: 'application/pdf',
      content: PDF,
      visibleToPerson: true,
    });
    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.message).toContain('no se le enseña a la persona');
  });
});

describe('la puerta de descarga sabe de qué expediente es', () => {
  it('quien lleva el expediente abre su documento', async () => {
    const { caseId } = await abrir();
    const { fileObjectId } = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED' });

    const pase = await authorizeDownload(await contextoDe(base.prisma, delegada), fileObjectId);
    expect(pase.ok, pase.ok ? '' : pase.error.message).toBe(true);
    if (pase.ok) expect(pase.data.path).toContain('/api/v1/files/');
  });

  it('el personal de atención social no abre un documento de defensa sindical', async () => {
    const { caseId } = await abrir();
    const { fileObjectId } = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED' });

    // Antes, el servicio fijaba el compartimento `SOCIAL` para todo archivo de
    // caso: un documento sindical quedaba al alcance de quien no lo lleva.
    const intento = await authorizeDownload(await contextoDe(base.prisma, socialDeAlianza), fileObjectId);
    expect(intento.ok).toBe(false);
  });

  it('quien tiene la facultad pero no lleva el expediente tampoco lo abre', async () => {
    const { caseId } = await abrir();
    const { fileObjectId } = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED' });

    // Se le retira la asignación: la facultad sigue, el expediente ya no.
    await base.prisma.caseAssignment.updateMany({
      where: { caseId, userId: delegada.userId },
      data: { unassignedAt: new Date(), unassignReason: 'Deja de llevar el expediente.' },
    });

    const intento = await authorizeDownload(await contextoDe(base.prisma, delegada), fileObjectId);
    expect(intento.ok).toBe(false);
  });
});

describe('los datos clínicos exigen autorización expresa y motivo', () => {
  it('quien no tiene la facultad clínica no abre el diagnóstico, aunque lleve el expediente', async () => {
    const { caseId } = await abrir();
    const identificacion = await agregar(caseId, 'IDENTIFICATION');
    const diagnostico = await agregar(caseId, 'MEDICAL_OR_CLINICAL');

    // La delegación **sí** abre material sensible de su función: una
    // identificación se guarda igual de reservada que un diagnóstico. Esto es
    // lo que aísla la regla: lo que la detiene abajo no es la sensibilidad del
    // archivo, es que un diagnóstico exige autorización expresa (PRD §10.3).
    const motivo = withReason(
      await contextoDe(base.prisma, delegada),
      'Hay que cotejar la identificación con lo que declaró al pedir ayuda.',
    );
    const abreLaIdentificacion = await authorizeDownload(motivo, identificacion.fileObjectId);
    expect(abreLaIdentificacion.ok, abreLaIdentificacion.ok ? '' : abreLaIdentificacion.error.message).toBe(true);

    const intento = await authorizeDownload(
      withReason(await contextoDe(base.prisma, delegada), 'Quiero ver qué dice el informe médico del expediente.'),
      diagnostico.fileObjectId,
    );
    expect(intento.ok).toBe(false);

    // Y queda asentado como acceso denegado a algo delicado, no como un error.
    const incidencias = await base.prisma.securityEvent.count({ where: { kind: 'FILE_ACCESS_DENIED' } });
    expect(incidencias).toBeGreaterThan(0);
  });

  it('quien la tiene tampoco lo abre sin escribir por qué', async () => {
    const { caseId } = await abrir();
    const { fileObjectId } = await agregar(caseId, 'MEDICAL_OR_CLINICAL');

    const sinMotivo = await authorizeDownload(await contextoDe(base.prisma, atiende), fileObjectId);
    expect(sinMotivo.ok).toBe(false);

    const conMotivo = await authorizeDownload(
      withReason(
        await contextoDe(base.prisma, atiende),
        'Hay que valorar si el diagnóstico sostiene la solicitud de ajuste razonable que se negó.',
      ),
      fileObjectId,
    );
    expect(conMotivo.ok, conMotivo.ok ? '' : conMotivo.error.message).toBe(true);
  });

  it('un documento que no es clínico no pide motivo', async () => {
    const { caseId } = await abrir();
    const { fileObjectId } = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED' });

    const pase = await authorizeDownload(await contextoDe(base.prisma, atiende), fileObjectId);
    expect(pase.ok, pase.ok ? '' : pase.error.message).toBe(true);
  });
});

describe('quien es parte ve lo suyo, no el trabajo del equipo', () => {
  it('en su expediente solo figuran los documentos que se le enseñan', async () => {
    const { caseId, publicId } = await abrir();
    await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED', visibleToPerson: true });
    await agregar(caseId, 'INTERNAL_WORKING');

    const suyo = await caseDetail(await contextoDe(base.prisma, laPersona), publicId);
    expect(suyo.ok, suyo.ok ? '' : suyo.error.message).toBe(true);
    if (!suyo.ok) return;

    expect(suyo.data.documentos).toHaveLength(1);
    expect(suyo.data.documentos[0]?.clase).toBe('EVIDENCE');

    // Y el equipo los ve los dos.
    const delEquipo = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(delEquipo.ok).toBe(true);
    if (delEquipo.ok) expect(delEquipo.data.documentos).toHaveLength(2);
  });

  it('y tampoco los descarga: la puerta comprueba lo mismo que la pantalla', async () => {
    const { caseId } = await abrir();
    const suyo = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED', visibleToPerson: true });
    const interno = await agregar(caseId, 'INTERNAL_WORKING');

    const propio = await authorizeDownload(await contextoDe(base.prisma, laPersona), suyo.fileObjectId);
    expect(propio.ok, propio.ok ? '' : propio.error.message).toBe(true);

    const ajeno = await authorizeDownload(await contextoDe(base.prisma, laPersona), interno.fileObjectId);
    expect(ajeno.ok).toBe(false);
  });

  it('retirar un documento le quita también la vista, y el archivo se conserva', async () => {
    const { caseId, publicId } = await abrir();
    const documento = await agregar(caseId, 'EVIDENCE', { classification: 'RESTRICTED', visibleToPerson: true });

    const retirado = await removeDocument(await contextoDe(base.prisma, atiende), {
      documentId: documento.documentId,
      reason: 'Se subió por error el documento de otro expediente y hay que quitarlo.',
    });
    expect(retirado.ok, retirado.ok ? '' : retirado.error.message).toBe(true);

    const fila = await base.prisma.caseDocument.findUniqueOrThrow({
      where: { id: documento.documentId },
      select: { removedAt: true, visibleToPerson: true, removeReason: true },
    });
    expect(fila.removedAt).not.toBeNull();
    expect(fila.visibleToPerson).toBe(false);
    expect(fila.removeReason).toContain('por error');

    // El archivo sigue existiendo: borrarlo desde la pantalla de un caso sería
    // la forma discreta de destruir prueba.
    const archivo = await base.prisma.fileObject.findUniqueOrThrow({
      where: { id: documento.fileObjectId },
      select: { deletedAt: true },
    });
    expect(archivo.deletedAt).toBeNull();

    // Y deja de figurar en el expediente para todo el mundo.
    const despues = await caseDetail(await contextoDe(base.prisma, atiende), publicId);
    expect(despues.ok).toBe(true);
    if (despues.ok) expect(despues.data.documentos).toHaveLength(0);
  });
});
